import React, { useState, type FormEvent } from 'react';
import { updateRecoveredPassword } from '../services/authService';
import { Logo } from './Logo';

export const PasswordRecovery: React.FC<{
  onComplete: () => void;
  onCancel: () => void;
}> = ({ onComplete, onCancel }) => {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage('The passwords do not match.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await updateRecoveredPassword(password);
      onComplete();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The password could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-4 font-sans">
      <section className="w-full max-w-md rounded-xl border border-[#E4E7EC] bg-white p-8 shadow-sm">
        <div className="mb-8"><Logo /></div>
        <h1 className="text-2xl font-semibold text-[#111827]">Choose a new password</h1>
        <p className="mt-2 text-sm text-[#667085]">Use at least 12 characters. Updating it revokes every active session, including this one.</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-[#344054]" htmlFor="new-password">New password</label>
          <input id="new-password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"
            value={password} onChange={event => setPassword(event.target.value)}
            className="w-full rounded-lg border border-[#D0D5DD] px-3 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <label className="block text-sm font-medium text-[#344054]" htmlFor="confirm-password">Confirm password</label>
          <input id="confirm-password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"
            value={confirmation} onChange={event => setConfirmation(event.target.value)}
            className="w-full rounded-lg border border-[#D0D5DD] px-3 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {message && <p role="alert" className="text-sm text-red-600">{message}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-[#4F46E5] px-4 py-3 font-medium text-white disabled:opacity-50">
            {busy ? 'Updating…' : 'Update password'}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="w-full px-4 py-2 text-sm font-medium text-[#667085]">
            Cancel and sign out
          </button>
        </form>
      </section>
    </main>
  );
};
