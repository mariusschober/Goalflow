
import React, { useState } from 'react';
import { Task, HashtagConfig } from '../types';
import { CheckIcon, ClockIcon, ChevronDownIcon, ChevronUpIcon, ArrowLeftIcon } from './Icons';
import { YellowPad } from './YellowPad';

interface DoneViewProps {
  tasks: Task[];
  hashtagConfigs: Record<string, HashtagConfig>;
  onSelectHashtag: (tag: string) => void;
  onBack: () => void;
}

export const DoneView: React.FC<DoneViewProps> = ({ tasks, hashtagConfigs, onSelectHashtag, onBack }) => {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedTaskId(expandedTaskId === id ? null : id);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <div className="flex items-center mb-8">
          <button 
            onClick={onBack}
            className="mr-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors group"
            title="Back to Stats"
          >
              <ArrowLeftIcon className="w-6 h-6 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
          </button>
          <h2 className="text-4xl font-heading font-bold text-gray-800 dark:text-white">Accomplished</h2>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
            <div className="w-20 h-20 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-6">
            <CheckIcon className="w-10 h-10 text-gray-300 dark:text-gray-500" />
            </div>
            <h2 className="text-2xl font-heading text-gray-700 dark:text-gray-200 mb-2">No Tasks Accomplished Yet</h2>
            <p className="text-gray-400 dark:text-gray-500">Complete tasks in Focus mode to see them here.</p>
        </div>
      ) : (
        <div className="space-y-4">
            {tasks.map((task) => (
            <div
                key={task.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all overflow-hidden"
            >
                <div 
                    onClick={() => toggleExpand(task.id)}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer group select-none"
                >
                    <div className="flex items-start sm:items-center gap-4 mb-3 sm:mb-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${task.isFrog ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'}`}>
                            {task.isFrog ? '🐸' : <CheckIcon className="w-5 h-5" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-gray-800 dark:text-gray-200 text-lg line-through decoration-gray-300 dark:decoration-gray-600 text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">{task.title}</h3>
                                {task.hashtags.map(tag => (
                                    <button 
                                        key={tag} 
                                        onClick={(e) => { e.stopPropagation(); onSelectHashtag(tag); }}
                                        style={{ color: hashtagConfigs[tag]?.color || '#3b82f6' }} 
                                        className="text-xs font-medium px-1.5 py-0.5 bg-gray-50 dark:bg-slate-700 rounded-md hover:underline cursor-pointer"
                                    >
                                        #{tag}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Completed {task.completedAt ? formatDate(task.completedAt) : 'Unknown'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 pl-14 sm:pl-0">
                        {/* Exact Time Needed */}
                        <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300 font-bold">
                            <ClockIcon className="w-4 h-4 text-gray-400" />
                            <span>{task.actualDuration || 1}m</span>
                            </div>
                            <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Time Needed</span>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-8 bg-gray-100 dark:bg-slate-700 hidden sm:block"></div>

                        {/* Focus Rating */}
                        <div className="flex flex-col items-end min-w-[80px]">
                            {task.flowState ? (
                            <>
                                <span
                                className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${
                                    task.flowState === 'flow'
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300'
                                    : task.flowState === 'high'
                                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300'
                                    : task.flowState === 'good'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-300'
                                }`}
                                >
                                {task.flowState}
                                </span>
                                <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mt-1">Focus</span>
                            </>
                            ) : (
                            <span className="text-xs text-gray-300 italic">Not rated</span>
                            )}
                        </div>

                        <div className="ml-2 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400">
                            {expandedTaskId === task.id ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                        </div>
                    </div>
                </div>

                {/* Expanded Notes Area */}
                {expandedTaskId === task.id && (
                    <div className="border-t border-gray-100 dark:border-slate-700 bg-yellow-50/30 dark:bg-yellow-900/10">
                        <div className="h-64 w-full">
                            <YellowPad 
                                content={task.description || ""} 
                                onChange={() => {}} 
                                readOnly={true}
                                placeholder="No notes were saved for this task."
                                className="h-full"
                            />
                        </div>
                    </div>
                )}
            </div>
            ))}
        </div>
      )}
    </div>
  );
};
