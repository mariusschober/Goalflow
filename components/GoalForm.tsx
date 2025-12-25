
import React, { useState, useEffect, useRef } from 'react';
import { Goal } from '../types';
import { BrainCircuit, PlusIcon, CheckIcon, TrophyIcon, CalendarIcon, RepeatIcon } from './Icons';
import { getGoalHabitSuggestions, AiHabitSuggestion } from '../services/geminiService';
import { getTodayYYYYMMDD } from '../utils/dateUtils';
import { DatePicker } from './DatePicker';

const COLOR_PALETTE = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface GoalFormProps {
  onSubmit: (data: Omit<Goal, 'id' | 'completedTasks' | 'createdAt'>, linkedHabits: AiHabitSuggestion[]) => void;
  initialData?: Goal | null;
  onClose: () => void;
  isAiEnabled?: boolean;
}

export const GoalForm: React.FC<GoalFormProps> = ({ onSubmit, initialData, onClose, isAiEnabled = false }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  
  const defaultDeadline = () => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
  };

  const [deadline, setDeadline] = useState(initialData?.deadline || defaultDeadline());
  const [color, setColor] = useState(initialData?.color || COLOR_PALETTE[0]);
  
  // AI & Habits State
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<AiHabitSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  
  // Custom Item State
  const [customItemTitle, setCustomItemTitle] = useState('');
  const [customEntryType, setCustomEntryType] = useState<'habit' | 'task'>('habit');
  const [customDate, setCustomDate] = useState(getTodayYYYYMMDD());
  const [customFrequency, setCustomFrequency] = useState<'daily' | 'specific_days'>('daily');
  const [customSpecificDays, setCustomSpecificDays] = useState<number[]>([]);

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
  }, [name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && deadline) {
        const habitsToCreate = suggestions.filter((_, idx) => selectedSuggestions.has(idx));
        onSubmit({ name, description, deadline, color, targetTasks: 0 }, habitsToCreate);
        onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSubmit(e as any);
      }
  };

  const handleGeneratePlan = async () => {
      if (!name.trim() || isGenerating) return;
      setIsGenerating(true);
      try {
          const results = await getGoalHabitSuggestions(name, description);
          const currentLength = suggestions.length;
          setSuggestions(prev => [...prev, ...results]);
          
          // Select newly added suggestions by default
          setSelectedSuggestions(prev => {
              const newSet = new Set(prev);
              results.forEach((_, i) => newSet.add(currentLength + i));
              return newSet;
          });
      } catch (e) {
          console.error(e);
      } finally {
          setIsGenerating(false);
      }
  };

  const toggleSuggestion = (index: number) => {
      const newSet = new Set(selectedSuggestions);
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      setSelectedSuggestions(newSet);
  };
  
  const toggleCustomDay = (dayIndex: number) => {
      if (customSpecificDays.includes(dayIndex)) {
          setCustomSpecificDays(customSpecificDays.filter(d => d !== dayIndex));
      } else {
          setCustomSpecificDays([...customSpecificDays, dayIndex].sort());
      }
  };

  const addCustomItem = () => {
      if (!customItemTitle.trim()) return;
      
      const newItem: AiHabitSuggestion = {
          title: customItemTitle,
          reasoning: 'Custom user entry',
          type: customEntryType,
          dateAssigned: customEntryType === 'task' ? customDate : undefined,
          frequency: customEntryType === 'habit' ? customFrequency : undefined,
          specificDays: customEntryType === 'habit' && customFrequency === 'specific_days' ? customSpecificDays : undefined,
          duration: 15
      };

      setSuggestions(prev => [...prev, newItem]);
      setSelectedSuggestions(prev => new Set(prev).add(suggestions.length));
      setCustomItemTitle('');
      setCustomDate(getTodayYYYYMMDD());
      setCustomFrequency('daily');
      setCustomSpecificDays([]);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 min-h-0">
            <form id="goal-form" onSubmit={handleSubmit} className="space-y-8 pb-4">
              
              {/* HERO INPUT */}
              <div className="space-y-2 mt-2">
                 <textarea
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="Tactical Goal..."
                    className="w-full text-2xl md:text-3xl font-bold text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 border-none focus:ring-0 p-0 bg-transparent leading-tight tracking-tight resize-none overflow-hidden"
                    autoFocus
                />
                <div className="h-1.5 w-16 bg-gradient-to-r from-orange-500 to-amber-400 rounded-full" style={{ backgroundColor: color }}></div>
              </div>

              {/* CONTROLS & SETTINGS */}
              <div className="flex flex-wrap gap-4 items-center">
                  
                  {/* Deadline Pill - Using DatePicker Component */}
                  <div className="w-48">
                      <DatePicker 
                        date={deadline}
                        onChange={setDeadline}
                        customTrigger={(onClick, isOpen) => (
                            <button
                                type="button"
                                onClick={onClick}
                                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all ${isOpen ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20' : 'bg-gray-50 dark:bg-slate-700/50 border-transparent hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                            >
                                <CalendarIcon className="w-5 h-5 text-gray-400" />
                                <div className="flex flex-col items-start">
                                    <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider leading-none mb-0.5">Deadline</span>
                                    <span className="text-sm font-bold text-gray-800 dark:text-white truncate">{deadline}</span>
                                </div>
                            </button>
                        )}
                      />
                  </div>

                  {/* Color Picker Pill */}
                  <div className="relative group">
                        <div className="flex items-center gap-2 px-3 py-3 rounded-xl border bg-gray-50 dark:bg-slate-700/50 border-transparent hover:bg-gray-100 dark:hover:bg-slate-700 transition-all cursor-pointer">
                            <div className="w-6 h-6 rounded-full shadow-sm" style={{ backgroundColor: color }}></div>
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Theme</span>
                            
                            {/* Dropdown Color Picker */}
                            <div className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 p-3 rounded-xl shadow-xl border border-gray-100 dark:border-slate-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 grid grid-cols-5 gap-2 w-48">
                                {COLOR_PALETTE.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setColor(c); }}
                                        className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>
                  </div>
              </div>

              {/* DESCRIPTION */}
              <div className="bg-gray-50 dark:bg-slate-700/30 rounded-xl p-4 border border-transparent focus-within:border-indigo-200 dark:focus-within:border-slate-600 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Why is this goal important? (Optional motivation)"
                    className="w-full bg-transparent border-none text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:ring-0 outline-none resize-none"
                  />
              </div>

              {/* ACTION PLAN */}
              <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                  <div className="flex justify-between items-center mb-4">
                       <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                           <BrainCircuit className="w-4 h-4" /> Action Plan
                       </h3>
                       {isAiEnabled && (
                            <button
                                type="button"
                                onClick={handleGeneratePlan}
                                disabled={!name.trim() || isGenerating}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition ${isGenerating ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100'}`}
                            >
                                {isGenerating ? 'Thinking...' : 'Generate with AI'}
                            </button>
                        )}
                  </div>

                  {/* Manual Entry */}
                  <div className="flex gap-2 mb-4">
                        <div className="flex-grow flex bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                            <select 
                                value={customEntryType}
                                onChange={(e) => setCustomEntryType(e.target.value as 'habit' | 'task')}
                                className="bg-gray-50 dark:bg-slate-700 border-r border-gray-200 dark:border-slate-600 px-3 text-xs font-bold text-gray-600 dark:text-gray-300 focus:outline-none"
                            >
                                <option value="habit">Habit</option>
                                <option value="task">Task</option>
                            </select>
                            <input 
                                type="text" 
                                value={customItemTitle}
                                onChange={(e) => setCustomItemTitle(e.target.value)}
                                placeholder="Add habit or milestone..."
                                className="flex-grow px-3 py-2 text-sm bg-transparent border-none focus:ring-0 outline-none text-gray-800 dark:text-white"
                                onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); addCustomItem(); }}}
                            />
                        </div>
                        <button type="button" onClick={addCustomItem} className="bg-gray-900 dark:bg-indigo-600 text-white rounded-xl px-4 hover:bg-gray-800 dark:hover:bg-indigo-700 transition"><PlusIcon className="w-5 h-5" /></button>
                  </div>

                  {/* Suggestion List */}
                  <div className="space-y-2">
                       {suggestions.map((item, idx) => (
                           <div 
                            key={idx}
                            onClick={() => toggleSuggestion(idx)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 group ${selectedSuggestions.has(idx) ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}
                           >
                               <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${selectedSuggestions.has(idx) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 dark:border-gray-500'}`}>
                                   {selectedSuggestions.has(idx) && <CheckIcon className="w-3 h-3 text-white" />}
                               </div>
                               <div className="flex-grow min-w-0">
                                   <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold truncate ${selectedSuggestions.has(idx) ? 'text-indigo-900 dark:text-indigo-200' : 'text-gray-700 dark:text-gray-300'}`}>{item.title}</span>
                                        <span className="text-[9px] uppercase font-bold text-gray-400 border border-gray-200 dark:border-slate-600 px-1.5 rounded">{item.type}</span>
                                   </div>
                                   <p className="text-xs text-gray-400 line-clamp-1">{item.reasoning}</p>
                               </div>
                           </div>
                       ))}
                       {suggestions.length === 0 && (
                           <div className="text-center py-6 text-gray-400 text-xs italic">
                               Add items manually {isAiEnabled ? 'or use AI to generate a plan.' : 'to build your plan.'}
                           </div>
                       )}
                  </div>
              </div>
            </form>
        </div>
      
        {/* Fixed Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 z-10 shrink-0">
            <button 
                onClick={handleSubmit} 
                className="w-full py-4 bg-gray-900 dark:bg-indigo-600 text-white font-bold rounded-2xl hover:bg-gray-800 dark:hover:bg-indigo-700 shadow-lg active:scale-[0.98] transition-all text-lg flex items-center justify-center gap-2"
            >
            <TrophyIcon className="w-6 h-6" />
            {initialData ? 'Save Changes' : 'Create Goal & Start Plan'}
            </button>
        </div>
    </div>
  );
};
