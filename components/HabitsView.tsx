
import React, { useState, useEffect } from 'react';
import { Habit, Goal } from '../types';
import { FlameIcon, PlusIcon, RepeatIcon, TrashIcon, PencilIcon, TrophyIcon } from './Icons';
import { Modal } from './Modal';
import { HabitForm } from './HabitForm';

interface HabitsViewProps {
  habits: Habit[];
  goals: Goal[];
  addHabit: (habit: Omit<Habit, 'id' | 'streak' | 'bestStreak' | 'createdAt'>) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
}

const HabitCard: React.FC<{ habit: Habit, goal?: Goal, onEdit: () => void, onDelete: () => void }> = ({ habit, goal, onEdit, onDelete }) => {
    // Heatmap Logic
    let bgClass = 'bg-gray-50 border-gray-200 dark:bg-slate-800 dark:border-slate-700';
    let textClass = 'text-gray-500 dark:text-gray-400';
    let flameColor = 'text-gray-300 dark:text-slate-600';

    if (habit.streak > 0) {
        if (habit.streak < 3) {
            bgClass = 'bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-800';
            textClass = 'text-green-700 dark:text-green-400';
            flameColor = 'text-green-400 dark:text-green-600';
        } else if (habit.streak < 7) {
            bgClass = 'bg-green-100 border-green-200 dark:bg-green-900/40 dark:border-green-700';
            textClass = 'text-green-800 dark:text-green-300';
            flameColor = 'text-green-500 dark:text-green-400';
        } else if (habit.streak < 21) {
            bgClass = 'bg-green-500 border-green-600 dark:bg-green-700 dark:border-green-600';
            textClass = 'text-white';
            flameColor = 'text-white';
        } else {
            bgClass = 'bg-yellow-400 border-yellow-500 dark:bg-yellow-600 dark:border-yellow-500';
            textClass = 'text-yellow-900 dark:text-yellow-100';
            flameColor = 'text-white';
        }
    }

    const getFreqText = () => {
        if (habit.frequency === 'daily') return 'Daily';
        if (habit.frequency === 'specific_days') return 'Specific Days';
        return '';
    }

    return (
        <div className={`p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md group relative overflow-hidden ${bgClass}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className={`font-bold text-lg ${textClass}`}>{habit.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={`text-xs font-medium opacity-80 ${textClass}`}>{getFreqText()}</span >
                        {goal && (
                            <span 
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 backdrop-blur-sm" 
                                style={{ color: habit.streak >= 7 ? 'white' : goal.color }}
                            >
                                <div className="w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: habit.streak >= 7 ? 'white' : goal.color }}></div>
                                {goal.name}
                            </span>
                        )}
                    </div>
                    {habit.isHighPriority && (
                        <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-black/10 dark:bg-white/10 text-current">
                            High Priority
                        </span>
                    )}
                </div>
                <div className="flex flex-col items-center">
                     <FlameIcon className={`w-8 h-8 ${flameColor} mb-1`} />
                     <span className={`font-heading font-bold text-2xl ${textClass}`}>{habit.streak}</span>
                </div>
            </div>
            
            <div className="absolute bottom-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                 <button onClick={onEdit} className="p-2 bg-white/20 hover:bg-white/40 backdrop-blur-sm rounded-full text-current transition">
                     <PencilIcon className="w-4 h-4" />
                 </button>
                 <button onClick={onDelete} className="p-2 bg-white/20 hover:bg-red-500 hover:text-white backdrop-blur-sm rounded-full text-current transition">
                     <TrashIcon className="w-4 h-4" />
                 </button>
            </div>
        </div>
    );
}

export const HabitsView: React.FC<HabitsViewProps> = ({ habits, goals, addHabit, updateHabit, deleteHabit }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [habitToEdit, setHabitToEdit] = useState<Habit | null>(null);

  const openAdd = () => {
      setHabitToEdit(null);
      setIsModalOpen(true);
  };

  const openEdit = (h: Habit) => {
      setHabitToEdit(h);
      setIsModalOpen(true);
  };

  const handleFormSubmit = (data: Omit<Habit, 'id' | 'streak' | 'bestStreak' | 'createdAt'>) => {
      if (habitToEdit) {
          updateHabit(habitToEdit.id, data);
      } else {
          addHabit(data);
      }
  };

  // Keyboard shortcut 'N' for New Habit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
            return;
        }
        
        if (isModalOpen) return;

        if (e.key.toLowerCase() === 'n') {
            e.preventDefault();
            openAdd();
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8">
        <div className="flex justify-between items-center mb-8">
            <div>
                <h2 className="text-4xl font-heading font-bold text-gray-800 dark:text-white">Habit Loops</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Consistency builds momentum.</p>
            </div>
            <button onClick={openAdd} className="bg-gray-900 dark:bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold shadow-lg hover:bg-gray-800 dark:hover:bg-indigo-700 transition flex items-center gap-2" title="New Habit (n)">
                <PlusIcon className="w-5 h-5" /> New Habit
            </button>
        </div>

        {habits.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {habits.map(habit => (
                    <HabitCard 
                        key={habit.id} 
                        habit={habit}
                        goal={goals.find(g => g.id === habit.goalId)}
                        onEdit={() => openEdit(habit)} 
                        onDelete={() => {
                            if(confirm("Delete this habit? Associated tasks will remain but streak will be lost.")) {
                                deleteHabit(habit.id);
                            }
                        }} 
                    />
                ))}
            </div>
        ) : (
            <div className="text-center py-20 bg-gray-50 dark:bg-slate-800 rounded-3xl border border-dashed border-gray-300 dark:border-slate-700">
                 <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-300 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-6">
                     <RepeatIcon className="w-10 h-10" />
                 </div>
                 <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">No habits yet</h3>
                 <p className="text-gray-400 dark:text-gray-500 mt-2 mb-8">Start small. Build a chain.</p>
                 <button onClick={openAdd} className="text-indigo-600 dark:text-indigo-400 font-bold hover:text-indigo-800 dark:hover:text-indigo-300">Create your first habit</button>
            </div>
        )}

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={habitToEdit ? 'Edit Habit' : 'New Habit'}>
            <HabitForm onSubmit={handleFormSubmit} initialData={habitToEdit} goals={goals} onClose={() => setIsModalOpen(false)} />
        </Modal>
    </div>
  );
};
