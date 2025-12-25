
import React, { useEffect } from 'react';
import { Modal } from './Modal';
import { playLevelUpSound } from '../utils/audioUtils';

interface LevelUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  newLevel: number;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({ isOpen, onClose, newLevel }) => {
  useEffect(() => {
    if (isOpen) {
      playLevelUpSound();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };
    if (isOpen) {
        window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex justify-center items-center p-4 cursor-pointer animate-fadeIn"
        onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg p-10 relative overflow-hidden text-center transform transition-transform hover:scale-105 border border-white/20"
      >
        {/* Background rays */}
        <div className="absolute inset-0 z-0 opacity-10 dark:opacity-20 animate-[spin_20s_linear_infinite]">
             <svg viewBox="0 0 100 100" className="w-full h-full fill-current text-yellow-500">
                 <path d="M50 50 L50 0 L60 0 Z" />
                 <path d="M50 50 L85 15 L92 22 Z" />
                 <path d="M50 50 L100 50 L100 60 Z" />
                 <path d="M50 50 L85 85 L78 92 Z" />
                 <path d="M50 50 L50 100 L40 100 Z" />
                 <path d="M50 50 L15 85 L8 78 Z" />
                 <path d="M50 50 L0 50 L0 40 Z" />
                 <path d="M50 50 L15 15 L22 8 Z" />
             </svg>
        </div>

        <div className="relative z-10">
            <div className="text-6xl animate-bounce mb-4">🎉</div>
            <h2 className="text-5xl font-heading font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-2 drop-shadow-sm">LEVEL UP!</h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg font-medium uppercase tracking-widest">You've reached</p>
            <p className="text-8xl font-black text-gray-800 dark:text-white my-6 drop-shadow-md">Level {newLevel}</p>
            <p className="text-gray-600 dark:text-gray-300 text-lg leading-relaxed max-w-xs mx-auto">
                Your focus and dedication are paying off. Keep up the amazing work!
            </p>
            
            <div className="mt-8 flex flex-col items-center gap-3">
                <button
                className="w-full px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-lg flex items-center justify-center gap-2 group"
                >
                <svg className="w-5 h-5 group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Continue Flowing
                </button>
                <p className="text-xs text-gray-400 dark:text-gray-500">Tap anywhere to continue</p>
            </div>
        </div>
      </div>
    </div>
  );
};
