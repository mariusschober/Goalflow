
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';

interface DatePickerProps {
    date: string; // YYYY-MM-DD
    onChange: (date: string) => void;
    className?: string;
    customTrigger?: (onClick: () => void, isOpen: boolean) => React.ReactNode;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const DatePicker: React.FC<DatePickerProps> = ({ date, onChange, className, customTrigger }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days');
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({ opacity: 0, pointerEvents: 'none' });
    const [transformOrigin, setTransformOrigin] = useState('origin-top-left');
    
    const [viewDate, setViewDate] = useState(() => {
        return date ? new Date(date) : new Date();
    });

    useEffect(() => {
        if (date) setViewDate(new Date(date));
    }, [date]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                isOpen &&
                containerRef.current &&
                !containerRef.current.contains(target) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', updatePosition, true); // Update on scroll capture
            window.addEventListener('resize', updatePosition);
        }
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen]);

    const updatePosition = () => {
        if (isOpen && containerRef.current && dropdownRef.current) {
            const triggerRect = containerRef.current.getBoundingClientRect();
            const dropdownRect = dropdownRef.current.getBoundingClientRect();
            
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            // Measurements
            const margin = 8;
            // Use rendered dimensions or fallback to defaults if initially hidden/collapsed
            const dropdownHeight = dropdownRect.height || 340; 
            const dropdownWidth = dropdownRect.width || 300;
            
            // Default Position: Bottom Left aligned
            let top = triggerRect.bottom + margin;
            let left = triggerRect.left;
            let originY = 'top';
            let originX = 'left';

            // 1. Vertical Collision (Flip Up)
            // If not enough space below AND there is more space above
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceAbove = triggerRect.top;
            
            if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
                top = triggerRect.top - dropdownHeight - margin;
                originY = 'bottom';
            }

            // 2. Horizontal Collision (Shift Left)
            // If overflowing right edge
            if (left + dropdownWidth > viewportWidth) {
                // Align to right edge of trigger
                const rightAlignedLeft = triggerRect.right - dropdownWidth;
                
                // If right-aligned still overflows left (screen too small), force fit to screen right
                if (rightAlignedLeft < margin) {
                    left = viewportWidth - dropdownWidth - margin;
                } else {
                    left = rightAlignedLeft;
                    originX = 'right';
                }
            }
            
            // 3. Hard Boundary Checks (Safety)
            if (top < 0) top = margin; // Don't go off top
            if (left < 0) left = margin; // Don't go off left

            setDropdownStyle({
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                zIndex: 10005, // High z-index to overlay modals
                opacity: 1,
                pointerEvents: 'auto',
                minWidth: '300px'
            });
            setTransformOrigin(`origin-${originY}-${originX}`);
        }
    };

    // Use LayoutEffect to measure and position before paint
    useLayoutEffect(() => {
        if (isOpen) {
            updatePosition();
        } else {
            // Reset style when closed to ensure clean state on reopen
            setDropdownStyle({ opacity: 0, pointerEvents: 'none', position: 'fixed' });
        }
    }, [isOpen, viewMode, viewDate]); // Re-calculate if view changes (e.g. months view might be shorter)

    const toggleOpen = () => {
        setIsOpen(!isOpen);
        if (!isOpen) setViewMode('days');
    };

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (viewMode === 'days') setViewDate(new Date(year, month - 1, 1));
        else if (viewMode === 'months') setViewDate(new Date(year - 1, month, 1));
        else if (viewMode === 'years') setViewDate(new Date(year - 12, month, 1));
    };
    
    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (viewMode === 'days') setViewDate(new Date(year, month + 1, 1));
        else if (viewMode === 'months') setViewDate(new Date(year + 1, month, 1));
        else if (viewMode === 'years') setViewDate(new Date(year + 12, month, 1));
    };

    const isToday = (d: number) => {
        const today = new Date();
        return d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    };

    const isSameDay = (d: number) => {
        if (!date) return false;
        const [y, m, day] = date.split('-').map(Number);
        return d === day && (month + 1) === m && year === y;
    }

    const handleDayClick = (d: number) => {
        const y = year;
        const m = String(month + 1).padStart(2, '0');
        const day = String(d).padStart(2, '0');
        onChange(`${y}-${m}-${day}`);
        setIsOpen(false);
    };
    
    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return "Select Date";
        const d = new Date(dateStr);
        // Correct timezone offset for display
        const userTimezoneOffset = d.getTimezoneOffset() * 60000;
        const adjustedDate = new Date(d.getTime() + userTimezoneOffset);
        return adjustedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {customTrigger ? (
                customTrigger(toggleOpen, isOpen)
            ) : (
                <button
                    type="button"
                    onClick={toggleOpen}
                    className={`flex items-center gap-3 w-full pl-4 pr-4 py-3 rounded-xl border transition-all duration-200 group
                        ${isOpen 
                            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20 shadow-md' 
                            : 'bg-gray-50 dark:bg-slate-700/50 border-transparent hover:bg-gray-100 dark:hover:bg-slate-600'
                        }
                    `}
                >
                    <CalendarIcon className={`w-5 h-5 transition-colors ${isOpen ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-400'}`} />
                    <span className={`text-sm font-medium ${date ? 'text-gray-800 dark:text-white' : 'text-gray-400'}`}>
                        {date ? formatDateDisplay(date) : "Select Date"}
                    </span>
                </button>
            )}

            {ReactDOM.createPortal(
                <div 
                    ref={dropdownRef}
                    className={`
                        bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-600 p-5 
                        transition-all duration-200 ease-out transform
                        ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2 opacity-0 pointer-events-none'} 
                        ${transformOrigin}
                    `}
                    style={dropdownStyle}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={handlePrev} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition text-gray-500 dark:text-gray-400 hover:text-indigo-600">
                            <ChevronLeftIcon className="w-5 h-5" />
                        </button>
                        
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => setViewMode(viewMode === 'months' ? 'days' : 'months')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'months' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-800 dark:text-white'}`}
                            >
                                {MONTHS[month]}
                            </button>
                            <button 
                                onClick={() => setViewMode(viewMode === 'years' ? 'days' : 'years')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'years' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-800 dark:text-white'}`}
                            >
                                {year}
                            </button>
                        </div>

                        <button onClick={handleNext} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition text-gray-500 dark:text-gray-400 hover:text-indigo-600">
                            <ChevronRightIcon className="w-5 h-5" />
                        </button>
                    </div>
                    
                    {/* Days View */}
                    {viewMode === 'days' && (
                        <div className="animate-fadeIn">
                            <div className="grid grid-cols-7 gap-1 text-center mb-3">
                                {DAYS.map(day => (
                                    <div key={day} className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{day}</div>
                                ))}
                            </div>
                            
                            <div className="grid grid-cols-7 gap-1.5">
                                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                                {Array.from({ length: daysInMonth }).map((_, i) => {
                                    const d = i + 1;
                                    const selected = isSameDay(d);
                                    const today = isToday(d);
                                    return (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => handleDayClick(d)}
                                            className={`
                                                h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 relative group
                                                ${selected 
                                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-105 font-bold z-10' 
                                                    : today 
                                                        ? 'text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-inset ring-indigo-200 dark:ring-indigo-800'
                                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                                                }
                                            `}
                                        >
                                            {d}
                                            {today && !selected && (
                                                <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-indigo-500"></div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Months View */}
                    {viewMode === 'months' && (
                        <div className="grid grid-cols-3 gap-3 py-2 animate-fadeIn">
                            {MONTHS.map((m, i) => (
                                <button
                                    key={m}
                                    onClick={() => {
                                        setViewDate(new Date(year, i, 1));
                                        setViewMode('days');
                                    }}
                                    className={`p-3 rounded-xl text-sm font-bold transition-all ${i === month ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                                >
                                    {m.substring(0, 3)}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Years View */}
                    {viewMode === 'years' && (
                        <div className="grid grid-cols-3 gap-3 py-2 animate-fadeIn overflow-y-auto max-h-[240px] custom-scrollbar">
                            {Array.from({ length: 12 }, (_, i) => year - 6 + i).map(y => (
                                <button
                                    key={y}
                                    onClick={() => {
                                        setViewDate(new Date(y, month, 1));
                                        setViewMode('days');
                                    }}
                                    className={`p-3 rounded-xl text-sm font-bold transition-all ${y === year ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                                >
                                    {y}
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {/* Footer */}
                    <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center">
                        <button 
                            type="button"
                            onClick={() => {
                                const today = new Date();
                                const y = today.getFullYear();
                                const m = String(today.getMonth() + 1).padStart(2, '0');
                                const d = String(today.getDate()).padStart(2, '0');
                                onChange(`${y}-${m}-${d}`);
                                setIsOpen(false);
                            }}
                            className="px-4 py-2 bg-indigo-50 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-xs font-bold rounded-lg text-indigo-700 dark:text-indigo-300 transition"
                        >
                            Today
                        </button>
                        
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            Close
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
