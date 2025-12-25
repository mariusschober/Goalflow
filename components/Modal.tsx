
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
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

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[9999] flex justify-center items-center p-4 sm:p-6 animate-fadeIn" 
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative overflow-hidden animate-scaleIn border border-white/10 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-100 dark:border-slate-700 shrink-0 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm z-10">
          <h3 className="text-2xl font-heading font-bold text-gray-900 dark:text-white tracking-wide">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-hidden relative flex flex-col min-h-0 text-gray-900 dark:text-gray-100">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
