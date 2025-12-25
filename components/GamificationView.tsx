
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Goal, TrueNorthGoal, UserProgress, Habit, Task } from '../types';
import { TrophyIcon, RocketIcon, CompassIcon, ArrowLeftIcon, PlusIcon, FlameIcon, CheckIcon, InfinityIcon } from './Icons';
import { playHoverSound, playSelectSound } from '../utils/audioUtils';

interface GamificationViewProps {
    userProgress: UserProgress;
    trueNorthGoals: TrueNorthGoal[];
    tacticalGoals: Goal[];
    habits?: Habit[];
    completedTasks?: Task[];
    onBack: () => void;
    onOpenTrueNorth: () => void;
    onNavigateToGoals?: () => void;
    onAddHabitClick?: () => void;
    onAddGoalClick?: () => void;
}

export const GamificationView: React.FC<GamificationViewProps> = ({ 
    userProgress, trueNorthGoals, tacticalGoals, habits = [], completedTasks = [],
    onBack, onOpenTrueNorth, onNavigateToGoals, onAddHabitClick, onAddGoalClick 
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(1000); // Default guess
    
    const currentLevel = userProgress.level;
    
    // Sort completed tasks by most recent first
    const history = useMemo(() => {
        return [...completedTasks]
            .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    }, [completedTasks]);

    // Dimensions
    const futureBuffer = 2000;
    const userY = futureBuffer; 
    const historyHeight = Math.max(1500, history.length * 60 + 500);
    const pathHeight = futureBuffer + historyHeight;

    // Scroll Handler
    useEffect(() => {
        const handleScroll = () => {
            if (scrollRef.current) {
                setScrollTop(scrollRef.current.scrollTop);
            }
        };
        const handleResize = () => {
            if (scrollRef.current) {
                setViewportHeight(scrollRef.current.clientHeight);
            }
        };

        const ref = scrollRef.current;
        if (ref) {
            setViewportHeight(ref.clientHeight);
            ref.addEventListener('scroll', handleScroll);
            window.addEventListener('resize', handleResize);
        }
        
        return () => {
            if (ref) ref.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
        }
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onBack();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onBack]);

    // Center User on Mount
    useEffect(() => {
        if (scrollRef.current) {
            const vh = scrollRef.current.clientHeight || window.innerHeight;
            const targetScroll = userY - (vh * 0.5);
            scrollRef.current.scrollTo({ top: targetScroll, behavior: 'auto' });
            // Set initial state after mount
            setScrollTop(targetScroll);
            setViewportHeight(vh);
        }
    }, [userY]);

    // Path Generation (Sine Wave)
    const getXAtY = (y: number) => {
        const width = 1000;
        const center = width / 2;
        const primaryFreq = 0.002;
        const secondaryFreq = 0.01;
        const primaryAmp = 200;
        const secondaryAmp = 50;
        return center + Math.sin(y * primaryFreq) * primaryAmp + Math.cos(y * secondaryFreq) * secondaryAmp;
    };

    // VIRTUALIZATION LOGIC
    // Only calculate path data for the visible window + buffer
    const pathBuffer = 500;
    const visiblePath = useMemo(() => {
        const startY = Math.max(0, scrollTop - pathBuffer);
        const endY = Math.min(pathHeight, scrollTop + viewportHeight + pathBuffer);
        
        let d = "";
        const step = 20;
        // Snap start to step to prevent jitter
        const snappedStart = Math.floor(startY / step) * step;
        
        for (let y = snappedStart; y <= endY; y += step) {
            const x = getXAtY(y);
            if (d === "") d += `M ${x} ${y}`;
            else d += ` L ${x} ${y}`;
        }
        return d;
    }, [scrollTop, viewportHeight, pathHeight]);

    // Filter Visible Nodes
    const isVisible = (y: number) => y >= scrollTop - pathBuffer && y <= scrollTop + viewportHeight + pathBuffer;

    const userX = getXAtY(userY);

    const milestones = useMemo(() => tacticalGoals.map((g, i) => {
        const spacing = 300;
        const y = userY - 350 - (i * spacing); 
        const x = getXAtY(y);
        const side = i % 2 === 0 ? 'right' : 'left'; 
        return { ...g, x, y, side };
    }).filter(n => isVisible(n.y)), [tacticalGoals, userY, scrollTop, viewportHeight]);

    const activeHabitsNodes = useMemo(() => habits.filter(h => h.streak > 0 || h.isHighPriority).map((h, i) => {
        const y = userY - 120 - (i * 90); 
        const x = getXAtY(y);
        const offsetX = (i % 2 === 0 ? 1 : -1) * 40;
        return { ...h, x: x + offsetX, y };
    }).filter(n => isVisible(n.y)), [habits, userY, scrollTop, viewportHeight]);

    const historyNodes = useMemo(() => history.map((task, i) => {
        const yOffset = 150 + (i * 70); 
        const y = userY + yOffset;
        // Optimized: only calculate X if visible
        if (!isVisible(y)) return null;
        const x = getXAtY(y);
        return { ...task, x, y };
    }).filter(Boolean) as (Task & {x: number, y: number})[], [history, userY, scrollTop, viewportHeight]);

    // Static positions
    const addHabitY = Math.max(200, userY - 600); 
    const addHabitNode = { x: getXAtY(addHabitY), y: addHabitY };
    const addGoalY = Math.max(100, userY - 900); 
    const addGoalNode = { x: getXAtY(addGoalY), y: addGoalY };
    const originY = pathHeight - 50;
    const originX = getXAtY(originY);

    const formatCountdown = (dateStr?: string) => {
        if (!dateStr) return null;
        const diff = new Date(dateStr).getTime() - new Date().getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days < 0) return "Overdue";
        if (days > 365) return `${(days/365).toFixed(1)} Years Left`;
        return `${days} Days Left`;
    };

    // Memoize Stars to prevent re-render flicker
    const stars = useMemo(() => Array.from({ length: 150 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 2 + 0.5,
        delay: Math.random() * 5
    })), []);

    return (
        <div className="fixed inset-0 bg-[#020617] z-[200] flex flex-col overflow-hidden text-white font-sans animate-fadeIn select-none">
            
            {/* Background (Fixed) */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[80%] bg-gradient-radial from-indigo-900/20 via-transparent to-transparent opacity-50 blur-3xl"></div>
                <div className="absolute bottom-[-20%] right-[-20%] w-[140%] h-[80%] bg-gradient-radial from-amber-900/10 via-transparent to-transparent opacity-40 blur-3xl"></div>
                {stars.map(star => (
                    <div 
                        key={star.id}
                        className="absolute rounded-full bg-white opacity-40 animate-pulse"
                        style={{
                            left: `${star.left}%`,
                            top: `${star.top}%`,
                            width: `${star.size}px`,
                            height: `${star.size}px`,
                            animationDelay: `${star.delay}s`
                        }}
                    />
                ))}
            </div>

            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-50 pointer-events-none">
                 <div className="pointer-events-auto flex items-center gap-4">
                    <button 
                        onClick={() => { playSelectSound(); onBack(); }}
                        className="bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md p-3 rounded-full transition-all hover:scale-105 border border-white/10 shadow-lg group"
                    >
                        <ArrowLeftIcon className="w-6 h-6 text-slate-400 group-hover:text-white" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-purple-400 drop-shadow-md">
                            Reality Navigator
                        </h1>
                    </div>
                 </div>
                 <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-6 shadow-xl">
                     <div className="text-center">
                         <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">XP</div>
                         <div className="text-amber-400 font-bold font-mono text-lg">{userProgress.xp}</div>
                     </div>
                     <div className="w-px h-8 bg-white/10"></div>
                     <div className="text-center">
                         <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Level</div>
                         <div className="text-purple-400 font-bold font-mono text-2xl">{userProgress.level}</div>
                     </div>
                 </div>
            </div>

            {/* Main Scrollable Map */}
            <div 
                ref={scrollRef}
                className="flex-grow overflow-y-auto overflow-x-hidden relative custom-scrollbar scroll-smooth"
                style={{ perspective: '1000px' }}
            >
                <div className="relative mx-auto" style={{ width: '1000px', height: `${pathHeight}px` }}>
                    
                    {/* The Lifeline Path - Partially Rendered */}
                    <svg className="absolute top-0 left-0 w-full h-full overflow-visible z-10 pointer-events-none">
                        <defs>
                            <linearGradient id="lifelineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
                                <stop offset="10%" stopColor="#f59e0b" stopOpacity="0.8" />
                                <stop offset={`${(userY / pathHeight) * 100 - 10}%`} stopColor="#8b5cf6" stopOpacity="0.6" />
                                <stop offset={`${(userY / pathHeight) * 100}%`} stopColor="#22d3ee" stopOpacity="1" />
                                <stop offset={`${(userY / pathHeight) * 100 + 5}%`} stopColor="#475569" stopOpacity="0.5" />
                                <stop offset="95%" stopColor="#1e293b" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="#1e293b" stopOpacity="0" />
                            </linearGradient>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                                <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                        </defs>
                        
                        {milestones.map(g => (
                            <line 
                                key={`line-${g.id}`} 
                                x1={g.x} y1={g.y} 
                                x2={g.side === 'right' ? g.x + 60 : g.x - 60} 
                                y2={g.y} 
                                stroke={g.color} 
                                strokeWidth="1" 
                                strokeDasharray="4 2" 
                                opacity="0.5" 
                            />
                        ))}

                        <path d={visiblePath} stroke="url(#lifelineGradient)" strokeWidth="6" fill="none" strokeLinecap="round" style={{ filter: 'url(#glow)' }} />
                    </svg>

                    {/* True North Cluster (Always Visible at Top if Scrolled) */}
                    {scrollTop < 1000 && (
                        <div className="absolute left-1/2 -translate-x-1/2 top-20 z-30 flex justify-center items-center w-full pointer-events-none">
                            <div className="pointer-events-auto flex gap-8 justify-center items-end flex-wrap max-w-4xl px-4">
                                {trueNorthGoals.length === 0 ? (
                                    <div className="flex flex-col items-center group cursor-pointer" onClick={() => { playSelectSound(); onOpenTrueNorth(); }}>
                                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 border-4 border-white/20 shadow-2xl flex items-center justify-center relative z-10">
                                            <CompassIcon className="w-12 h-12 text-white" />
                                        </div>
                                        <div className="mt-4 bg-amber-950/60 backdrop-blur-md border border-amber-500/30 px-6 py-3 rounded-2xl text-center shadow-2xl">
                                            <p className="text-white font-bold text-sm tracking-wide">Define Vision</p>
                                        </div>
                                    </div>
                                ) : (
                                    trueNorthGoals.map((tn) => (
                                        <div key={tn.id} className="flex flex-col items-center group cursor-pointer transform hover:-translate-y-2 transition-transform duration-300" onClick={() => { playSelectSound(); onOpenTrueNorth(); }}>
                                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 border-4 border-white/20 shadow-2xl flex items-center justify-center relative z-10">
                                                <CompassIcon className="w-10 h-10 text-white" />
                                            </div>
                                            <div className="mt-4 bg-amber-950/60 backdrop-blur-md border border-amber-500/30 px-6 py-3 rounded-2xl text-center shadow-xl max-w-[200px]">
                                                <p className="text-white font-bold text-sm tracking-wide leading-tight line-clamp-2">{tn.vision}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {activeHabitsNodes.map((habit) => (
                        <div key={habit.id} className="absolute z-20 flex items-center group cursor-default" style={{ left: habit.x, top: habit.y, transform: 'translate(-50%, -50%)' }}>
                            <div className={`w-4 h-4 rounded-full shadow-[0_0_15px_currentColor] z-10 ${habit.streak > 0 ? 'bg-cyan-400 text-cyan-400' : 'bg-slate-600 text-slate-500'}`}></div>
                            <div className="absolute left-full ml-3 bg-slate-900/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 whitespace-nowrap">
                                <span className="text-[10px] font-bold text-gray-300">{habit.title}</span>
                                {habit.streak > 0 && <span className="flex items-center text-[9px] font-bold text-cyan-400"><FlameIcon className="w-2.5 h-2.5 mr-0.5" /> {habit.streak}</span>}
                            </div>
                        </div>
                    ))}

                    {milestones.map((goal) => {
                        const timeLeft = formatCountdown(goal.deadline);
                        const isRight = goal.side === 'right';
                        return (
                            <div key={goal.id} className="absolute z-20 flex flex-col items-center group" style={{ left: isRight ? goal.x + 60 : goal.x - 60, top: goal.y, transform: 'translate(-50%, -50%)', flexDirection: isRight ? 'row' : 'row-reverse' }} onClick={() => { playSelectSound(); if (onNavigateToGoals) onNavigateToGoals(); }}>
                                <div className={`w-3 h-3 rounded-full border-2 bg-slate-900 z-10 ${isRight ? '-ml-3' : '-mr-3'}`} style={{ borderColor: goal.color }}></div>
                                <div className="bg-slate-900/90 backdrop-blur-xl border-l-4 rounded-xl shadow-2xl p-4 min-w-[240px] max-w-[300px] transform transition-all duration-300 group-hover:scale-105 cursor-pointer" style={{ borderLeftColor: goal.color, boxShadow: `0 0 30px ${goal.color}15` }}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-sm font-bold text-white leading-tight">{goal.name}</h3>
                                        <TrophyIcon className="w-4 h-4 opacity-50 shrink-0 ml-2" style={{ color: goal.color }} />
                                    </div>
                                    {timeLeft && <div className="text-[10px] font-mono text-gray-400 bg-black/30 px-2 py-1 rounded inline-block border border-white/5">{timeLeft}</div>}
                                </div>
                            </div>
                        );
                    })}

                    {/* Add Buttons (Only show if in range) */}
                    {isVisible(addHabitY) && (
                        <div className="absolute z-30 group cursor-pointer flex items-center justify-center" style={{ left: addHabitNode.x, top: addHabitNode.y, transform: 'translate(-50%, -50%)' }} onClick={() => { playSelectSound(); if(onAddHabitClick) onAddHabitClick(); }}>
                            <div className="w-8 h-8 rounded-full bg-slate-900 border border-dashed border-blue-400/50 flex items-center justify-center hover:border-blue-400 hover:bg-blue-900/30 transition-all">
                                <PlusIcon className="w-4 h-4 text-blue-400" />
                            </div>
                        </div>
                    )}
                    {isVisible(addGoalY) && (
                        <div className="absolute z-30 group cursor-pointer flex items-center justify-center" style={{ left: addGoalNode.x, top: addGoalNode.y, transform: 'translate(-50%, -50%)' }} onClick={() => { playSelectSound(); if(onAddGoalClick) onAddGoalClick(); }}>
                            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-dashed border-indigo-400/50 flex items-center justify-center hover:border-indigo-400 hover:bg-indigo-900/30 transition-all rotate-45 hover:rotate-0">
                                <PlusIcon className="w-5 h-5 text-indigo-400 transform -rotate-45 group-hover:rotate-0 transition-transform" />
                            </div>
                        </div>
                    )}

                    {historyNodes.map((task) => (
                        <div key={task.id} className="absolute z-10 flex items-center group/history" style={{ left: task.x, top: task.y, transform: 'translate(-50%, -50%)' }}>
                            <div className={`w-2 h-2 rotate-45 transform transition-all group-hover/history:scale-150 ${task.isFrog ? 'bg-green-400' : 'bg-slate-400'}`}></div>
                            <div className="ml-4 opacity-40 group-hover/history:opacity-100 transition-opacity flex items-center gap-2">
                                <span className={`text-[10px] line-through ${task.isFrog ? 'text-green-500/70' : 'text-slate-500'} font-medium whitespace-nowrap max-w-[200px] truncate`}>{task.title}</span>
                            </div>
                        </div>
                    ))}

                    {isVisible(originY) && (
                        <div className="absolute z-10 flex flex-col items-center" style={{ left: originX, top: originY, transform: 'translate(-50%, -50%)' }}>
                            <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)] animate-pulse"></div>
                            <div className="mt-2 text-[9px] text-emerald-500 font-bold uppercase tracking-[0.2em] opacity-50">Origin</div>
                        </div>
                    )}

                    {/* USER AVATAR (Always Visible if in Range of UserY, typically fixed) */}
                    {isVisible(userY) && (
                        <div className="absolute z-40" style={{ left: userX, top: userY, transform: 'translate(-50%, -50%)' }}>
                            <div className="relative">
                                <div className="absolute inset-0 bg-cyan-400 rounded-full blur-2xl opacity-40 animate-pulse"></div>
                                <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-700 rounded-full border-2 border-white shadow-[0_0_40px_rgba(34,211,238,0.6)] flex items-center justify-center relative z-10 overflow-hidden">
                                    <RocketIcon className="w-8 h-8 text-white transform -rotate-45 drop-shadow-md" />
                                </div>
                                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-cyan-500/50 text-cyan-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shadow-lg z-20 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                                    Now (Lvl {currentLevel})
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
