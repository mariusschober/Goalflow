import React, { useEffect, useState } from "react";
import "./style.css";

interface Task {
  id: string;
  title: string;
  scheduledTime?: string;
  tags: string[];
  isFrog: boolean;
}

declare global {
  interface Window {
    Telegram?: { WebApp: { initData: string; ready: () => void; expand: () => void; openLink: (url: string) => void; close: () => void } };
  }
}

const API = (path: string) => `/api/v1/telegram/mini${path}`;

const authHeader = () => {
  const initData = window.Telegram?.WebApp?.initData || new URLSearchParams(window.location.search).get("initData") || "";
  return initData ? `tma ${initData}` : "";
};

export const App: React.FC = () => {
  const [current, setCurrent] = useState<Task | null>(null);
  const [today, setToday] = useState<Task[]>([]);
  const [gate, setGate] = useState<string>("loading");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [tags, setTags] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { Authorization: authHeader() };
      const [curRes, todayRes] = await Promise.all([
        fetch(API("/current"), { headers }),
        fetch(API("/today"), { headers }),
      ]);
      if (!curRes.ok) throw new Error(`Current ${curRes.status}`);
      if (!todayRes.ok) throw new Error(`Today ${todayRes.status}`);
      const cur = await curRes.json();
      const tod = await todayRes.json();
      setCurrent(cur.current);
      setToday(tod.queue ?? []);
      setGate(cur.gate ?? tod.gate ?? "unknown");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    fetchData();
  }, []);

  const handleCapture = async () => {
    if (!title.trim()) return;
    const payload: Record<string, unknown> = { title: title.trim() };
    // Structured capture: if date/time/duration/tags provided, use them, else let server parse
    if (date) {
      payload.schedulePrecision = "day";
      payload.scheduledFor = date;
    } else {
      // No date chosen, will be rejected by server as schedule_required — show prompt
      payload.schedulePrecision = "day";
      payload.scheduledFor = new Date().toISOString().slice(0, 10);
    }
    if (time) payload.scheduledTime = time;
    if (duration) payload.estimatedMinutes = Number(duration);
    if (tags) payload.tags = tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
    try {
      const res = await fetch(API("/capture"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader(), "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? `Capture ${res.status}`);
      }
      setTitle("");
      setDate("");
      setTime("");
      setDuration("");
      setTags("");
      setShowCapture(false);
      await fetchData();
      window.Telegram?.WebApp?.openLink(`${window.location.origin}/?taskId=${(await res.json()).task.id}&view=current`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capture failed");
    }
  };

  if (loading) return <div className="container"><div className="card">Loading…</div></div>;
  if (error) return <div className="container"><div className="card">Error: {error} <button className="btn" onClick={fetchData}>Retry</button></div></div>;

  return (
    <div className="container">
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 700, color: "#4F46E5", marginBottom: 8 }}>CURRENT</div>
        {current ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{current.isFrog ? "🐸 " : ""}{current.title}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {current.scheduledTime ? `${current.scheduledTime} · ` : ""}
              {current.tags?.map((t) => `#${t}`).join(" ")}
            </div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => window.Telegram?.WebApp?.openLink(`${window.location.origin}/?taskId=${current.id}&view=current`)}>
              Open in Goalflow
            </button>
          </>
        ) : (
          <div style={{ color: "#6b7280" }}>{gate === "empty" ? "Nothing scheduled for today." : `Planning required — gate: ${gate}`}</div>
        )}
      </div>

      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 700, color: "#4F46E5", marginBottom: 8 }}>TODAY</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{today.length} open</div>
        {today.slice(0, 5).map((t, i) => (
          <div key={t.id} style={{ padding: "6px 0", borderTop: i ? "1px solid #f3f4f6" : "none", fontWeight: i === 0 ? 600 : 400 }}>
            {i === 0 ? "→ " : "  "}{t.isFrog ? "🐸 " : ""}{t.title}
          </div>
        ))}
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => window.Telegram?.WebApp?.openLink(`${window.location.origin}/?view=planning`)}>
          Open Planning
        </button>
      </div>

      {!showCapture ? (
        <button className="btn" onClick={() => setShowCapture(true)}>
          + Capture Task
        </button>
      ) : (
        <div className="card">
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
          <label className="label">Date (YYYY-MM-DD)</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label className="label">Time (HH:MM)</label>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <label className="label">Duration (minutes)</label>
          <input className="input" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="25" />
          <label className="label">Tags (comma separated, without #)</label>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="sales, movetrics" />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={handleCapture} disabled={!title.trim()}>
              Create
            </button>
            <button className="btn btn-secondary" onClick={() => setShowCapture(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
