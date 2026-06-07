import React, { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { UserSettings } from '../hooks/useGoalflow';
import { BrainCircuit, DownloadIcon, UploadIcon, ShieldIcon, RefreshIcon } from './Icons';
import { storageService } from '../services/storage';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    onUpdateSettings: (updates: Partial<UserSettings>) => void;
    userEmail: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdateSettings, userEmail }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // Database Status Check & Self-Repair States
    const [dbStatus, setDbStatus] = useState<{
        status: 'healthy' | 'fallback' | 'error';
        mode: 'indexeddb' | 'memory-fallback';
        version: number;
        storeCount: number;
        stores: string[];
        details?: string;
    } | null>(null);
    const [isRepairing, setIsRepairing] = useState(false);
    const [repairResult, setRepairResult] = useState<string | null>(null);

    const fetchStatus = async () => {
        try {
            const status = await storageService.getDatabaseStatus();
            setDbStatus(status);
        } catch (err) {
            console.error("Failed to fetch database health report", err);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchStatus();
            setRepairResult(null);
        }
    }, [isOpen]);

    const handleRepair = async () => {
        const confirmStr = "This will run a full diagnostics and repair schema check. It will safely reconstruct your local database and restore all tasks, settings, and histories from our multi-tier LocalStorage and memory backups. Do you wish to proceed?";
        if (!window.confirm(confirmStr)) return;

        setIsRepairing(true);
        setRepairResult(null);
        try {
            const res = await storageService.runSelfRepair();
            setRepairResult(res.message);
            await fetchStatus();
        } catch (err: any) {
            setRepairResult(`Repair process error: ${err?.message || err}`);
        } finally {
            setIsRepairing(false);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const data = await storageService.exportBackup(userEmail);
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `goalflow_backup_${userEmail}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to export data', err);
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setImportError(null);
        setImportSuccess(false);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                const parsed = JSON.parse(text);
                
                // Minimal check to confirm structure looks like a valid goalflow backup
                const hasValidKeys = Object.keys(parsed).some(key => key === 'tasks' || key === 'goals' || key === 'habits');
                if (!hasValidKeys) {
                    throw new Error('Invalid backup file format.');
                }

                await storageService.importBackup(userEmail, parsed);
                setImportSuccess(true);
                // Reload page after a brief moment to rehydrate state seamlessly
                setTimeout(() => {
                    window.location.reload();
                }, 1200);
            } catch (err: any) {
                setImportError(err?.message || 'Failed to parse and import backup.');
            } finally {
                setIsImporting(false);
            }
        };
        reader.readAsText(file);
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Settings">
            <div className="p-6">
                <div className="space-y-6">
                    {/* AI Configuration */}
                    <div className="flex items-start justify-between bg-gray-50 dark:bg-slate-700/50 p-4 rounded-xl border border-gray-100 dark:border-slate-600">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                                <BrainCircuit className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 dark:text-white">AI Features</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                                    Enhance Goalflow with Google Gemini. Enables automatic task breakdown, actionability checks ("Icky Filter"), goal suggestions, and visualization prompts.
                                </p>
                             </div>
                        </div>
                        
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={settings.enableAi} 
                                onChange={(e) => onUpdateSettings({ enableAi: e.target.checked })} 
                                className="sr-only peer" 
                            />
                            <div className="w-14 h-7 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                    </div>

                    {/* Data Import/Export */}
                    <div className="bg-gray-50 dark:bg-slate-700/50 p-4 rounded-xl border border-gray-100 dark:border-slate-600">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Back up & Data Portability</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Export your tasks, habits, and user statistics into a portable file, or restore them from a previous backup.
                        </p>
                        
                        <div className="flex flex-wrap gap-4">
                            <button
                                onClick={handleExport}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 font-medium text-sm rounded-lg border border-gray-200 dark:border-slate-600 transition-colors disabled:opacity-50"
                            >
                                <DownloadIcon className="w-4 h-4 text-indigo-500" />
                                {isExporting ? 'Exporting...' : 'Export Data'}
                            </button>
                            
                            <button
                                onClick={triggerFileInput}
                                disabled={isImporting}
                                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 font-medium text-sm rounded-lg border border-gray-200 dark:border-slate-600 transition-colors disabled:opacity-50"
                            >
                                <UploadIcon className="w-4 h-4 text-emerald-500" />
                                {isImporting ? 'Importing...' : 'Import Data'}
                            </button>
                            
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImportFile}
                                accept=".json"
                                className="hidden"
                            />
                        </div>

                        {importSuccess && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 font-semibold">
                                Backup imported successfully! Refreshing view...
                            </p>
                        )}
                        {importError && (
                            <p className="text-xs text-red-500 mt-3 font-medium">
                                {importError}
                            </p>
                        )}
                    </div>

                    {/* Database Health Diagnostics & Repair */}
                    <div className="bg-gray-50 dark:bg-slate-700/50 p-4 rounded-xl border border-gray-100 dark:border-slate-600">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                    <ShieldIcon className="w-5 h-5 text-indigo-500" />
                                    Database Health & Self-Repair
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Real-time local database status, auto-migrations, and autonomous disaster recovery controls.
                                </p>
                            </div>
                            <button
                                onClick={fetchStatus}
                                title="Refresh Diagnostics"
                                className="p-1.5 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-gray-400 dark:text-gray-300 transition-colors"
                            >
                                <RefreshIcon className="w-4 h-4 text-indigo-500" />
                            </button>
                        </div>

                        {dbStatus && (
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-100 dark:border-slate-700 text-xs mb-4 space-y-2 text-[11px]">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500 dark:text-gray-400">Storage Mode:</span>
                                    <span className="font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200">
                                        {dbStatus.mode === 'indexeddb' ? 'IndexedDB NATIVE' : 'MEM_LOCALSTORAGE_FALLBACK'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500 dark:text-gray-400">Database Status:</span>
                                    <span className={`inline-flex items-center gap-1 font-semibold ${
                                        dbStatus.status === 'healthy' ? 'text-emerald-500' : 'text-amber-500'
                                    }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                            dbStatus.status === 'healthy' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                                        }`} />
                                        {dbStatus.status.toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500 dark:text-gray-400">Dynamic Version:</span>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">v{dbStatus.version}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500 dark:text-gray-400">Active Stores:</span>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">{dbStatus.storeCount} stores configured</span>
                                </div>
                                {dbStatus.stores.length > 0 && (
                                    <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
                                        <p className="text-gray-400 dark:text-gray-500 mb-1">Registered Schemas:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {dbStatus.stores.map(s => (
                                                <span key={s} className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-mono">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {dbStatus.details && (
                                    <p className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 rounded text-[11px] leading-relaxed">
                                        {dbStatus.details}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleRepair}
                                disabled={isRepairing}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-bold text-sm rounded-lg border border-indigo-100 dark:border-indigo-900/20 transition-all disabled:opacity-50"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isRepairing ? 'animate-spin' : ''}>
                                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                </svg>
                                {isRepairing ? 'Running Diagnostics & Repair...' : 'Execute Database Diagnosis & Repair'}
                            </button>

                            {repairResult && (
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/10 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/20 mt-2 leading-relaxed">
                                    {repairResult}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-slate-700 text-center">
                    <p className="text-xs text-gray-400">Goalflow v1.0.0</p>
                </div>
            </div>
        </Modal>
    );
};