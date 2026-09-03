import React, { useCallback, useState, type FormEvent } from 'react';
import { Logo } from './Logo';
import {
  beginTelegramSignup,
  registerWithEmail,
  requestOwnerMagicLink,
  requestPasswordReset,
  signInWithEmail
} from '../services/authService';
import { Turnstile } from './Turnstile';

type AuthMode = 'login' | 'register' | 'reset';

export const Auth: React.FC<{ activationError?: string | null }> = ({ activationError }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(activationError || '');
  const [pending, setPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaRevision, setCaptchaRevision] = useState(0);
  const telegramEnabled = import.meta.env.VITE_TELEGRAM_ENABLED === 'true';
  const onCaptchaToken = useCallback((token: string) => setCaptchaToken(token), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      if (mode === 'register') {
        const result = await registerWithEmail(email, password, inviteCode, captchaToken);
        setMessage(result.verificationRequired
          ? 'Check your email and follow the verification link to finish activating Goalflow.'
          : 'Your email is verified. Goalflow is activating your beta access.');
      } else if (mode === 'reset') {
        await requestPasswordReset(email);
        setMessage('If that address has an active account, a password reset link is on its way.');
      } else {
        await signInWithEmail(email, password);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication could not be completed.');
    } finally {
      if (mode === 'register') {
        setCaptchaToken('');
        setCaptchaRevision(revision => revision + 1);
      }
      setPending(false);
    }
  };

  const telegram = async () => {
    setPending(true);
    setMessage('');
    try {
      await beginTelegramSignup(inviteCode.trim(), captchaToken);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Telegram signup failed.');
      setCaptchaToken('');
      setCaptchaRevision(revision => revision + 1);
      setPending(false);
    }
  };

  const emailLink = async () => {
    setPending(true);
    setMessage('');
    try {
      await requestOwnerMagicLink(email.trim());
      setMessage('Check your email for the secure sign-in link.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The sign-in link could not be sent.');
    } finally {
      setPending(false);
    }
  };

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage('');
    setPassword('');
    setCaptchaToken('');
  };

  return (
    <main className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-4 font-sans">
      <section className="w-full max-w-md bg-white border border-[#E4E7EC] rounded-xl p-8 shadow-sm">
        <div className="mb-8"><Logo /></div>
        <h1 className="text-3xl font-semibold text-[#111827]">Plan, then focus on one task.</h1>
        <p className="mt-2 text-[#667085]">Goalflow is an invite-only beta.</p>

        <nav className="mt-6 grid grid-cols-3 gap-1 rounded-lg bg-[#F2F4F7] p-1" aria-label="Account access">
          {([['login', 'Log in'], ['register', 'Register'], ['reset', 'Reset']] as const).map(([id, label]) => (
            <button key={id} type="button" disabled={pending} onClick={() => selectMode(id)} aria-current={mode === id ? 'page' : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium ${mode === id ? 'bg-white text-[#344054] shadow-sm' : 'text-[#667085]'}`}>
              {label}
            </button>
          ))}
        </nav>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-[#344054]" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email}
            onChange={event => setEmail(event.target.value)}
            className="w-full rounded-lg border border-[#D0D5DD] px-3 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500" />

          {mode !== 'reset' && <>
            <label className="block text-sm font-medium text-[#344054]" htmlFor="password">Password</label>
            <input id="password" type="password" minLength={12} maxLength={128}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full rounded-lg border border-[#D0D5DD] px-3 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </>}

          {mode === 'register' && <>
            <label className="block text-sm font-medium text-[#344054]" htmlFor="invite">Beta invite code</label>
            <input id="invite" required value={inviteCode} onChange={event => setInviteCode(event.target.value)}
              className="w-full rounded-lg border border-[#D0D5DD] px-3 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <Turnstile key={captchaRevision} onToken={onCaptchaToken} />
          </>}

          <button disabled={pending} className="w-full rounded-lg bg-[#4F46E5] px-4 py-3 font-medium text-white disabled:opacity-50">
            {pending ? 'Working…' : mode === 'register' ? 'Create beta account' : mode === 'reset' ? 'Send reset link' : 'Log in'}
          </button>
        </form>

        {telegramEnabled && mode === 'register' && <button type="button" onClick={() => void telegram()} disabled={pending || !inviteCode}
          className="mt-3 w-full rounded-lg border border-[#D0D5DD] px-4 py-3 font-medium text-[#344054] disabled:opacity-50">
          Continue with Telegram
        </button>}

        {mode === 'login' && <details className="mt-6 border-t border-[#E4E7EC] pt-5">
          <summary className="cursor-pointer text-sm font-medium text-[#475467]">Email a passwordless sign-in link</summary>
          <button type="button" onClick={() => void emailLink()} disabled={pending || !email}
            className="mt-3 w-full rounded-lg border border-[#D0D5DD] px-4 py-3 font-medium text-[#344054] disabled:opacity-50">
            Email a magic link
          </button>
        </details>}

        {message && <p className="mt-4 text-sm text-[#475467]" role="status">{message}</p>}
      </section>
    </main>
  );
};
