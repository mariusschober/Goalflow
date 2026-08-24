import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import App from './App';
import { Auth } from './components/Auth';
import { MfaGate } from './components/MfaGate';
import * as authService from './services/authService';

const displayIdentity = (session: Session): string =>
  session.user.email
  || String(session.user.user_metadata?.preferred_username || session.user.user_metadata?.username || `telegram-${session.user.id}`);

const AppWrapper: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [localUser] = useState(authService.getLocalDemoUser());
  const [isLoading, setIsLoading] = useState(true);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [mfaReady, setMfaReady] = useState(false);
  const [recoveryEmailRequired, setRecoveryEmailRequired] = useState(false);

  useEffect(() => {
    if (!authService.isLocalDemo() || !('serviceWorker' in navigator)) return;

    // Local mode never needs an offline worker. Remove registrations left by a
    // production preview so they cannot replace the current development app.
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    });
  }, []);

  useEffect(() => {
    let active = true;
    void authService.getSession().then(async (nextSession) => {
      if (!active) return;
      let resolvedSession = nextSession;
      const authAction = new URLSearchParams(window.location.search).get('auth');
      if (nextSession && authAction === 'telegram') {
        try { setRecoveryEmailRequired(await authService.activateTelegramSignup(nextSession)); }
        catch (error) {
          setActivationError(error instanceof Error ? error.message : 'Telegram activation failed.');
          await authService.logout();
          resolvedSession = null;
        }
      } else if (nextSession && authAction === 'telegram-link') {
        try { await authService.activateOwnerTelegramLink(nextSession); }
        catch (error) { setActivationError(error instanceof Error ? error.message : 'Telegram linking failed.'); }
      }
      if (resolvedSession && !resolvedSession.user.email) setRecoveryEmailRequired(true);
      if (active) { setSession(resolvedSession); setIsLoading(false); }
    });
    const unsubscribe = authService.onSessionChange((nextSession) => {
      if (active) { setSession(nextSession); setMfaReady(false); setIsLoading(false); }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  if (isLoading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!session && !localUser) return <Auth activationError={activationError} />;
  if (session && !mfaReady) return <MfaGate onComplete={() => setMfaReady(true)} />;
  const identity = localUser || displayIdentity(session!);
  const userKey = localUser || session!.user.id;
  return <>
    <App userEmail={identity} userKey={userKey} openAccountSetup={recoveryEmailRequired} onLogout={() => void authService.logout().then(() => setSession(null))} />
    {activationError && <div role="alert" className="fixed left-1/2 top-4 z-[100] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-700 shadow-lg">{activationError}<button type="button" onClick={() => setActivationError(null)} className="ml-3 font-bold">Dismiss</button></div>}
  </>;
};

export default AppWrapper;
