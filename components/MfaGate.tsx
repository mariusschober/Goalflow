import React, { useEffect, useState } from 'react';
import { supabase } from '../services/authService';

export const MfaGate: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const inspect = async () => {
      if (!supabase) return onComplete();
      const [{ data: factors, error: factorsError }, { data: assurance, error: assuranceError }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      ]);
      if (!active) return;
      if (factorsError || assuranceError) {
        setError(factorsError?.message || assuranceError?.message || 'Could not verify account security.');
        return;
      }
      const verified = factors.totp.find(factor => factor.status === 'verified');
      if (!verified || assurance.currentLevel === assurance.nextLevel) onComplete();
      else setFactorId(verified.id);
    };
    void inspect();
    return () => { active = false; };
  }, [onComplete]);

  const verify = async () => {
    if (!supabase || !factorId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
      if (verifyError) throw verifyError;
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The verification code was not accepted.');
    } finally {
      setBusy(false);
    }
  };

  if (!factorId && !error) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-16 dark:bg-slate-900">
      <section className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">Account security</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Enter your authenticator code</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Open your authenticator app and enter the current six-digit code.</p>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} onKeyDown={event => { if (event.key === 'Enter') void verify(); }} aria-label="Six-digit authenticator code" className="mt-6 w-full rounded-lg border border-gray-200 px-4 py-3 text-center text-xl tracking-[0.35em] dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="button" onClick={verify} disabled={busy || !factorId || code.length !== 6} className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? 'Verifying...' : 'Continue'}</button>
      </section>
    </main>
  );
};
