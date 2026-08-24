
import React, { useEffect, useId, useRef } from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
        if (!focusable.length) { e.preventDefault(); dialogRef.current.focus(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    if (isOpen) {
      const previousFocus = document.activeElement as HTMLElement | null;
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      window.setTimeout(() => {
        const initial = dialogRef.current?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled]), button:not([disabled])');
        (initial || dialogRef.current)?.focus();
      }, 0);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
        previousFocus?.focus();
      };
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[9999] flex justify-center items-center p-4 sm:p-6 animate-fadeIn" 
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-5xl max-h-[calc(100dvh-2rem)] flex flex-col relative overflow-hidden animate-scaleIn border border-gray-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-100 dark:border-slate-700 shrink-0 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm z-10">
          <h3 id={titleId} className="text-2xl font-heading font-bold text-gray-900 dark:text-white tracking-wide">{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto relative flex flex-col min-h-0 text-gray-900 dark:text-gray-100">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
