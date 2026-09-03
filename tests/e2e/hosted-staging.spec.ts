import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

const secretEnvironmentNames = [
  'GOALFLOW_STAGING_SUPABASE_PUBLISHABLE_KEY',
  'GOALFLOW_STAGING_USER_A_EMAIL',
  'GOALFLOW_STAGING_USER_A_PASSWORD',
  'GOALFLOW_STAGING_USER_B_EMAIL',
  'GOALFLOW_STAGING_USER_B_PASSWORD'
] as const;

const setting = (name: typeof secretEnvironmentNames[number]): string => {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing required hosted browser setting: ${name}`);
  return value;
};

const secrets = secretEnvironmentNames.map(setting).sort((left, right) => right.length - left.length);
const diagnosticsByTest = new Map<string, string[]>();

const safeUrl = (raw: string): string => {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '<invalid-url>';
  }
};

const redactDiagnostic = (raw: string): string => {
  let value = raw
    .replace(/Bearer\s+\S+/gi, 'Bearer <redacted>')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<redacted-jwt>');
  for (const secret of secrets) value = value.split(secret).join('<redacted>');
  return value.slice(0, 2_000);
};

const observePage = (page: Page, testInfo: TestInfo, label: string) => {
  const diagnostics = diagnosticsByTest.get(testInfo.testId) ?? [];
  diagnosticsByTest.set(testInfo.testId, diagnostics);
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      diagnostics.push(`${label} console.${message.type()}: ${redactDiagnostic(message.text())}`);
    }
  });
  page.on('pageerror', error => diagnostics.push(`${label} pageerror: ${redactDiagnostic(error.message)}`));
  page.on('requestfailed', request => diagnostics.push(
    `${label} requestfailed: ${request.method()} ${safeUrl(request.url())} — ${redactDiagnostic(request.failure()?.errorText ?? 'unknown')}`
  ));
  page.on('response', response => {
    if (response.status() >= 400) {
      diagnostics.push(`${label} response: ${response.status()} ${safeUrl(response.url())}`);
    }
  });
};

const createAccountPage = async (
  browser: Browser,
  testInfo: TestInfo,
  label: string,
  email: string,
  password: string
): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  observePage(page, testInfo, label);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
  await expect(page.locator('header')).toBeVisible();
  return { context, page };
};

const waitForFreshDurableSync = async (page: Page) => {
  const state = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    let sawSyncing = false;
    const timeout = window.setTimeout(() => finish(new Error('A fresh sync cycle did not finish.')), 30_000);
    const retry = window.setInterval(() => window.dispatchEvent(new Event('goalflow:sync-retry')), 1_000);
    const finish = (error?: Error, result?: string) => {
      window.clearTimeout(timeout);
      window.clearInterval(retry);
      window.removeEventListener('goalflow:sync-state', onState);
      if (error) reject(error);
      else resolve(result ?? 'unknown');
    };
    const onState = (event: Event) => {
      const next = (event as CustomEvent<{ state?: string }>).detail?.state;
      if (next === 'syncing') {
        sawSyncing = true;
        return;
      }
      if (sawSyncing && ['synced', 'error', 'offline', 'conflict'].includes(String(next))) finish(undefined, next);
    };
    window.addEventListener('goalflow:sync-state', onState);
    window.dispatchEvent(new Event('goalflow:sync-retry'));
  }));
  expect(state, 'A fresh synchronization cycle must end in durable success').toBe('synced');
  await expect(page.getByRole('button', { name: 'Synced', exact: true })).toBeVisible();
};

const captureTodayTask = async (page: Page, title: string) => {
  await page.goto(`/?capture=task&title=${encodeURIComponent(title)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('header')).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'New Task' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder('What is the next action?')).toHaveValue(title);
  await dialog.locator('[aria-label="Task schedule"]').getByRole('button', { name: 'Today', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(dialog).toBeHidden();
};

const openPlan = async (page: Page) => {
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Today's Flow", exact: true })).toBeVisible();
};

const taskCard = (page: Page, title: string) =>
  page.locator('[data-rfd-draggable-id]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test.afterEach(async ({}, testInfo) => {
  const diagnostics = diagnosticsByTest.get(testInfo.testId) ?? [];
  await testInfo.attach('redacted-browser-diagnostics', {
    body: Buffer.from(diagnostics.length > 0 ? diagnostics.join('\n') : 'No browser warnings or errors captured.'),
    contentType: 'text/plain'
  });
  diagnosticsByTest.delete(testInfo.testId);
});

test('real browsers converge within one account and isolate a second account', async ({ browser }, testInfo) => {
  diagnosticsByTest.set(testInfo.testId, []);
  const contexts: BrowserContext[] = [];
  const originalTitle = `Hosted browser ${Date.now()} ${randomUUID().slice(0, 8)}`;
  const editedTitle = `${originalTitle} edited`;

  try {
    const firstA = await createAccountPage(
      browser, testInfo, 'user-a-browser-1',
      setting('GOALFLOW_STAGING_USER_A_EMAIL'), setting('GOALFLOW_STAGING_USER_A_PASSWORD')
    );
    contexts.push(firstA.context);
    await waitForFreshDurableSync(firstA.page);
    await captureTodayTask(firstA.page, originalTitle);
    await waitForFreshDurableSync(firstA.page);

    const secondA = await createAccountPage(
      browser, testInfo, 'user-a-browser-2',
      setting('GOALFLOW_STAGING_USER_A_EMAIL'), setting('GOALFLOW_STAGING_USER_A_PASSWORD')
    );
    contexts.push(secondA.context);
    await waitForFreshDurableSync(secondA.page);
    await openPlan(secondA.page);
    await expect(taskCard(secondA.page, originalTitle)).toHaveCount(1);

    const userB = await createAccountPage(
      browser, testInfo, 'user-b-browser',
      setting('GOALFLOW_STAGING_USER_B_EMAIL'), setting('GOALFLOW_STAGING_USER_B_PASSWORD')
    );
    contexts.push(userB.context);
    await waitForFreshDurableSync(userB.page);
    await openPlan(userB.page);
    await expect(userB.page.getByRole('heading', { name: originalTitle, exact: true })).toHaveCount(0);

    const card = taskCard(secondA.page, originalTitle);
    await card.hover();
    await card.getByTitle('Edit').click();
    const editDialog = secondA.page.getByRole('dialog', { name: 'Edit Task' });
    await editDialog.getByPlaceholder('What is the next action?').fill(editedTitle);
    await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editDialog).toBeHidden();
    await waitForFreshDurableSync(secondA.page);

    await firstA.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(firstA.page.locator('header')).toBeVisible();
    await waitForFreshDurableSync(firstA.page);
    await openPlan(firstA.page);
    await expect(taskCard(firstA.page, editedTitle)).toHaveCount(1);
    await expect(firstA.page.getByRole('heading', { name: originalTitle, exact: true })).toHaveCount(0);

    const editedCard = taskCard(secondA.page, editedTitle);
    await editedCard.hover();
    await editedCard.getByTitle('Delete').click();
    await expect(secondA.page.getByRole('heading', { name: editedTitle, exact: true })).toHaveCount(0);
    await waitForFreshDurableSync(secondA.page);

    await waitForFreshDurableSync(firstA.page);
    await expect(firstA.page.getByRole('heading', { name: editedTitle, exact: true })).toHaveCount(0);
    await waitForFreshDurableSync(userB.page);
    await expect(userB.page.getByRole('heading', { name: editedTitle, exact: true })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
