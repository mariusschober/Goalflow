import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FocusSessionStore } from '../services/FocusSessionStore';
import { DemoCurrentTaskProvider } from '../providers/DemoCurrentTaskProvider';
import { LocalActionGateway } from '../gateways/ActionGateway';
import { getTodayYYYYMMDD } from '../services/dateUtils';
import type { GoalflowTask, ExecutionState } from '../domain/types';
import { remainingSeconds, formatRemaining } from '../domain/types';
import { CircularProgress } from '../components/CircularProgress';
import { FrogBadge } from '../components/FrogBadge';

function todayStr(): string {
  return getTodayYYYYMMDD(new Date());
}

export function SidePanel() {
  const storeRef = useRef<FocusSessionStore>();
  const providerRef = useRef<DemoCurrentTaskProvider>();
  const gatewayRef = useRef<LocalActionGateway>();
  if (!storeRef.current) storeRef.current = new FocusSessionStore();
  if (!providerRef.current) providerRef.current = new DemoCurrentTaskProvider();
  if (!gatewayRef.current) gatewayRef.current = new LocalActionGateway();

  const [task, setTask] = useState<GoalflowTask | null>(null);
  const [execution, setExecution] = useState<ExecutionState | null>(null);
  const [tickNow, setTickNow] = useState<Date>(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    const today = todayStr();
    try {
      const [t, exec] = await Promise.all([
        providerRef.current!.fetchCurrent(today),
        storeRef.current!.load(),
      ]);
      setTask(t);

      if (exec && exec.phase === 'active') {
        // Validate task still matches and is still today/open
        const expectsId = exec.taskId;
        const head = t;
        if (!head || head.id !== expectsId || head.scheduledFor !== today || head.status !== 'open') {
          // Stale session — clear durably
          await storeRef.current!.clear();
          setExecution(null);
        } else {
          setExecution(exec);
        }
      } else {
        setExecution(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // corrupted store — surface but keep task
      if (msg.includes('corrupted')) {
        setError('Focus state corrupted — cleared. Nothing was lost.');
        try { await storeRef.current!.clear(); } catch {}
        setExecution(null);
      } else {
        setError(msg);
      }
    }
  }, []);

  useEffect(() => {
    load();
    // tick every 1s for remaining recompute
    const id = setInterval(() => setTickNow(new Date()), 1000);
    // react to storage changes (other panel instances / background)
    const g: any = globalThis as any;
    const listener = () => load();
    if (g.chrome?.storage?.onChanged) {
      g.chrome.storage.onChanged.addListener(listener);
    }
    // also listen to runtime messages for badge sync
    return () => {
      clearInterval(id);
      if (g.chrome?.storage?.onChanged?.removeListener) {
        try { g.chrome.storage.onChanged.removeListener(listener); } catch {}
      }
    };
  }, [load]);

  const isActive = execution?.phase === 'active';
  const plannedTotal = execution?.plannedDurationSeconds ?? (task ? (task.durationMinutes || 25) * 60 : 1500);
  const remaining = isActive && execution ? remainingSeconds(execution, tickNow) : plannedTotal;
  const activeRemainingFmt = formatRemaining(remaining);

  const handleAction = async () => {
    if (!task || isActive || isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      const now = new Date();
      const next = await gatewayRef.current!.start(task, now);
      await storeRef.current!.save(next);
      // notify background for badge
      try {
        const g: any = globalThis as any;
        await g.chrome?.runtime?.sendMessage?.({ type: 'GOALFLOW_ACTION', taskId: task.id });
      } catch {}
      setExecution(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setError(null);
    try {
      await storeRef.current!.clear();
      setExecution(null);
      try { const g: any = globalThis as any; await g.chrome?.runtime?.sendMessage?.({ type: 'GOALFLOW_CLEAR' }); } catch {}
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleToggleFrog = async () => {
    if (!task) return;
    await providerRef.current!.setFrogDemo(!task.isFrog);
    await load();
  };

  const handleResetDemo = async () => {
    await providerRef.current!.resetDemo(todayStr());
    await storeRef.current!.clear();
    setExecution(null);
    await load();
  };

  return (
    <div style={{ width: 380, maxWidth: '100vw', margin: '0 auto', minHeight: '100vh', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, letterSpacing: 1.2, fontWeight: 700, color: '#78716c', textTransform: 'uppercase' }}>Current</span>
        <span style={{ fontSize: 11, color: isActive ? '#10b981' : '#a8a29e', fontWeight: 600 }}>
          {isActive ? '● Focus' : 'Ready'}
        </span>
      </div>

      {/* error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '8px 10px', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* card */}
      <div style={{
        background: 'white',
        border: '1px solid #e7e5e4',
        borderRadius: 16,
        padding: 16,
        boxShadow: isActive ? '0 0 0 1px rgba(91,91,214,0.08), 0 8px 24px rgba(91,91,214,0.10)' : '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s ease',
      }}>
        {!task ? (
          <div style={{ padding: 12, color: '#78716c', fontSize: 14 }}>
            Nothing scheduled for today. Open Planning to choose your Current.
            <div style={{ marginTop: 8 }}><a href="https://goalflow.app" target="_blank" rel="noreferrer">Open Goalflow Web →</a></div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              {task.isFrog && <FrogBadge />}
              <span style={{ fontSize: 12, color: '#78716c', background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 999, padding: '2px 8px' }}>
                {task.durationMinutes} min
              </span>
              {task.tags.map(t => (
                <span key={t} style={{ fontSize: 11, color: '#57534e', background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 999, padding: '2px 7px' }}>{t}</span>
              ))}
            </div>

            <h1 style={{ margin: '4px 0 12px', fontSize: 20, lineHeight: 1.25, fontWeight: 700, letterSpacing: -0.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }} title={task.title}>
              {task.title}
            </h1>

            {/* timer hero */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
              <CircularProgress remaining={remaining} total={plannedTotal} size={72} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: isActive ? 40 : 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, lineHeight: 1 }}>
                  {isActive ? activeRemainingFmt : `${task.durationMinutes}:00`}
                </div>
                <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                  {isActive ? 'remaining — stay with it' : 'planned — press ACTION to start'}
                </div>
              </div>
            </div>

            {/* hero action */}
            {!isActive ? (
              <button
                onClick={handleAction}
                disabled={isSaving}
                style={{
                  marginTop: 16,
                  width: '100%',
                  background: isSaving ? '#a5b4fc' : '#5B5BD6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 999,
                  padding: '12px 16px',
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  cursor: isSaving ? 'wait' : 'pointer',
                  boxShadow: '0 4px 12px rgba(91,91,214,0.28)',
                }}
              >
                {isSaving ? 'Starting…' : 'ACTION'}
              </button>
            ) : (
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#065f46', borderRadius: 999, padding: '10px 14px', fontSize: 13, fontWeight: 600, textAlign: 'center' as const }}>
                  ● In focus — stay with it
                </div>
                <button onClick={handleClear} title="Clear active session (dev)" style={{ background: 'white', border: '1px solid #e7e5e4', borderRadius: 999, padding: '8px 10px', fontSize: 12, cursor: 'pointer' }}>Clear</button>
              </div>
            )}

            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="https://goalflow.app" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#57534e' }}>Open Planning →</a>
              <span style={{ fontSize: 12, color: '#d6d3d1' }}>·</span>
              <button onClick={handleToggleFrog} style={{ fontSize: 12, background: 'none', border: 'none', color: '#57534e', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                {task.isFrog ? 'Unmark frog' : 'Mark frog'}
              </button>
              <span style={{ fontSize: 12, color: '#d6d3d1' }}>·</span>
              <button onClick={handleResetDemo} style={{ fontSize: 12, background: 'none', border: 'none', color: '#57534e', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Reset demo</button>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 'auto', padding: '8px 0', textAlign: 'center', fontSize: 11, color: '#a8a29e' }}>
        Goalflow • Execution Companion — local demo • {todayStr()}
      </div>
    </div>
  );
}
