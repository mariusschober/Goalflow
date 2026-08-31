


import React, { useState, useEffect } from 'react';
import { Goal, Habit, TrueNorthGoal, UserProgress } from '../types';
import { PlusIcon, PencilIcon, CompassIcon, SparklesIcon, EyeIcon, ShieldIcon, TrashIcon, CheckIcon, RefreshIcon, ScaleIcon, BrainCircuit, ZapIcon } from './Icons';
import { Modal } from './Modal';
import { GoalForm } from './GoalForm';
import { ExcitementPlanner } from './ExcitementPlanner';
import { AiHabitSuggestion, reduceImportanceWithGemini, ImportanceReductionResult } from '../services/geminiService';
import { getTodayYYYYMMDD } from '../utils/dateUtils';
import { TrueNorthAssessment } from './TrueNorthAssessment';
import { ProgressBar } from './ProgressBar';

interface GoalsViewProps {
  goals: Goal[];
  addGoal: (data: Omit<Goal, 'id' | 'completedTasks' | 'createdAt'>) => string; 
  updateGoal: (goalId: string, updates: Partial<Omit<Goal, 'id'>>) => void;
  deleteGoal: (goalId: string) => void;
  addHabit: (habit: Omit<Habit, 'id' | 'streak' | 'bestStreak' | 'createdAt'>) => void;
  addTask: (task: { title: string; description?: string; dateAssigned: string, goalId?: string, isFrog?: boolean, isRepetitive?: boolean, duration?: number }) => void;
  updateGoalPriorities: (updates: any) => void;
  trueNorthGoals: TrueNorthGoal[];
  addTrueNorthGoal: (data: Omit<TrueNorthGoal, 'id' | 'createdAt'>) => string;
  updateTrueNorthGoal: (id: string, updates: Partial<TrueNorthGoal>) => void;
  deleteTrueNorthGoal: (id: string) => void;
  amalgam: string;
  updateAmalgam: (text: string) => void;
  userProgress: UserProgress;
  openAssessmentOnMount?: boolean;
  onAssessmentOpened?: () => void;
  isAiEnabled?: boolean;
}

// ... (TrueNorthDetailModal, TrueNorthCard, GoalCard components remain the same as previous - including for full context return. Assuming they are preserved by instruction.)

const TrueNorthDetailModal: React.FC<{ 
    goal: TrueNorthGoal | null, 
    isOpen: boolean, 
    onClose: () => void,
    onUpdate: (id: string, data: Partial<TrueNorthGoal>) => void,
    onDelete: (id: string) => void,
    isAiEnabled?: boolean
}> = ({ goal, isOpen, onClose, onUpdate, onDelete, isAiEnabled = true }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [showSafetyNet, setShowSafetyNet] = useState(false);
    
    // Form State
    const [vision, setVision] = useState('');
    const [sensoryDetails, setSensoryDetails] = useState('');
    const [planB, setPlanB] = useState('');
    const [anchorHabit, setAnchorHabit] = useState('');
    const [anchorTask, setAnchorTask] = useState('');
    const [anchorHabitDuration, setAnchorHabitDuration] = useState(15);

    // AI Advice State
    const [advice, setAdvice] = useState<ImportanceReductionResult | null>(null);
    const [isLoadingAdvice, setIsLoadingAdvice] = useState(false);
    const [adviceError, setAdviceError] = useState<string | null>(null);

    useEffect(() => {
        if (goal) {
            setVision(goal.vision);
            setSensoryDetails(goal.sensoryDetails);
            setPlanB(goal.planB);
            setAnchorHabit(goal.anchorHabit || '');
            setAnchorTask(goal.anchorTask || '');
            setAnchorHabitDuration(goal.anchorHabitDuration || 15);
            setIsEditing(false);
            setShowSafetyNet(false);
        }
    }, [goal, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setAdvice(null);
            setAdviceError(null);
        }
    }, [isOpen]);

    const handleGetAdvice = async () => {
        if (!goal) return;
        setIsLoadingAdvice(true);
        setAdviceError(null);
        try {
            const res = await reduceImportanceWithGemini(goal.vision, goal.sensoryDetails || '', goal.planB || '', goal.importance);
            setAdvice(res);
        } catch (err: any) {
            setAdviceError(err?.message || "Failed to load advice.");
        } finally {
            setIsLoadingAdvice(false);
        }
    };

    const handleSave = () => {
        if (goal) {
            onUpdate(goal.id, {
                vision,
                sensoryDetails,
                planB,
                anchorHabit: anchorHabit.trim() || undefined,
                anchorTask: anchorTask.trim() || undefined,
                anchorHabitDuration: anchorHabit.trim() ? anchorHabitDuration : undefined
            });
            setIsEditing(false);
        }
    };

    const handleDelete = () => {
        if (goal && confirm("Are you sure you want to delete this True North Vision?")) {
            onDelete(goal.id);
            onClose();
        }
    };

    if (!isOpen || !goal) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit True North" : "True North Vision"}>
            <div className="flex flex-col h-full max-h-[80vh]">
                {/* Toolbar */}
                <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50 flex justify-between items-center shrink-0">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {isEditing ? 'Editing Mode' : 'View Mode'}
                    </div>
                    <div className="flex gap-2">
                        {isEditing ? (
                            <>
                                <button 
                                    onClick={handleDelete}
                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                    title="Delete Vision"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => setIsEditing(false)}
                                    className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-bold transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleSave}
                                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition flex items-center gap-2"
                                >
                                    <CheckIcon className="w-4 h-4" /> Save
                                </button>
                            </>
                        ) : (
                            <button 
                                onClick={() => setIsEditing(true)}
                                className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-bold hover:bg-gray-200 dark:hover:bg-slate-600 transition flex items-center gap-2"
                            >
                                <PencilIcon className="w-4 h-4" /> Edit
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar flex-grow">
                    {/* Vision Section */}
                    <div>
                        <div className="flex items-center gap-2 text-amber-500 mb-2">
                            <SparklesIcon className="w-5 h-5" />
                            <span className="text-xs font-bold uppercase tracking-widest">Vision</span>
                        </div>
                        {isEditing ? (
                            <input 
                                value={vision}
                                onChange={(e) => setVision(e.target.value)}
                                className="w-full bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl p-3 text-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                placeholder="Your ultimate vision..."
                            />
                        ) : (
                            <h3 className="text-3xl font-heading font-bold text-gray-900 dark:text-white leading-tight mb-2">{vision}</h3>
                        )}
                    </div>

                    {/* Blueprint Section */}
                    <div className={`p-6 rounded-2xl border transition-colors ${isEditing ? 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-slate-600' : 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800'}`}>
                        <h4 className="text-indigo-600 dark:text-indigo-400 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                            <EyeIcon className="w-4 h-4"/> True North Blueprint
                        </h4>
                        {isEditing ? (
                            <textarea 
                                value={sensoryDetails}
                                onChange={(e) => setSensoryDetails(e.target.value)}
                                className="w-full h-40 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl p-3 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                placeholder="Describe the scene vividly..."
                            />
                        ) : (
                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{sensoryDetails}</p>
                        )}
                    </div>

                    {/* Outer Intention Section */}
                    {isEditing ? (
                        <div className="p-6 rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/30 space-y-4">
                            <h4 className="text-gray-900 dark:text-white font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                                <ZapIcon className="w-4 h-4 text-amber-500" /> Outer Intention Physical Anchors
                            </h4>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Dynamic Anchor Habit (Recurring)</label>
                                <input 
                                    value={anchorHabit}
                                    onChange={(e) => setAnchorHabit(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl p-3 text-sm text-gray-955 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    placeholder="Empty (No anchor habit)"
                                />
                            </div>
                            {anchorHabit && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Habit Duration: <strong className="text-amber-500">{anchorHabitDuration} mins</strong></label>
                                    <input 
                                        type="range"
                                        min="5"
                                        max="120"
                                        step="5"
                                        value={anchorHabitDuration}
                                        onChange={(e) => setAnchorHabitDuration(parseInt(e.target.value))}
                                        className="w-full h-1 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">First Action Step (One-off)</label>
                                <input 
                                    value={anchorTask}
                                    onChange={(e) => setAnchorTask(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl p-3 text-sm text-gray-955 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    placeholder="Empty (No action milestone)"
                                />
                            </div>
                        </div>
                    ) : (
                        (goal.anchorHabit || goal.anchorTask) && (
                            <div className="p-6 rounded-2xl border border-amber-200 dark:border-amber-950/30 bg-amber-500/5 dark:bg-amber-950/5 space-y-4">
                                <h4 className="text-amber-600 dark:text-amber-400 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                                    <ZapIcon className="w-4 h-4 text-amber-500" /> Outer Intention Physical Anchors
                                </h4>
                                <div className="space-y-3.5">
                                    {goal.anchorHabit && (
                                        <div className="flex items-start gap-2.5">
                                            <span className="text-sm mt-0.5">🔄</span>
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Daily Habit Anchor</p>
                                                <p className="text-gray-800 dark:text-slate-200 text-sm font-medium">
                                                    {goal.anchorHabit} <span className="text-gray-400 font-normal">({goal.anchorHabitDuration || 15} mins/day)</span>
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    {goal.anchorTask && (
                                        <div className="flex items-start gap-2.5">
                                            <span className="text-sm mt-0.5">⚡</span>
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">First Milestone Step</p>
                                                <p className="text-gray-800 dark:text-slate-200 text-sm font-medium">{goal.anchorTask}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    )}

                    {/* Safety Net Section */}
                    <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                        {!isEditing && (
                            <button 
                                onClick={() => setShowSafetyNet(!showSafetyNet)}
                                className="text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-2 transition-colors"
                            >
                                <ShieldIcon className="w-4 h-4" />
                                {showSafetyNet ? 'Hide Safety Net (Plan B)' : 'View Safety Net (Plan B)'}
                            </button>
                        )}
                        
                        {(showSafetyNet || isEditing) && (
                            <div className={`mt-4 p-4 rounded-xl animate-fadeIn ${isEditing ? '' : 'bg-gray-50 dark:bg-slate-800'}`}>
                                {isEditing && <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Safety Net (Plan B)</label>}
                                {isEditing ? (
                                    <textarea 
                                        value={planB}
                                        onChange={(e) => setPlanB(e.target.value)}
                                        className="w-full h-24 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl p-3 text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                        placeholder="If this doesn't happen..."
                                    />
                                ) : (
                                    <p className="text-gray-500 dark:text-gray-400 text-sm italic">{planB}</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Transurfing Importance Guardrail / Coach Widget */}
                    {!isEditing && isAiEnabled && (
                        <div className="border-t border-gray-100 dark:border-slate-700 pt-6 mt-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2 text-rose-500">
                                    <ScaleIcon className="w-5 h-5 text-rose-500" />
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-rose-500">
                                        Excess Potential Guardrail
                                    </h4>
                                </div>
                                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${goal.importance > 7 ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-200/50' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50'}`}>
                                    Importance: {goal.importance}/10
                                </span>
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                                Law of Importance: High target attachment breeds anxiety and mental blockages. Dissolve obsessiveness into effortless, routing, simple actions.
                            </p>

                            {!advice && !isLoadingAdvice && (
                                <button
                                    onClick={handleGetAdvice}
                                    className="w-full py-2.5 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 focus:outline-none shadow-md shadow-rose-500/10"
                                >
                                    <BrainCircuit className="w-4 h-4 text-white" />
                                    De-escalate Mental Importance (AI Coach)
                                </button>
                            )}

                            {isLoadingAdvice && (
                                <div className="flex flex-col items-center justify-center py-4 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                                    <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                    <p className="text-xs text-slate-500 font-medium">Rebalancing pendulums of desire...</p>
                                </div>
                            )}

                            {advice && (
                                <div className="space-y-4 bg-rose-50/40 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-950/30 p-5 rounded-2xl animate-fadeIn">
                                    <div>
                                        <h5 className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                            <span>📥</span> Low-Pressure Reframing (Mailbox State)
                                        </h5>
                                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 leading-relaxed">
                                            "{advice.reframing}"
                                        </p>
                                    </div>

                                    <div>
                                        <h5 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                            <span>⚡</span> 15-Second Attachment Dissolver
                                        </h5>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                            {advice.importanceExercise}
                                        </p>
                                    </div>

                                    <div className="border-t border-rose-100/50 dark:border-rose-950/30 pt-3 flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 italic">
                                        <span>💡</span>
                                        <span>Zeland Counsel: {advice.coachingTip}</span>
                                    </div>
                                </div>
                            )}

                            {adviceError && (
                                <p className="text-xs text-red-500 mt-2 font-medium">
                                    {adviceError}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

const TrueNorthCard: React.FC<{ goal: TrueNorthGoal; onUpdate: (updates: Partial<TrueNorthGoal>) => void; onDelete: () => void; onClick: () => void; userProgress: UserProgress }> = ({ goal, onUpdate, onDelete, onClick, userProgress }) => {
    return (
        <div className="relative w-full h-[320px] bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-amber-500/30 shadow-lg overflow-hidden p-8 flex flex-col justify-between group hover:shadow-amber-900/20 transition-shadow duration-300">
            <div>
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2 text-amber-400">
                        <SparklesIcon className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-widest">True North</span>
                    </div>
                </div>
                <h3 className="text-2xl font-heading font-bold text-white leading-tight mb-2 line-clamp-3 cursor-pointer hover:text-amber-100 transition-colors" onClick={onClick}>{goal.vision}</h3>
            </div>

            <div className="space-y-6">
                {/* Reality Sync Gamification */}
                <div>
                    <div className="flex justify-between text-[10px] text-amber-400/70 uppercase font-bold mb-1.5">
                        <span>Reality Synchronization</span>
                        <span>Level {userProgress.level}</span>
                    </div>
                    <ProgressBar value={userProgress.xp} max={userProgress.xpToNextLevel} colorClass="bg-gradient-to-r from-amber-500 to-yellow-300" />
                    <p className="text-[10px] text-slate-500 mt-1 text-center">Every step brings you closer.</p>
                </div>

                <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1 uppercase font-bold">
                        <span>Importance Dial</span>
                        <span className={goal.importance > 7 ? 'text-red-400' : 'text-green-400'}>{goal.importance}/10</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max="10" 
                        value={goal.importance}
                        onChange={(e) => onUpdate({ importance: parseInt(e.target.value) })}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                </div>
                
                <button 
                    onClick={onClick}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-amber-200 text-sm font-bold transition flex items-center justify-center gap-2"
                >
                    <EyeIcon className="w-4 h-4" /> View Blueprint
                </button>
            </div>
        </div>
    );
};

const GoalCard: React.FC<{ goal: Goal; onEdit: () => void; onDelete: () => void }> = ({ goal, onEdit, onDelete }) => {
    let daysLeft = 0;
    if (goal.deadline) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [year, month, day] = goal.deadline.split('-').map(Number);
        const end = new Date(year, month - 1, day);
        end.setHours(0, 0, 0, 0);
        const diff = end.getTime() - today.getTime();
        daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    const created = new Date(goal.createdAt);
    const totalDays = goal.deadline ? Math.max(1, Math.ceil((new Date(`${goal.deadline}T12:00:00`).getTime() - created.getTime()) / 86_400_000)) : 1;
    const remainingPercent = Math.max(0, Math.min(100, (Math.max(0, daysLeft) / totalDays) * 100));

    return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 dark:border-slate-700 relative group flex flex-col h-full">
        <div className="absolute top-0 left-0 w-2 h-full rounded-l-2xl" style={{ backgroundColor: goal.color }}></div>
        <div className="pl-4 flex-grow">
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">{goal.name}</h3>
                <div className="flex space-x-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                    <button onClick={onEdit} aria-label={`Edit ${goal.name}`} className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={onDelete} aria-label={`Delete ${goal.name}`} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors">
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 line-clamp-2 min-h-[2.5em]">{goal.description || "No description provided."}</p>
            
            {goal.deadline && (
                <div className="mt-auto">
                     <div className="flex items-end justify-between mb-1">
                        <span className={`text-4xl font-heading font-bold ${daysLeft < 0 ? 'text-red-500' : daysLeft < 7 ? 'text-amber-500' : 'text-gray-800 dark:text-gray-200'}`}>
                             {daysLeft < 0 ? 0 : daysLeft}
                        </span>
                        <span className="text-xs font-bold uppercase text-gray-400 mb-1.5">Days Left</span>
                     </div>
                     <div className="w-full bg-gray-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                         <div className={`h-full rounded-full ${daysLeft < 7 ? 'bg-amber-400 animate-pulse' : 'bg-indigo-500'}`} style={{ width: `${remainingPercent}%` }}></div>
                     </div>
                     {daysLeft < 0 && <p className="text-xs text-red-500 font-bold mt-1">Deadline Passed</p>}
                </div>
            )}
        </div>
    </div>
    );
};

export const GoalsView: React.FC<GoalsViewProps> = ({ 
    goals, addGoal, updateGoal, deleteGoal, addHabit, addTask, updateGoalPriorities,
    trueNorthGoals, addTrueNorthGoal, updateTrueNorthGoal, deleteTrueNorthGoal, amalgam, updateAmalgam, userProgress, openAssessmentOnMount, onAssessmentOpened, isAiEnabled
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAssessmentOpen, setIsAssessmentOpen] = useState(false);
    const [isPlannerOpen, setIsPlannerOpen] = useState(false);
    const [goalToEdit, setGoalToEdit] = useState<Goal | null>(null);
    const [isEditingAmalgam, setIsEditingAmalgam] = useState(false);
    const [tempAmalgam, setTempAmalgam] = useState(amalgam);
    
    const [selectedTrueNorth, setSelectedTrueNorth] = useState<TrueNorthGoal | null>(null);

    useEffect(() => {
        if (openAssessmentOnMount) {
            setIsAssessmentOpen(true);
            if (onAssessmentOpened) {
                onAssessmentOpened();
            }
        }
    }, [openAssessmentOnMount, onAssessmentOpened]);

    const openEditModal = (goal: Goal) => {
        setGoalToEdit(goal);
        setIsModalOpen(true);
    }
    
    const handleDelete = (id: string) => {
        if (confirm("Delete this goal? Tasks will be unlinked.")) deleteGoal(id);
    };
    
    const closeModal = () => {
        setIsModalOpen(false);
        setGoalToEdit(null);
    }
    
    const handlePrioritize = (updates: any) => {
        updateGoalPriorities(updates);
        setIsPlannerOpen(false);
    }

    const handleFormSubmit = (data: Omit<Goal, 'id' | 'completedTasks' | 'createdAt'>, linkedHabits: AiHabitSuggestion[]) => {
        if(goalToEdit) {
            updateGoal(goalToEdit.id, data);
        } else {
            const newGoalId = addGoal(data);
            
            linkedHabits.forEach(h => {
                if (h.type === 'habit') {
                        addHabit({ 
                            title: h.title, 
                            frequency: h.frequency || 'daily', 
                            specificDays: h.frequency === 'specific_days' ? (h.specificDays || []) : undefined,
                            isHighPriority: true,
                            goalId: newGoalId, 
                            duration: h.duration 
                        });
                } else {
                    addTask({ 
                        title: h.title, 
                        description: h.reasoning, 
                        dateAssigned: h.dateAssigned || getTodayYYYYMMDD(), 
                        isFrog: false,
                        goalId: newGoalId, 
                        duration: h.duration 
                    });
                }
            });
        }
    };

    const handleAssessmentComplete = (data: Omit<TrueNorthGoal, 'id' | 'createdAt'>) => {
        const newGoalId = addTrueNorthGoal(data);
        
        if (data.anchorHabit) {
            addHabit({
                title: data.anchorHabit,
                frequency: 'daily',
                isHighPriority: true,
                goalId: newGoalId,
                duration: data.anchorHabitDuration || 15
            });
        }
        
        if (data.anchorTask) {
            addTask({
                title: data.anchorTask,
                dateAssigned: getTodayYYYYMMDD(),
                isFrog: true,
                goalId: newGoalId,
                description: `First physical milestone task for: "${data.vision}"`
            });
        }

        setIsAssessmentOpen(false);
    };

    const saveAmalgam = () => {
        updateAmalgam(tempAmalgam);
        setIsEditingAmalgam(false);
    }
    
    const cancelAmalgam = () => {
        setTempAmalgam(amalgam);
        setIsEditingAmalgam(false);
    }

    // Keyboard shortcut 'N' for New Goal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
                return;
            }
            // Ignore if any modal/overlay is open
            if (isModalOpen || isAssessmentOpen || isPlannerOpen || !!goalToEdit || !!selectedTrueNorth || isEditingAmalgam) return;

            if (e.key.toLowerCase() === 'n') {
                e.preventDefault();
                setGoalToEdit(null);
                setIsModalOpen(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModalOpen, isAssessmentOpen, isPlannerOpen, goalToEdit, selectedTrueNorth, isEditingAmalgam]);

    return (
        <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-12 pb-24">
            
            {/* True North Section */}
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-heading font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            True North <span className="text-amber-500">✦</span>
                        </h2>
                        <p className="text-gray-500 text-sm">The destination chosen by your heart.</p>
                    </div>
                    <button onClick={() => setIsAssessmentOpen(true)} className="text-sm font-bold text-amber-600 dark:text-amber-400 hover:underline">
                        + Add Vision
                    </button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {trueNorthGoals.map(goal => (
                        <TrueNorthCard 
                            key={goal.id} 
                            goal={goal} 
                            onUpdate={(u) => updateTrueNorthGoal(goal.id, u)} 
                            onDelete={() => deleteTrueNorthGoal(goal.id)}
                            onClick={() => setSelectedTrueNorth(goal)}
                            userProgress={userProgress}
                        />
                    ))}
                    {trueNorthGoals.length === 0 && (
                        <div className="h-[320px] bg-gray-50 dark:bg-slate-800/50 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl flex flex-col items-center justify-center text-center p-8">
                            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-500 rounded-full flex items-center justify-center mb-4">
                                <CompassIcon className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200">Define Your Course</h3>
                            <p className="text-gray-500 text-sm mb-6 max-w-xs">"What outcome would make your life feel like an ongoing celebration?"</p>
                            <button onClick={() => setIsAssessmentOpen(true)} className="px-6 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition shadow-lg">
                                Start Assessment
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Amalgam Section */}
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl"></div>
                <div className="flex items-center justify-between mb-2 relative z-10">
                    <span className="text-xs font-bold uppercase tracking-widest opacity-60">Amalgam Background Thought</span>
                    {!isEditingAmalgam && (
                        <button onClick={() => { setTempAmalgam(amalgam); setIsEditingAmalgam(true); }} className="text-xs opacity-60 hover:opacity-100 hover:underline flex items-center gap-1">
                            <PencilIcon className="w-3 h-3" /> Edit
                        </button>
                    )}
                </div>
                {isEditingAmalgam ? (
                    <div className="flex gap-2 relative z-10">
                        <input 
                            value={tempAmalgam}
                            onChange={(e) => setTempAmalgam(e.target.value)}
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-lg font-heading tracking-wide focus:outline-none text-white"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && saveAmalgam()}
                        />
                        <button onClick={saveAmalgam} className="px-4 bg-white text-slate-900 font-bold rounded-lg text-sm hover:bg-gray-100">Save</button>
                        <button onClick={cancelAmalgam} className="px-3 bg-white/10 text-white font-bold rounded-lg text-sm hover:bg-white/20">Cancel</button>
                    </div>
                ) : (
                    <p className="text-2xl sm:text-3xl font-heading font-medium tracking-wider text-center py-2 animate-pulse relative z-10">
                        "{amalgam}"
                    </p>
                )}
            </div>

            {/* Standard Goals Section */}
            <div className="space-y-6 pt-8 border-t border-gray-100 dark:border-slate-700">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-3xl font-heading font-bold text-gray-800 dark:text-white">Tactical Goals</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Deadlines & Milestones</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsPlannerOpen(true)}
                            disabled={goals.length === 0}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-sm transition ${goals.length > 0 ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                        >
                            <CompassIcon className="w-4 h-4"/>
                            <span>Prioritize</span>
                        </button>
                        <button
                            onClick={() => { setGoalToEdit(null); setIsModalOpen(true); }}
                            className="flex items-center space-x-2 px-4 py-2 bg-gray-900 dark:bg-indigo-600 text-white rounded-xl hover:bg-gray-800 dark:hover:bg-indigo-700 transition font-bold text-sm"
                            title="New Goal (n)"
                        >
                            <PlusIcon className="w-4 h-4"/>
                            <span>New Goal</span>
                        </button>
                    </div>
                </div>

                {goals.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {goals.map(goal => (
                            <GoalCard 
                                key={goal.id} 
                                goal={goal} 
                                onEdit={() => openEditModal(goal)} 
                                onDelete={() => handleDelete(goal.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700">
                        No tactical goals yet.
                    </div>
                )}
            </div>
            
            <TrueNorthAssessment 
                isOpen={isAssessmentOpen}
                onClose={() => setIsAssessmentOpen(false)}
                onComplete={handleAssessmentComplete}
                isAiEnabled={isAiEnabled}
            />
            
            {/* Detail Modal for True North */}
            <TrueNorthDetailModal 
                isOpen={!!selectedTrueNorth}
                onClose={() => setSelectedTrueNorth(null)}
                goal={selectedTrueNorth}
                onUpdate={updateTrueNorthGoal}
                onDelete={deleteTrueNorthGoal}
                isAiEnabled={isAiEnabled}
            />

            <Modal isOpen={isModalOpen} onClose={closeModal} title={goalToEdit ? 'Edit Goal' : 'New Tactical Goal'}>
                <GoalForm onSubmit={handleFormSubmit} initialData={goalToEdit} onClose={closeModal} isAiEnabled={isAiEnabled} />
            </Modal>

            {isPlannerOpen && (
                <ExcitementPlanner 
                    items={goals} 
                    mode="goal"
                    onComplete={handlePrioritize} 
                    onClose={() => setIsPlannerOpen(false)}
                    onBreakdown={() => {}} // Goals typically don't have breakdown logic in this planner context, passing dummy
                />
            )}
        </div>
    );
};
