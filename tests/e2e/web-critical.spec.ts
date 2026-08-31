import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

async function unlockTestApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const gateInput = page.locator('#test-code');
  const header = page.locator('header');
  await expect(gateInput.or(header)).toBeVisible({ timeout: 20_000 });
  if (await gateInput.isVisible()) {
    await gateInput.fill('123456');
    await page.getByRole('button', { name: 'Enter test app' }).click();
  }
  await expect(header).toBeVisible({ timeout: 20_000 });
}

async function captureTodayTask(page: Page, title: string) {
  await page.goto(`/?capture=task&title=${encodeURIComponent(title)}`, { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog', { name: 'New Task' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByPlaceholder('What is the next action?')).toHaveValue(title);
  await dialog.locator('[aria-label="Task schedule"]').getByRole('button', { name: 'Today', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function openPlan(page: Page) {
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Today's Flow", exact: true })).toBeVisible();
}

const plannedTitles = (page: Page) => page.locator('[data-rfd-draggable-id] h4');

async function createIsolatedContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await unlockTestApp(page);
  return { context, page };
}

test.describe('web-critical — deterministic visible UI journey', () => {
  test('capture, schedule, reorder, confirm, complete, and reload persist exactly', async ({ page }, testInfo) => {
    await unlockTestApp(page);
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const firstTitle = `e2e-first-${suffix}`;
    const secondTitle = `e2e-second-${suffix}`;

    await captureTodayTask(page, firstTitle);
    await captureTodayTask(page, secondTitle);
    await openPlan(page);

    const titles = plannedTitles(page);
    await expect(titles).toHaveCount(2);
    const before = await titles.allTextContents();
    expect(new Set(before)).toEqual(new Set([firstTitle, secondTitle]));

    const movedTitle = before[1];
    const remainingTitle = before[0];
    const dragHandle = page.locator('[data-rfd-drag-handle-draggable-id]').filter({ hasText: movedTitle });
    await expect(dragHandle).toHaveCount(1);
    await dragHandle.focus();
    await dragHandle.press('Space');
    await dragHandle.press('ArrowUp');
    await dragHandle.press('Space');
    await expect(titles).toHaveText([movedTitle, remainingTitle]);

    await page.getByRole('button', { name: 'Start focus', exact: true }).click();
    await expect(page.getByRole('heading', { name: movedTitle, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const checkout = page.getByRole('dialog', { name: 'Check Out' });
    await expect(checkout).toBeVisible();
    await checkout.getByRole('button', { name: /Good Focus/ }).click();
    const sessionComplete = page.getByRole('dialog', { name: 'Session Complete' });
    await expect(sessionComplete).toBeVisible();
    await sessionComplete.getByRole('button', { name: /Continue Flowing/ }).click();
    await expect(page.getByRole('heading', { name: remainingTitle, exact: true })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByRole('heading', { name: remainingTitle, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: movedTitle, exact: true })).toHaveCount(0);

    await openPlan(page);
    await expect(plannedTitles(page)).toHaveText([remainingTitle]);
  });

  test('service worker controls the app and offline reload succeeds', async ({ page, context }) => {
    await unlockTestApp(page);
    const activeWorker = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Service worker did not become ready.')), 15_000))
      ]);
      return Boolean(registration.active);
    });
    expect(activeWorker).toBe(true);

    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('header')).toBeVisible();
    }
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('header')).toBeVisible({ timeout: 10_000 });
    await context.setOffline(false);
  });

  test('saved tasks are isolated between browser profiles', async ({ browser }, testInfo) => {
    const profileA = await createIsolatedContext(browser);
    const title = `profile-a-${testInfo.project.name}-${Date.now()}`;
    await captureTodayTask(profileA.page, title);
    await openPlan(profileA.page);
    await expect(profileA.page.getByText(title, { exact: true })).toBeVisible();

    const profileB = await createIsolatedContext(browser);
    await openPlan(profileB.page);
    await expect(profileB.page.getByText(title, { exact: true })).toHaveCount(0);

    await profileA.page.reload({ waitUntil: 'domcontentloaded' });
    await openPlan(profileA.page);
    await expect(profileA.page.getByText(title, { exact: true })).toBeVisible();
    await profileA.context.close();
    await profileB.context.close();
  });

  test('manifest, service worker, and required icons are served', async ({ page }) => {
    await unlockTestApp(page);
    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({
      name: 'Goalflow',
      short_name: 'Goalflow',
      display: 'standalone',
      start_url: '/',
      scope: '/'
    });

    const workerResponse = await page.request.get('/sw.js');
    expect(workerResponse.ok()).toBe(true);
    expect((await workerResponse.text()).length).toBeGreaterThan(100);

    for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png']) {
      const response = await page.request.get(icon);
      expect(response.ok(), `${icon} should be served`).toBe(true);
    }
  });
});

// Real account/RLS isolation is deliberately not represented by browser-profile isolation.
// It remains NOT RUN until two staging Supabase identities are available.
test.skip('real account/RLS isolation — NOT RUN (requires staging identities)', async () => {});
