// MV3 background service worker — owns sidePanel behavior, alarms heartbeat, badge, and startup recovery.
// No persistent process; use durable chrome.storage + wall-clock reconstruction.

const TICK_ALARM = 'goalflow-tick';
const BADGE_ALARM = 'goalflow-badge';

async function ensureDemo(tasksKey = 'goalflow.demo.tasks.v1'): Promise<void> {
  try {
    const g: any = globalThis as any;
    const result = await g.chrome?.storage?.local?.get?.(tasksKey);
    if (result && result[tasksKey]) return;
    // seed is handled by DemoCurrentTaskProvider on demand; nothing to do here.
  } catch { /* ignore */ }
}

function remainingFrom(state: any, now: number): number {
  if (!state || state.phase !== 'active' || typeof state.startedAt !== 'number' || typeof state.plannedDurationSeconds !== 'number') return 0;
  const elapsed = Math.floor((now - state.startedAt) / 1000);
  return Math.max(0, state.plannedDurationSeconds - Math.max(0, elapsed));
}

async function updateBadge(): Promise<void> {
  try {
    const g: any = globalThis as any;
    if (!g.chrome?.storage?.local || !g.chrome?.action?.setBadgeText) return;
    const raw = await g.chrome.storage.local.get('goalflow.focus.session.v1');
    const serialized = raw['goalflow.focus.session.v1'];
    if (!serialized) {
      await g.chrome.action.setBadgeText({ text: '' });
      return;
    }
    let state: any;
    try { state = JSON.parse(typeof serialized === 'string' ? serialized : JSON.stringify(serialized)); } catch { return; }
    if (state.phase !== 'active') {
      await g.chrome.action.setBadgeText({ text: '' });
      return;
    }
    const remaining = remainingFrom(state, Date.now());
    // Show m remaining or mm:ss collapsed? Badge limited to 4 chars — show minutes.
    const text = remaining > 0 ? String(Math.ceil(remaining / 60)) + 'm' : '0m';
    await g.chrome.action.setBadgeBackgroundColor({ color: '#5B5BD6' });
    await g.chrome.action.setBadgeText({ text });
  } catch { /* best effort */ }
}

self.addEventListener('install', () => {
  // @ts-ignore
  (self as any).skipWaiting?.();
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil?.((async () => {
    try {
      const g: any = globalThis as any;
      if (g.chrome?.sidePanel?.setPanelBehavior) {
        await g.chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      }
    } catch {}
    await ensureDemo();
    try {
      const g: any = globalThis as any;
      if (g.chrome?.alarms?.create) {
        await g.chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
        await g.chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 1 });
      }
    } catch {}
  })());
});

// sidePanel behavior on startup (MV3 service_worker restarts)
(async () => {
  try {
    const g: any = globalThis as any;
    if (g.chrome?.sidePanel?.setPanelBehavior) {
      await g.chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
    if (g.chrome?.alarms?.create) {
      await g.chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
      await g.chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 1 });
    }
  } catch {}
})();

try {
  const g: any = globalThis as any;
  g.chrome?.alarms?.onAlarm?.addListener((alarm: any) => {
    if (alarm.name === TICK_ALARM || alarm.name === BADGE_ALARM) {
      updateBadge();
    }
  });
  g.chrome?.runtime?.onMessage?.addListener((msg: any, _sender: any, sendResponse: any) => {
    if (msg?.type === 'GOALFLOW_ACTION' || msg?.type === 'GOALFLOW_CLEAR') {
      updateBadge().then(() => sendResponse?.({ ok: true }));
      return true;
    }
    if (msg?.type === 'GOALFLOW_GET_STATE') {
      (async () => {
        const raw = await g.chrome.storage.local.get('goalflow.focus.session.v1');
        sendResponse({ stateRaw: raw['goalflow.focus.session.v1'] ?? null });
      })();
      return true;
    }
  });
  g.chrome?.storage?.onChanged?.addListener((changes: any, area: string) => {
    if (area === 'local' && changes['goalflow.focus.session.v1']) {
      updateBadge();
    }
  });
  g.chrome?.action?.onClicked?.addListener(async (tab: any) => {
    try {
      if (g.chrome?.sidePanel?.open) {
        await g.chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch {}
  });
} catch {}

export {};
