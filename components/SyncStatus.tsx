import React, { useEffect, useState } from 'react';
import { resolveLocalConflict, type SyncState } from '../services/cloudSync';
import { storageService, STORES } from '../services/storage';

interface StatusDetail {
  state: SyncState;
  lastSuccessfulSync?: string;
  conflictCount?: number;
  message?: string;
}

export const SyncStatus: React.FC<{ userKey: string }> = ({ userKey }) => {
  const [status, setStatus] = useState<StatusDetail>({ state: navigator.onLine ? 'saved-locally' : 'offline' });
  const [conflictStores, setConflictStores] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onState = async (event: Event) => {
      const detail = (event as CustomEvent<StatusDetail>).detail;
      setStatus(detail);
      if (detail.conflictCount) {
        const meta = await storageService.get<{ conflicts?: Array<{ entityType: string }> }>(STORES.SYNC, userKey);
        setConflictStores(Array.from(new Set(meta?.conflicts?.map(item => item.entityType) || [])));
      } else setConflictStores([]);
    };
    window.addEventListener('goalflow:sync-state', onState);
    return () => window.removeEventListener('goalflow:sync-state', onState);
  }, [userKey]);

  const labels: Record<SyncState, string> = {
    'saved-locally': 'Saved locally', syncing: 'Syncing', synced: 'Synced', offline: 'Offline', error: 'Sync error', conflict: 'Review sync conflict'
  };
  const color = status.state === 'synced' ? 'bg-emerald-500' : status.state === 'error' || status.state === 'conflict' ? 'bg-amber-500' : status.state === 'offline' ? 'bg-gray-400' : 'bg-indigo-500';

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(value => !value)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700" title={status.lastSuccessfulSync ? `Last synced ${new Date(status.lastSuccessfulSync).toLocaleString()}` : status.message}>
        <span className={`h-2 w-2 rounded-full ${color} ${status.state === 'syncing' ? 'animate-pulse' : ''}`} />
        <span className="hidden lg:inline">{labels[status.state]}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <p className="font-bold text-gray-900 dark:text-white">{labels[status.state]}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{status.lastSuccessfulSync ? `Last successful sync: ${new Date(status.lastSuccessfulSync).toLocaleString()}` : status.message || 'Changes remain available on this device.'}</p>
          {conflictStores.map(storeName => (
            <div key={storeName} className="mt-3 border-t border-gray-100 pt-3 dark:border-slate-700">
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">Conflicting {storeName}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Both versions are preserved until you choose.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void resolveLocalConflict(userKey, storeName, 'local')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Keep this device</button>
                <button type="button" onClick={() => void resolveLocalConflict(userKey, storeName, 'cloud')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 dark:border-slate-600 dark:text-gray-200">Use cloud</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
