import { useCallback, useEffect, useState } from "react";

interface PublicTask {
  id: string;
  title: string;
  scheduledFor: string;
  scheduledTime: string | null;
  tags: string[];
  isFrog: boolean;
  status: string;
}

interface CapturePayload {
  title: string;
  schedulePrecision: "day";
  scheduledFor: string;
  scheduledTime?: string;
  estimatedMinutes?: number;
  tags?: string[];
}

interface PendingCapture { operationId: string; payload: CapturePayload }

declare global {
  interface Window {
    Telegram?: { WebApp: {
      initData: string;
      ready(): void;
      expand(): void;
      openLink(url: string): void;
    } };
  }
}

const API = "/api/v1/telegram/mini";
const sessionKey = "goalflow.telegram-mini.session.v1";
const pendingKey = "goalflow.telegram-mini.pending-capture.v1";

const readPending = (): PendingCapture | null => {
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null") as Partial<PendingCapture> | null;
    if (!value || typeof value.operationId !== "string" || typeof value.payload?.title !== "string"
      || typeof value.payload.scheduledFor !== "string") return null;
    return value as PendingCapture;
  } catch { return null; }
};

const errorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = await response.json() as { error?: { message?: string } };
    return body.error?.message || fallback;
  } catch { return fallback; }
};

export const App = () => {
  const [token, setToken] = useState(() => sessionStorage.getItem(sessionKey) ?? "");
  const [current, setCurrent] = useState<PublicTask | null>(null);
  const [today, setToday] = useState<PublicTask[]>([]);
  const [gate, setGate] = useState("loading");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(Boolean(readPending()));
  const initialPending = readPending();
  const [title, setTitle] = useState(initialPending?.payload.title ?? "");
  const [date, setDate] = useState(initialPending?.payload.scheduledFor ?? "");
  const [time, setTime] = useState(initialPending?.payload.scheduledTime ?? "");
  const [duration, setDuration] = useState(initialPending?.payload.estimatedMinutes?.toString() ?? "");
  const [tags, setTags] = useState(initialPending?.payload.tags?.join(", ") ?? "");

  const exchange = useCallback(async (): Promise<string> => {
    const initData = window.Telegram?.WebApp?.initData ?? "";
    if (!initData) throw new Error("Open this page from the verified Goalflow Telegram bot.");
    const response = await fetch(`${API}/session`, { method: "POST", headers: { authorization: `tma ${initData}` } });
    if (!response.ok) throw new Error(await errorMessage(response, "Telegram session could not be created."));
    const body = await response.json() as { token?: string };
    if (!body.token) throw new Error("Telegram session acknowledgment was incomplete.");
    sessionStorage.setItem(sessionKey, body.token);
    setToken(body.token);
    return body.token;
  }, []);

  const load = useCallback(async (knownToken?: string) => {
    setBusy(true);
    setError(null);
    try {
      const activeToken = knownToken || token || await exchange();
      const headers = { authorization: `Bearer ${activeToken}` };
      const [currentResponse, todayResponse] = await Promise.all([
        fetch(`${API}/current`, { headers }),
        fetch(`${API}/today`, { headers })
      ]);
      if (!currentResponse.ok || !todayResponse.ok) {
        if (currentResponse.status === 401 || todayResponse.status === 401) sessionStorage.removeItem(sessionKey);
        throw new Error(await errorMessage(
          !currentResponse.ok ? currentResponse : todayResponse,
          "Goalflow could not be loaded."
        ));
      }
      const currentBody = await currentResponse.json() as { current: PublicTask | null; gate: string };
      const todayBody = await todayResponse.json() as { queue: PublicTask[]; gate: string };
      setCurrent(currentBody.current);
      setToday(todayBody.queue ?? []);
      setGate(currentBody.gate ?? todayBody.gate ?? "unknown");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Goalflow could not be loaded.");
    } finally { setBusy(false); }
  }, [exchange, token]);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    void load();
  }, []); // A Telegram launch exchanges initData exactly once.

  const capture = async () => {
    if (!token || !title.trim() || !date) return;
    const existing = readPending();
    const payload: CapturePayload = existing?.payload ?? {
      title: title.trim(),
      schedulePrecision: "day",
      scheduledFor: date,
      ...(time ? { scheduledTime: time } : {}),
      ...(duration ? { estimatedMinutes: Number(duration) } : {}),
      ...(tags ? { tags: tags.split(",").map(tag => tag.trim().replace(/^#/, "")).filter(Boolean) } : {})
    };
    const pending: PendingCapture = existing ?? { operationId: crypto.randomUUID(), payload };
    sessionStorage.setItem(pendingKey, JSON.stringify(pending));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API}/capture`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "idempotency-key": pending.operationId
        },
        body: JSON.stringify(pending.payload)
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Task was not acknowledged. Retry preserves the same operation ID."));
      const body = await response.json() as { task?: PublicTask; operationId?: string };
      if (body.operationId !== pending.operationId || body.task?.id !== pending.operationId) {
        throw new Error("Task storage acknowledgment did not match. Retry preserves the same operation ID.");
      }
      sessionStorage.removeItem(pendingKey);
      setTitle(""); setDate(""); setTime(""); setDuration(""); setTags(""); setShowCapture(false);
      await load(token);
      window.Telegram?.WebApp?.openLink(`${window.location.origin}/?taskId=${body.task.id}&view=current`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Task was not acknowledged.");
    } finally { setBusy(false); }
  };

  const discardDraft = () => {
    sessionStorage.removeItem(pendingKey);
    setTitle(""); setDate(""); setTime(""); setDuration(""); setTags(""); setShowCapture(false); setError(null);
  };

  if (busy && !current && today.length === 0) return <main className="container"><section className="card">Loading…</section></main>;

  return <main className="container">
    {error && <section className="card error">{error} <button className="btn secondary" onClick={() => void load(token)}>Retry</button></section>}
    {readPending() && <section className="card notice">A saved capture is waiting for verified server acknowledgment. Its fields stay locked so every retry uses the same operation ID and payload.</section>}
    <section className="card">
      <div className="eyebrow">CURRENT</div>
      {current ? <>
        <strong>{current.isFrog ? "🐸 " : ""}{current.title}</strong>
        <p className="muted">{current.scheduledTime ? `${current.scheduledTime} · ` : ""}{current.tags.map(tag => `#${tag}`).join(" ")}</p>
        <button className="btn" onClick={() => window.Telegram?.WebApp?.openLink(`${window.location.origin}/?taskId=${current.id}&view=current`)}>Open in Goalflow</button>
      </> : <p className="muted">{gate === "empty" ? "Nothing scheduled for today." : `Planning required (${gate}).`}</p>}
    </section>
    <section className="card">
      <div className="eyebrow">TODAY</div>
      <p className="muted">{today.length} open</p>
      {today.slice(0, 5).map((task, index) => <div className="task" key={task.id}>{index === 0 ? "→ " : ""}{task.isFrog ? "🐸 " : ""}{task.title}</div>)}
    </section>
    {!showCapture ? <button className="btn" onClick={() => setShowCapture(true)}>+ Capture task</button> : <section className="card">
      <label className="label" htmlFor="capture-title">Title</label>
      <input id="capture-title" className="input" value={title} onChange={event => setTitle(event.target.value)} maxLength={240} disabled={Boolean(readPending())} />
      <label className="label" htmlFor="capture-date">Date</label>
      <input id="capture-date" className="input" type="date" value={date} onChange={event => setDate(event.target.value)} disabled={Boolean(readPending())} />
      <label className="label" htmlFor="capture-time">Time (optional)</label>
      <input id="capture-time" className="input" type="time" value={time} onChange={event => setTime(event.target.value)} disabled={Boolean(readPending())} />
      <label className="label" htmlFor="capture-duration">Minutes (optional)</label>
      <input id="capture-duration" className="input" type="number" min="1" max="1440" value={duration} onChange={event => setDuration(event.target.value)} disabled={Boolean(readPending())} />
      <label className="label" htmlFor="capture-tags">Tags (optional, comma-separated)</label>
      <input id="capture-tags" className="input" value={tags} onChange={event => setTags(event.target.value)} disabled={Boolean(readPending())} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy || !title.trim() || !date} onClick={() => void capture()}>{readPending() ? "Retry capture" : "Create"}</button>
        <button className="btn secondary" disabled={busy} onClick={discardDraft}>{readPending() ? "Discard saved draft" : "Cancel"}</button>
      </div>
    </section>}
  </main>;
};
