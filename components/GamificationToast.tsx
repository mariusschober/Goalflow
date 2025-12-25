
import React, { useEffect, useState } from 'react';
import { ShieldIcon, FlameIcon, TrophyIcon, SparklesIcon } from './Icons';
import { GamificationEventType } from '../types';

interface GamificationToastProps {
  type: GamificationEventType;
  message: string;
  xp: number;
  onClose: () => void;
}

export const GamificationToast: React.FC<GamificationToastProps> = ({ type, message, xp, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 300); // Wait for exit animation
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const config = {
      penalty: {
          bg: 'bg-red-900/90 border-red-500/50',
          iconBg: 'bg-red-600',
          icon: <FlameIcon className="w-6 h-6 text-white" />,
          titleColor: 'text-red-200',
          textColor: 'text-red-100',
          label: 'Discipline Check',
          labelBg: 'bg-red-800 text-red-100',
          prefix: '-'
      },
      reward: {
          bg: 'bg-amber-900/90 border-amber-500/50',
          iconBg: 'bg-amber-600',
          icon: <TrophyIcon className="w-6 h-6 text-white" />,
          titleColor: 'text-amber-200',
          textColor: 'text-amber-100',
          label: 'Reward',
          labelBg: 'bg-amber-800 text-amber-100',
          prefix: '+'
      },
      milestone: {
          bg: 'bg-indigo-900/90 border-indigo-500/50',
          iconBg: 'bg-indigo-600',
          icon: <SparklesIcon className="w-6 h-6 text-white" />,
          titleColor: 'text-indigo-200',
          textColor: 'text-indigo-100',
          label: 'Milestone',
          labelBg: 'bg-indigo-800 text-indigo-100',
          prefix: '+'
      }
  }[type];

  return (
    <div className={`fixed top-24 left-1/2 transform -translate-x-1/2 z-[1000] transition-all duration-500 pointer-events-none ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95'}`}>
      <div className={`${config.bg} backdrop-blur-md border px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 max-w-md`}>
        <div className={`${config.iconBg} rounded-full p-2 animate-pulse shrink-0 shadow-lg`}>
            {config.icon}
        </div>
        <div>
            <div className="flex items-center gap-2 mb-1">
                <span className={`text-xl font-black ${config.titleColor}`}>{config.prefix}{xp} XP</span>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${config.labelBg}`}>{config.label}</span>
            </div>
            <p className={`text-sm font-medium ${config.textColor} leading-tight`}>{message}</p>
        </div>
      </div>
    </div>
  );
};
