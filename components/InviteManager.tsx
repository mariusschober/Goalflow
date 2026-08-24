import React, { useEffect, useState } from 'react';
import { authenticatedFetch } from '../services/authService';

interface Invite {
  id: string;
  label: string;
  max_uses: number;
  use_count: number;
  expires_at: string;
  disabled_at?: string | null;
}

export const InviteManager: React.FC = () => {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [label, setLabel] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await authenticatedFetch('/api/v1/admin/invites');
    if (!response.ok) return;
    const body = await response.json() as { invites: Invite[] };
    setInvites(body.invites);
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setBusy(true); setMessage(null); setNewCode(null);
    try {
      const response = await authenticatedFetch('/api/v1/admin/invites', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label, expiresInDays: 14, maxUses: 1 })
      });
      const body = await response.json() as { code?: string; error?: { message?: string } };
      if (!response.ok || !body.code) throw new Error(body.error?.message || 'The invite could not be created.');
      setNewCode(body.code); setLabel(''); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The invite could not be created.'); }
    finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    const response = await authenticatedFetch(`/api/v1/admin/invites/${id}`, { method: 'DELETE' });
    if (response.ok) await load();
  };

  return (
    <div className="border-t border-gray-200 pt-5 dark:border-slate-700">
      <h3 className="text-base font-bold text-gray-900 dark:text-white">Beta invitations</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Codes are shown once, expire after 14 days, and can activate one Telegram account.</p>
      <div className="mt-3 flex gap-2">
        <input value={label} onChange={event => setLabel(event.target.value)} placeholder="Optional label" maxLength={120} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
        <button type="button" onClick={create} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Create code</button>
      </div>
      {newCode && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-900/30">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-200">Copy now. It will not be shown again.</p>
          <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 break-all font-bold text-indigo-900 dark:text-white">{newCode}</code><button type="button" onClick={() => void navigator.clipboard.writeText(newCode)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-indigo-700 dark:bg-slate-800 dark:text-indigo-200">Copy</button></div>
        </div>
      )}
      <div className="mt-3 space-y-2">
        {invites.map(invite => (
          <div key={invite.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-800">
            <div><p className="font-bold text-gray-800 dark:text-gray-100">{invite.label || 'Beta invite'}</p><p className="text-xs text-gray-500 dark:text-gray-400">{invite.use_count}/{invite.max_uses} used · expires {new Date(invite.expires_at).toLocaleDateString()}</p></div>
            {!invite.disabled_at && invite.use_count < invite.max_uses && <button type="button" onClick={() => void revoke(invite.id)} className="text-xs font-bold text-red-600 dark:text-red-400">Revoke</button>}
          </div>
        ))}
      </div>
      {message && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{message}</p>}
    </div>
  );
};
