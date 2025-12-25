
import React, { useState, useEffect, useRef } from 'react';
import { Habit, Goal } from '../types';
import { RepeatIcon, FlameIcon, TrophyIcon, PlusIcon } from './Icons';

interface HabitFormProps {
  onSubmit: (data: Omit<Habit, 'id' | 'streak' | 'bestStreak' | 'createdAt'>) => void;
  initialData?: Habit | null;
  goals: Goal[];
  onClose: () => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TOP_DURATIONS = [15, 30, 45, 60, 90];

export const HabitForm: React.FC<HabitFormProps> = ({ onSubmit, initialData, goals, onClose }) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [frequency, setFrequency] = useState<Habit['frequency']>(initialData?.frequency || 'daily');
  const [specificDays, setSpecificDays] = useState<number[]>(initialData?.specificDays || []);
  const [isHighPriority, setIsHighPriority] = useState(initialData?.isHighPriority || false);
  const [goalId, setGoalId] = useState(initialData?.goalId || '');
  
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            adjustHeight();
        }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const adjustHeight = () => {
      if (inputRef.current) {
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      }
  };

  useEffect(() => {
      adjustHeight();
  }, [title]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    onSubmit({
        title,
        frequency,
        specificDays: frequency === 'specific_days' ? specificDays : undefined,
        isHighPriority,
        goalId: goalId || undefined
    });
    onClose();
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSubmit(e as any);
      }
  };
  
  const addDuration = (minutes: number) => {
      setTitle(prev => `${prev} @${minutes}m `);
      inputRef.current?.focus();
  };

  const toggleDay = (dayIndex: number) => {
      if (specificDays.includes(dayIndex)) {
          setSpecificDays(specificDays.filter(d => d !== dayIndex));
      } else {
          setSpecificDays([...specificDays, dayIndex].sort());
      }
  };

  const selectedGoal = goals.find(g => g.id === goalId);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 min-h-0">
            <form id="habit-form" onSubmit={handleSubmit} className="space-y-8 pb-4">
              
              {/* HERO INPUT */}
              <div className="space-y-2 mt-2">
                 <textarea
                    ref={inputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="New habit loop..."
                    className="w-full text-2xl md:text-3xl font-bold text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 border-none focus:ring-0 p-0 bg-transparent leading-tight tracking-tight resize-none overflow-hidden"
                    autoFocus
                />
                <div className="h-1.5 w-16 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"></div>
              </div>

              {/* QUICK SUGGESTIONS */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                    {TOP_DURATIONS.map(min => (
                        <button 
                            key={min} 
                            type="button" 
                            onClick={() => addDuration(min)}
                            className="px-3 py-1.5 bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-bold hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-600 transition shrink-0"
                        >
                            @{min}m
                        </button>
                    ))}
              </div>

              {/* CONTROLS ROW */}
              <div className="flex flex-wrap gap-4 items-start">
                 {/* Frequency Selector */}
                 <div className="flex bg-gray-50 dark:bg-slate-700/50 p-1 rounded-xl border border-transparent dark:border-slate-700">
                     <button
                        type="button"
                        onClick={() => setFrequency('daily')}
                        className={`px-4 py-3 rounded-lg text-sm font-bold transition-all ${frequency === 'daily' ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                     >
                         Daily
                     </button>
                     <button
                        type="button"
                        onClick={() => setFrequency('specific_days')}
                        className={`px-4 py-3 rounded-lg text-sm font-bold transition-all ${frequency === 'specific_days' ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                     >
                         Specific Days
                     </button>
                 </div>

                 {/* Goal Selector Pill */}
                 <div className="relative group">
                     <div className={`flex items-center rounded-xl px-4 py-3 transition-all cursor-pointer border ${goalId ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' : 'bg-gray-50 dark:bg-slate-700/50 border-transparent hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                         <TrophyIcon className={`w-5 h-5 mr-2 ${goalId ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                         <select
                            value={goalId}
                            onChange={(e) => setGoalId(e.target.value)}
                            className="appearance-none bg-transparent border-none p-0 pr-6 text-sm font-bold focus:ring-0 cursor-pointer w-full text-gray-700 dark:text-gray-200 outline-none"
                         >
                            <option value="" className="dark:bg-slate-800">No Goal Linked</option>
                            {goals.map(goal => (
                                <option key={goal.id} value={goal.id} className="dark:bg-slate-800">{goal.name}</option>
                            ))}
                         </select>
                         {selectedGoal && <div className="w-2 h-2 rounded-full absolute right-3 top-1/2 -translate-y-1/2" style={{ backgroundColor: selectedGoal.color }}></div>}
                    </div>
                </div>
                
                {/* Priority Toggle */}
                <button
                    type="button"
                    onClick={() => setIsHighPriority(!isHighPriority)}
                    className={`flex items-center px-4 py-3 rounded-xl border transition-all ${isHighPriority ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400' : 'bg-gray-50 dark:bg-slate-700/50 border-transparent hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400'}`}
                >
                    <FlameIcon className="w-5 h-5 mr-2" />
                    <span className="text-sm font-bold">High Priority</span>
                </button>
              </div>

              {frequency === 'specific_days' && (
                  <div className="animate-fadeIn p-5 bg-gray-50 dark:bg-slate-700/30 rounded-2xl border border-gray-100 dark:border-slate-700">
                      <label className="block text-xs font-bold uppercase text-gray-400 mb-4 tracking-wider">Select Days</label>
                      <div className="flex justify-between gap-1">
                          {DAYS.map((day, index) => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleDay(index)}
                                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full text-xs font-bold flex items-center justify-center transition-all ${specificDays.includes(index) ? 'bg-indigo-600 text-white shadow-md scale-110' : 'bg-white dark:bg-slate-600 text-gray-400 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-500'}`}
                              >
                                  {day[0]}
                              </button>
                          ))}
                      </div>
                  </div>
              )}
            </form>
        </div>

        {/* Fixed Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 z-10 shrink-0">
            <button 
                type="submit" 
                form="habit-form"
                disabled={!title.trim()} 
                className={`w-full py-4 bg-gray-900 dark:bg-indigo-600 text-white font-bold rounded-2xl hover:bg-gray-800 dark:hover:bg-indigo-700 transition shadow-lg active:scale-[0.98] flex items-center justify-center gap-3 text-lg ${!title.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <RepeatIcon className="w-5 h-5" />
                {initialData ? 'Update Habit' : 'Start Habit Loop'}
            </button>
        </div>
    </div>
  );
};
