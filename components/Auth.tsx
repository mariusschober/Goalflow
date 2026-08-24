import React, { useCallback, useState, type FormEvent } from 'react';
import { Logo } from './Logo';
import { beginTelegramSignup, requestOwnerMagicLink } from '../services/authService';
import { Turnstile } from './Turnstile';

export const Auth: React.FC<{ activationError?: string | null }> = ({ activationError }) => {
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(activationError || '');
  const [pending, setPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const onCaptchaToken = useCallback((token: string) => setCaptchaToken(token), []);

  const telegram = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setMessage('');
    try { await beginTelegramSignup(inviteCode.trim(), captchaToken); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Telegram signup failed.'); setPending(false); }
  };
  const emailLink = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setMessage('');
    try { await requestOwnerMagicLink(email.trim()); setMessage('Check your email for the secure sign-in link.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The sign-in link could not be sent.'); }
    finally { setPending(false); }
  };

  return (
    <main className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-4 font-sans">
      <section className="w-full max-w-md bg-white border border-[#E4E7EC] rounded-xl p-8 shadow-sm">
        <div className="mb-8"><Logo /></div>
        <h1 className="text-3xl font-semibold text-[#111827]">Plan, then focus on one task.</h1>
        <p className="mt-2 text-[#667085]">Goalflow is currently an invite-only beta.</p>

        <form onSubmit={telegram} className="mt-8 space-y-3">
          <label className="block text-sm font-medium text-[#344054]" htmlFor="invite">Beta invite code</label>
          <input id="invite" required value={inviteCode} onChange={(event) => setInviteCode(event.target.value)}
            className="w-full rounded-lg border border-[#D0D5DD] px-3 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <Turnstile onToken={onCaptchaToken} />
          <button disabled={pending} className="w-full rounded-lg bg-[#4F46E5] px-4 py-3 font-medium text-white disabled:opacity-50">
            Continue with Telegram
          </button>
        </form>

        <details className="mt-6 border-t border-[#E4E7EC] pt-5">
          <summary className="cursor-pointer text-sm font-medium text-[#475467]">Email recovery sign-in</summary>
          <form onSubmit={emailLink} className="mt-4 space-y-3">
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}
              placeholder="mris@tuta.io" className="w-full rounded-lg border border-[#D0D5DD] px-3 py-3" />
            <button disabled={pending} className="w-full rounded-lg border border-[#D0D5DD] px-4 py-3 font-medium text-[#344054]">Email a magic link</button>
          </form>
        </details>
        {message && <p className="mt-4 text-sm text-[#475467]" role="status">{message}</p>}
      </section>
    </main>
  );
};
