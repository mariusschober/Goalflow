
import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { Task } from '../types';
import { YellowPad } from './YellowPad';
import { CheckIcon, SearchIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  allTasks: Task[];
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, allTasks }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Task[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setExpandedTaskId(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = allTasks.filter(task => {
      const inTitle = task.title.toLowerCase().includes(lowerQuery);
      const inNotes = task.description?.toLowerCase().includes(lowerQuery);
      const inHashtags = task.hashtags.some(t => t.toLowerCase().includes(lowerQuery));
      return inTitle || inNotes || inHashtags;
    });

    setResults(filtered.slice(0, 20)); // Limit to 20 results for performance
  }, [query, allTasks]);

  const toggleExpand = (id: string) => {
    setExpandedTaskId(expandedTaskId === id ? null : id);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Search Tasks">
      <div className="p-6 min-h-[50vh] flex flex-col">
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, notes, or #tags..."
            className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg outline-none text-gray-900 dark:text-white placeholder-gray-500"
          />
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-2 max-h-[60vh]">
          {results.length === 0 && query.trim() && (
            <div className="text-center text-gray-400 py-10">
              No tasks found matching "{query}"
            </div>
          )}

          {results.map(task => (
            <div key={task.id} className="border border-gray-100 dark:border-slate-700 rounded-lg overflow-hidden">
                <div 
                    onClick={() => toggleExpand(task.id)}
                    className={`p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${task.completed ? 'bg-gray-50/50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-800'}`}
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs ${task.completed ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800'}`}>
                            {task.completed ? <CheckIcon className="w-4 h-4" /> : (task.isFrog ? '🐸' : '●')}
                        </div>
                        <div className="min-w-0">
                            <p className={`font-medium truncate ${task.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                                {task.title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                                {task.completed ? (
                                    <span>Completed {new Date(task.completedAt!).toLocaleDateString()}</span>
                                ) : (
                                    <span>Due {new Date(task.dateAssigned).toLocaleDateString()}</span>
                                )}
                                {task.hashtags.length > 0 && (
                                    <>
                                        <span>•</span>
                                        <div className="flex gap-1">
                                            {task.hashtags.map(t => <span key={t} className="text-blue-400">#{t}</span>)}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-gray-300 dark:text-gray-600">
                         {expandedTaskId === task.id ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                    </div>
                </div>
                
                {expandedTaskId === task.id && (
                    <div className="h-48 border-t border-gray-100 dark:border-slate-700 bg-yellow-50/30 dark:bg-yellow-900/10">
                         <YellowPad 
                            content={task.description || ""} 
                            onChange={() => {}} 
                            readOnly={true}
                            placeholder="No notes."
                            className="h-full"
                        />
                    </div>
                )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
