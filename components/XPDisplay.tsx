
import React from 'react';
import { UserProgress } from '../types';
import { playHoverSound, playSelectSound } from '../utils/audioUtils';
import { TrophyIcon } from './Icons';

interface XPDisplayProps {
  userProgress: UserProgress;
  onClick?: () => void;
}

export const XPDisplay: React.FC<XPDisplayProps> = ({ userProgress, onClick }) => {
  const { level, xp, xpToNextLevel } = userProgress;
  const percentage = Math.min(100, Math.max(0, (xp / xpToNextLevel) * 100));

  return (
    <button 
        onClick={() => {
            playSelectSound();
            if(onClick) onClick();
        }}
        onMouseEnter={() => playHoverSound()}
        className="group relative flex items-center p-1.5 pr-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-gray-200 dark:border-slate-700 rounded-full shadow-sm hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-300 outline-none"
    >
      {/* Level Badge */}
      <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0 z-10 group-hover:scale-110 transition-transform duration-300 border-2 border-white dark:border-slate-800">
        {level}
        {/* Shine effect */}
        <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 animate-pulse"></div>
      </div>

      {/* Progress Bar Container */}
      <div className="ml-3 flex flex-col justify-center min-w-[120px]">
        <div className="flex justify-between items-end mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-indigo-500 transition-colors">Level {level}</span>
            <span className="text-[10px] font-mono text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0">
                {Math.floor(percentage)}%
            </span>
        </div>
        
        <div className="h-2 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden relative">
            {/* Background shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
            
            {/* Fill */}
            <div 
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                style={{ width: `${percentage}%` }}
            ></div>
        </div>
      </div>

      {/* Hover Tooltip/Detail */}
      <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl translate-y-[-5px] group-hover:translate-y-0 z-50">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
          <span className="relative z-10 font-mono">{xp} / {xpToNextLevel} XP to Lvl {level + 1}</span>
      </div>
    </button>
  );
};
