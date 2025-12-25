

import React, { useState } from 'react';
import { Task, HashtagConfig, Goal } from '../types';
import { Modal } from './Modal';
import { ArrowUpCircleIcon, BrainCircuit, CalendarIcon, CheckIcon, PencilIcon, TrophyIcon, RefreshIcon } from './Icons';
import { breakdownTaskWithGemini } from '../services/geminiService';
import { getTodayYYYYMMDD, getTomorrowYYYYMMDD, toYYYYMMDD } from '../utils/dateUtils';

interface HashtagManagerProps {
    hashtag: string | null;
    onClose: () => void;
    tasks: Task[];
    goals: Goal[];
    config: HashtagConfig | undefined;
    onUpdateConfig: (tag: string, updates: Partial<HashtagConfig>) => void;
    onUpdateTask: (id: string, updates: Partial<Task>) => void;
    onMoveToToday: (id: string) => void;
    onAddSubtasks: (subtasks: { title: string; duration: number }[], parent: Task) => void;
    onOpenEditModal: (task: Task) => void;
}

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'];

export const HashtagManager: React.FC<HashtagManagerProps> = ({ 
    hashtag, onClose, tasks, goals, config, onUpdateConfig, onUpdateTask, onMoveToToday, onAddSubtasks, onOpenEditModal 
}) => {
    const [breakdownLoadingId, setBreakdownLoadingId] = useState<string | null>(null);
    const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null);

    if (!hashtag) return null;

    const currentColor = config?.color || '#3b82f6';
    const linkedGoalId = config?.linkedGoalId || '';
    
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return b.createdAt - a.createdAt;
    });

    const handleBreakdown = async (task: Task) => {
        if (breakdownLoadingId) return;
        setBreakdownLoadingId(task.id);
        try {
            const subtasks = await breakdownTaskWithGemini(task.title);
            if (subtasks.length > 0) {
                 const mapped = subtasks.map(s => ({ title: s.title, duration: s.estimatedDuration }));
                 onAddSubtasks(mapped, task);
                 alert(`Added ${subtasks.length} subtasks!`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setBreakdownLoadingId(null);
        }
    };

    const handleRescheduleSubmit = (taskId: string, date: string) => {
        if (date) {
            onUpdateTask(taskId, { dateAssigned: date });
            setRescheduleTaskId(null);
        }
    };
    
    const handleNextWeek = (taskId: string) => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        handleRescheduleSubmit(taskId, toYYYYMMDD(d));
    };

    return (
        <div className="z-[110]">
            <Modal isOpen={!!hashtag} onClose={onClose} title={`#${hashtag}`}>
                <div className="flex flex-col h-full bg-white dark:bg-slate-800">
                    {/* Settings Header */}
                    <div className="p-6 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50 space-y-4">
                        <div className="flex flex-col md:flex-row gap-6">
                            {/* Color Picker */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Tag Color</label>
                                <div className="flex flex-wrap gap-2 items-center">
                                    {COLORS.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => onUpdateConfig(hashtag, { color: c })}
                                            className={`w-6 h-6 rounded-full transition-transform ${currentColor === c ? 'scale-125 ring-2 ring-offset-2 ring-indigo-500' : 'hover:scale-110'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                    <div className="relative w-8 h-8 rounded-md border border-gray-200 dark:border-slate-600 flex items-center justify-center overflow-hidden">
                                        <input 
                                            type="color" 
                                            value={currentColor}
                                            onChange={(e) => onUpdateConfig(hashtag, { color: e.target.value })}
                                            className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer"
                                        />
                                    </div>
                                    <button 
                                        onClick={() => onUpdateConfig(hashtag, { color: undefined })}
                                        className="text-xs text-gray-400 hover:text-red-500 underline ml-2"
                                        title="Reset to default (no color)"
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>

                            {/* Goal Link */}
                            <div className="flex-grow">
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Link to Goal</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <TrophyIcon className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <select
                                        value={linkedGoalId}
                                        onChange={(e) => onUpdateConfig(hashtag, { linkedGoalId: e.target.value })}
                                        className="block w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none"
                                    >
                                        <option value="">No linked goal</option>
                                        {goals.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">Tasks with this tag will automatically link to this goal.</p>
                            </div>
                        </div>
                    </div>

                    {/* Task List */}
                    <div className="flex-grow overflow-y-auto custom-scrollbar p-6">
                        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                            Linked Tasks ({tasks.length})
                        </h3>
                        
                        {tasks.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">No tasks found with this hashtag.</div>
                        ) : (
                            <div className="space-y-3">
                                {sortedTasks.map(task => (
                                    <div key={task.id} className={`p-4 rounded-xl border transition-all ${task.completed ? 'bg-gray-50 dark:bg-slate-900 border-gray-100 dark:border-slate-800 opacity-60' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm'}`}>
                                        <div className="flex items-start gap-3">
                                            <button 
                                                onClick={() => onUpdateTask(task.id, { completed: !task.completed, completedAt: !task.completed ? Date.now() : undefined })}
                                                className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${task.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-500 text-transparent hover:border-green-500'}`}
                                            >
                                                <CheckIcon className="w-3 h-3" />
                                            </button>
                                            
                                            <div className="flex-grow min-w-0">
                                                <p className={`font-medium ${task.completed ? 'line-through text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                                                    {task.title}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                                                    {task.dateAssigned === getTodayYYYYMMDD() ? <span className="text-green-500 font-bold">Today</span> : <span>{task.dateAssigned}</span>}
                                                    {task.duration && <span>• {task.duration}m</span>}
                                                </div>
                                            </div>
                                        </div>

                                        {!task.completed && (
                                            <div className="mt-3 pl-8 flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                                                {rescheduleTaskId === task.id ? (
                                                    <div className="flex items-center gap-2 w-full animate-fadeIn bg-gray-50 dark:bg-slate-900 p-2 rounded-lg border border-indigo-100 dark:border-slate-600">
                                                        <button 
                                                            onClick={() => handleRescheduleSubmit(task.id, getTomorrowYYYYMMDD())}
                                                            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-md text-xs font-bold hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm"
                                                        >
                                                            Tomorrow
                                                        </button>
                                                        <button 
                                                            onClick={() => handleNextWeek(task.id)}
                                                            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-md text-xs font-bold hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm"
                                                        >
                                                            Next Week
                                                        </button>
                                                        <input 
                                                            type="date" 
                                                            className="px-2 py-1 text-xs border rounded-md dark:bg-slate-700 dark:border-slate-600 text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                                            onChange={(e) => handleRescheduleSubmit(task.id, e.target.value)}
                                                        />
                                                        <button onClick={() => setRescheduleTaskId(null)} className="text-xs text-red-500 hover:text-red-600 ml-auto px-2">
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button 
                                                            onClick={() => { onMoveToToday(task.id); onClose(); }}
                                                            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center gap-1"
                                                        >
                                                            <ArrowUpCircleIcon className="w-3 h-3" /> Do Now
                                                        </button>
                                                        <button 
                                                            onClick={() => { onOpenEditModal(task); onClose(); }}
                                                            className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-200 dark:hover:bg-slate-600 flex items-center gap-1"
                                                        >
                                                            <PencilIcon className="w-3 h-3" /> Edit
                                                        </button>
                                                        <button 
                                                            onClick={() => setRescheduleTaskId(task.id)}
                                                            className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-200 dark:hover:bg-slate-600 flex items-center gap-1"
                                                        >
                                                            <CalendarIcon className="w-3 h-3" /> Reschedule
                                                        </button>
                                                        <button 
                                                            onClick={() => handleBreakdown(task)}
                                                            disabled={!!breakdownLoadingId}
                                                            className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded-lg text-xs font-bold hover:bg-purple-100 dark:hover:bg-purple-900/50 flex items-center gap-1"
                                                        >
                                                            <BrainCircuit className="w-3 h-3" /> {breakdownLoadingId === task.id ? 'Thinking...' : 'Breakdown'}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
};