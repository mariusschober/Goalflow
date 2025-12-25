
import React, { useEffect, useState } from 'react';
import { ShieldIcon, FlameIcon } from './Icons';

interface PenaltyToastProps {
  message: string;
  xpLost: number;
  onClose: () => void;
}

export const PenaltyToast: React.FC<PenaltyToastProps> = ({ message, xpLost, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 300); // Wait for exit animation
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-24 left-1/2 transform -translate-x-1/2 z-[1000] transition-all duration-300 pointer-events-none ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
      <div className="bg-red-900/90 backdrop-blur-md border border-red-500/50 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 max-w-md">
        <div className="bg-red-600 rounded-full p-2 animate-pulse shrink-0">
            <FlameIcon className="w-6 h-6 text-white" />
        </div>
        <div>
            <div className="flex items-center gap-2 mb-1">
                <span className="text-xl font-black text-red-200">-{xpLost} XP</span>
                <span className="text-xs font-bold uppercase bg-red-800 px-2 py-0.5 rounded text-red-100">Discipline Check</span>
            </div>
            <p className="text-sm font-medium text-red-100 leading-tight">{message}</p>
        </div>
      </div>
    </div>
  );
};
