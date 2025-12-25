import React from 'react';
import { Modal } from './Modal';
import { UserSettings } from '../hooks/useGoalflow';
import { BrainCircuit } from './Icons';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    onUpdateSettings: (updates: Partial<UserSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Settings">
            <div className="p-6">
                <div className="space-y-6">
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
                </div>
                
                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-slate-700 text-center">
                    <p className="text-xs text-gray-400">Goalflow v1.0.0</p>
                </div>
            </div>
        </Modal>
    );
};