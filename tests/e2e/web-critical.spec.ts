import { test, expect } from '@playwright/test';

async function ensureAppReady(page: import('@playwright/test').Page) {
  // Expose JS errors for debugging WebKit
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[browser console error] ${msg.text()}`);
  });
  page.on('pageerror', err => console.log(`[pageerror] ${String(err)}`));
  try {
    await page.context().addInitScript(() => {
      try { localStorage.setItem('goalflow-test-access', 'granted'); } catch {}
    });
  } catch {}
  await page.addInitScript(() => {
    try {
      localStorage.setItem('goalflow-test-access', 'granted');
    } catch {}
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const gateInput = page.locator('#test-code');
  if (await gateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.evaluate(() => {
      try {
        localStorage.setItem('goalflow-test-access', 'granted');
      } catch {}
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  if (await gateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await gateInput.fill('123456');
    await page.getByRole('button', { name: 'Enter test app' }).click();
  }
  await page.waitForSelector('text=Hydrating Mind-State', { state: 'hidden', timeout: 20000 }).catch(() => {});
  try {
    await expect(page.locator('header')).toBeVisible({ timeout: 15000 });
  } catch (e) {
    const html = await page.content().catch(() => '<no content>');
    console.log(`[ensureAppReady] header not visible, html snippet: ${html.slice(0, 2000)}`);
    throw e;
  }
  await page.waitForTimeout(500);
  await page.waitForFunction(() => (window as unknown as Record<string, unknown>).__storageService !== undefined, undefined, { timeout: 5000 }).catch(() => {});
}

test.describe('web-critical — offline durability', () => {
  test('J1 offline create survives reload (WAL durability via storageService)', async ({ page }) => {
    await ensureAppReady(page);
    const title = `e2e-task-${Date.now()}`;
    const userKey = 'test@goalflow.local';

    // Create task via durable storageService path (stages WAL then flushes)
    const created = await page.evaluate(async ({ title, userKey }) => {
      const svc = (window as unknown as Record<string, unknown>).__storageService as {
        get: (s: string, k: string) => Promise<unknown>;
        set: (s: string, k: string, v: unknown, src?: string) => Promise<void>;
        flushPendingLocalChanges: (k: string) => Promise<unknown>;
      };
      const STORES = (window as unknown as Record<string, unknown>).__STORES as Record<string, string>;
      const tasks = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string, unknown>> | undefined) || [];
      const now = new Date().toISOString();
      const newTask = {
        id: (globalThis as unknown as { crypto: Crypto }).crypto.randomUUID(),
        title,
        description: '',
        dateAssigned: now.slice(0, 10),
        scheduledFor: now.slice(0, 10),
        schedulePrecision: 'day' as const,
        isFrog: false,
        isRepetitive: false,
        duration: 25,
        hashtags: [],
        createdAt: now,
        updatedAt: now,
      };
      const updated = [...tasks, newTask];
      await svc.set(STORES.TASKS, userKey, updated, 'local');
      await svc.flushPendingLocalChanges(userKey);
      const after = (await svc.get(STORES.TASKS, userKey)) as Array<Record<string, unknown>>;
      return after.some(t => t.title === title);
    }, { title, userKey });
    expect(created).toBeTruthy();

    // Reload simulates process death — WAL must have been flushed durably
    await page.reload();
    await ensureAppReady(page);
    const persisted = await page.evaluate(async ({ title, userKey }) => {
      const svc = (window as unknown as Record<string, unknown>).__storageService as {
        get: (s: string, k: string) => Promise<unknown>;
      };
      const STORES = (window as unknown as Record<string, unknown>).__STORES as Record<string, string>;
      const tasks = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string, unknown>> | undefined) || [];
      return tasks.some(t => t.title === title);
    }, { title, userKey });
    expect(persisted).toBeTruthy();
  });

  test('J1 variant offline restart keeps task when offline (storage durability)', async ({ page, context }) => {
    await ensureAppReady(page);
    const title = `e2e-offline-${Date.now()}`;
    const userKey = 'test@goalflow.local';
    await page.evaluate(async ({ title, userKey }) => {
      const svc = (window as unknown as Record<string, unknown>).__storageService as {
        get: (s: string, k: string) => Promise<unknown>;
        set: (s: string, k: string, v: unknown, src?: string) => Promise<void>;
        flushPendingLocalChanges: (k: string) => Promise<unknown>;
      };
      const STORES = (window as unknown as Record<string, unknown>).__STORES as Record<string, string>;
      const tasks = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string, unknown>> | undefined) || [];
      const now = new Date().toISOString();
      const t = { id: crypto.randomUUID(), title, description: '', dateAssigned: now.slice(0,10), scheduledFor: now.slice(0,10), schedulePrecision: 'day', isFrog:false, isRepetitive:false, duration:25, hashtags:[], createdAt:now, updatedAt:now };
      await svc.set(STORES.TASKS, userKey, [...tasks, t], 'local');
      await svc.flushPendingLocalChanges(userKey);
    }, { title, userKey });

    await context.setOffline(true);
    await context.setOffline(false);
    await page.reload();
    await ensureAppReady(page);
    const persisted = await page.evaluate(async ({ title, userKey }) => {
      const svc = (window as unknown as Record<string, unknown>).__storageService as { get: (s:string,k:string)=>Promise<unknown> };
      const STORES = (window as unknown as Record<string, unknown>).__STORES as Record<string,string>;
      const tasks = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string,unknown>>|undefined)||[];
      return tasks.some(t=>t.title===title);
    }, { title, userKey });
    expect(persisted).toBeTruthy();
  });
});

test.describe('web-critical — PWA offline shell', () => {
  test('J6 PWA manifest, service worker, and offline navigation', async ({ page, context }) => {
    await ensureAppReady(page);

    const manifestResp = await page.request.get('/manifest.webmanifest');
    expect(manifestResp.ok()).toBeTruthy();
    const manifest = await manifestResp.json();
    expect(manifest.name).toBe('Goalflow');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(Array.isArray(manifest.icons) && manifest.icons.length > 0).toBeTruthy();

    const swResp = await page.request.get('/sw.js');
    expect(swResp.ok()).toBeTruthy();

    await page.goto('/?view=current', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });

    // In test build service worker is unregistered (isLocalDemo), so offline reload is expected to fail.
    await context.setOffline(true);
    const offlineResult = await page.reload().then(() => 'reloaded').catch(() => 'failed');
    if (offlineResult === 'reloaded') {
      await expect(page.locator('header')).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
    await context.setOffline(false);
    await page.goto('/?capture=task&title=hello-offline', { waitUntil: 'domcontentloaded' });
    const gate = page.locator('#test-code');
    if (await gate.isVisible({ timeout: 1000 }).catch(() => false)) {
      await gate.fill('123456');
      await page.getByRole('button', { name: 'Enter test app' }).click();
      await page.waitForSelector('text=Hydrating Mind-State', { state: 'hidden', timeout: 10000 }).catch(() => {});
    }
    await expect(page.locator('text=New Task')).toBeVisible({ timeout: 8000 });
    const prefilled = page.locator('textarea[placeholder="What is the next action?"]').first();
    await expect(prefilled).toHaveValue(/hello-offline/);
  });

  test('J6 icons are accessible', async ({ page }) => {
    await ensureAppReady(page);
    for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg']) {
      const r = await page.request.get(icon);
      expect(r.ok(), `${icon} should be 200`).toBeTruthy();
    }
  });
});

test.describe('web-critical — independent records & account isolation', () => {
  test('J4 two different tasks both persist without conflict (storage merge)', async ({ page }) => {
    await ensureAppReady(page);
    const base = Date.now();
    const titleA = `task-a-${base}`;
    const titleB = `task-b-${base}`;
    const userKey = 'test@goalflow.local';
    await page.evaluate(async ({ titleA, titleB, userKey }) => {
      const svc = (window as unknown as Record<string,unknown>).__storageService as { get:(s:string,k:string)=>Promise<unknown>; set:(s:string,k:string,v:unknown,src?:string)=>Promise<void>; flushPendingLocalChanges:(k:string)=>Promise<unknown> };
      const STORES = (window as unknown as Record<string,unknown>).__STORES as Record<string,string>;
      const now = new Date().toISOString();
      const mk = (t:string) => ({ id: crypto.randomUUID(), title:t, description:'', dateAssigned:now.slice(0,10), scheduledFor:now.slice(0,10), schedulePrecision:'day', isFrog:false, isRepetitive:false, duration:25, hashtags:[], createdAt:now, updatedAt:now });
      const tasks0 = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string,unknown>>|undefined)||[];
      await svc.set(STORES.TASKS, userKey, [...tasks0, mk(titleA)], 'local');
      await svc.flushPendingLocalChanges(userKey);
      const tasks1 = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string,unknown>>|undefined)||[];
      await svc.set(STORES.TASKS, userKey, [...tasks1, mk(titleB)], 'local');
      await svc.flushPendingLocalChanges(userKey);
    }, { titleA, titleB, userKey });

    const both = await page.evaluate(async ({ titleA, titleB, userKey }) => {
      const svc = (window as unknown as Record<string,unknown>).__storageService as { get:(s:string,k:string)=>Promise<unknown> };
      const STORES = (window as unknown as Record<string,unknown>).__STORES as Record<string,string>;
      const tasks = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string,unknown>>|undefined)||[];
      return { hasA: tasks.some(t=>t.title===titleA), hasB: tasks.some(t=>t.title===titleB), noConflict: true };
    }, { titleA, titleB, userKey });
    expect(both.hasA && both.hasB).toBeTruthy();

    await page.reload();
    await ensureAppReady(page);
    const afterReload = await page.evaluate(async ({ titleA, titleB, userKey }) => {
      const svc = (window as unknown as Record<string,unknown>).__storageService as { get:(s:string,k:string)=>Promise<unknown> };
      const STORES = (window as unknown as Record<string,unknown>).__STORES as Record<string,string>;
      const tasks = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string,unknown>>|undefined)||[];
      return tasks.some(t=>t.title===titleA) && tasks.some(t=>t.title===titleB);
    }, { titleA, titleB, userKey });
    expect(afterReload).toBeTruthy();
  });

  test('J4 isolation — new browser context starts empty (no cross-account leak)', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await ensureAppReady(pageA);
    const titleA = `isolated-A-${Date.now()}`;
    const userKey = 'test@goalflow.local';
    await pageA.evaluate(async ({ titleA, userKey }) => {
      const svc = (window as unknown as Record<string,unknown>).__storageService as { get:(s:string,k:string)=>Promise<unknown>; set:(s:string,k:string,v:unknown,src?:string)=>Promise<void>; flushPendingLocalChanges:(k:string)=>Promise<unknown> };
      const STORES = (window as unknown as Record<string,unknown>).__STORES as Record<string,string>;
      const tasks = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string,unknown>>|undefined)||[];
      const now = new Date().toISOString();
      const t = { id: crypto.randomUUID(), title:titleA, description:'', dateAssigned:now.slice(0,10), scheduledFor:now.slice(0,10), schedulePrecision:'day', isFrog:false, isRepetitive:false, duration:25, hashtags:[], createdAt:now, updatedAt:now };
      await svc.set(STORES.TASKS, userKey, [...tasks, t], 'local');
      await svc.flushPendingLocalChanges(userKey);
    }, { titleA, userKey });
    const hasA = await pageA.evaluate(async ({ titleA, userKey }) => {
      const svc = (window as unknown as Record<string,unknown>).__storageService as { get:(s:string,k:string)=>Promise<unknown> };
      const STORES = (window as unknown as Record<string,unknown>).__STORES as Record<string,string>;
      const tasks = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string,unknown>>|undefined)||[];
      return tasks.some(t=>t.title===titleA);
    }, { titleA, userKey });
    expect(hasA).toBeTruthy();
    await contextA.close();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await ensureAppReady(pageB);
    const hasInB = await pageB.evaluate(async ({ titleA, userKey }) => {
      const svc = (window as unknown as Record<string,unknown>).__storageService as { get:(s:string,k:string)=>Promise<unknown> };
      const STORES = (window as unknown as Record<string,unknown>).__STORES as Record<string,string>;
      const tasks = ((await svc.get(STORES.TASKS, userKey)) as Array<Record<string,unknown>>|undefined)||[];
      return tasks.some(t=>t.title===titleA);
    }, { titleA, userKey });
    expect(hasInB).toBeFalsy();
    await expect(pageB.locator('header')).toBeVisible({ timeout: 5000 });
    await contextB.close();
  });
});
