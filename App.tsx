
import React, { useState, useEffect, useCallback } from 'react';
import { useGoalflow } from './hooks/useGoalflow';
import { CurrentView } from './components/CurrentView';
import { PlanningView } from './components/PlanningView';
import { StatsView } from './components/StatsView';
import { GoalsView } from './components/GoalsView';
import { DoneView } from './components/DoneView';
import { HabitsView } from './components/HabitsView';
import { XPDisplay } from './components/XPDisplay';
import { Celebration } from './components/Celebration';
import { LevelUpModal } from './components/LevelUpModal';
import { GamificationView } from './components/GamificationView';
import { Logo } from './components/Logo';
import { CalendarIcon, InboxIcon, StatsIcon, PlusIcon, TrophyIcon, SearchIcon, RepeatIcon, SunIcon, MoonIcon, ShieldIcon, SettingsIcon } from './components/Icons';
import { playCompleteSound, playFrogCompleteSound } from './utils/audioUtils';
import { Modal } from './components/Modal';
import { TaskForm } from './components/TaskForm';
import { SearchModal } from './components/SearchModal';
import { Task, FlowState, Session } from './types';
import { HashtagManager } from './components/HashtagManager';
import { DeepWorkPlayer } from './components/DeepWorkPlayer';
import { GamificationToast } from './components/GamificationToast';
import { BioStateCheckIn } from './components/BioStateCheckIn';
import { getTodayYYYYMMDD } from './utils/dateUtils';
import { SettingsModal } from './components/SettingsModal';

type View = 'current' | 'planning' | 'goals' | 'stats' | 'done' | 'habits' | 'gamification';
type Theme = 'light' | 'dark';

interface AppProps {
  userEmail: string;
  onLogout: () => void;
}

const App: React.FC<AppProps> = ({ userEmail, onLogout }) => {
  const [currentView, setCurrentView] = useState<View>('current');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [taskDefaults, setTaskDefaults] = useState<{ session?: Session, dateAssigned?: string }>({});
  
  const [showCelebration, setShowCelebration] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);
  const [isBioCheckInOpen, setIsBioCheckInOpen] = useState(false);
  
  const [openAssessmentOnGoalsMount, setOpenAssessmentOnGoalsMount] = useState(false);
  
  const {
    isLoading, // Added loading state from hook
    tasks,
    goals,
    habits,
    currentTask,
    todayTasks,
    upcomingTasks,
    recentCompletedTasks,
    allCompletedTasks,
    stats,
    userProgress,
    hashtagConfigs,
    accountabilityConfig,
    trueNorthGoals, 
    amalgam, 
    justLeveledUp,
    setJustLeveledUp,
    addTask,
    addSubtasks,
    updateTask,
    deleteTask,
    setFrog,
    moveTaskToTopToday,
    completeTask,
    reorderTodayTasks,
    updateTaskPriorities,
    addGoal,
    updateGoal,
    deleteGoal,
    addHabit,
    updateHabit,
    deleteHabit,
    updateHashtagConfig,
    updateAccountabilityConfig,
    updateGoalPriorities,
    addTrueNorthGoal, 
    updateTrueNorthGoal, 
    deleteTrueNorthGoal, 
    updateAmalgam,
    trackBreakTime,
    markWontDo,
    overdueTasks,
    gamificationEvent,
    setGamificationEvent,
    planningWarning,
    setPlanningWarning,
    trackPlanVisit,
    rescheduleTask,
    awardSessionXp,
    circadianState,
    submitBioCheckIn,
    resetCircadianState,
    userSettings,
    updateUserSettings,
    sortTodayTasksCircadian
  } = useGoalflow(userEmail);

  // Circadian Check Logic - Only active if checked in today
  const isCircadianActive = circadianState.lastCheckIn === getTodayYYYYMMDD();

  const handleNavigateToHabits = () => {
      setCurrentView('habits');
      setTimeout(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
      }, 100);
  };

  const handleNavigateToAddGoal = () => {
      setCurrentView('goals');
      setTimeout(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
      }, 100);
  };

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleSetView = (view: View) => {
      if (view === 'planning') {
          trackPlanVisit();
      }
      setCurrentView(view);
  };

  const hasOverdue = overdueTasks.length > 0;

  const openAddTaskModal = useCallback((overrides?: { session?: Session, dateAssigned?: string }) => {
    setTaskToEdit(null);
    setTaskDefaults(overrides || {});
    setIsTaskModalOpen(true);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isBioCheckInOpen) return;

      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }
      
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (isTaskModalOpen || isSearchOpen || isSettingsOpen) return;

      switch (e.key.toLowerCase()) {
        case 'f':
          if (!hasOverdue) handleSetView('current');
          break;
        case 'p':
          handleSetView('planning');
          break;
        case 'h':
          if (!hasOverdue) handleSetView('habits');
          break;
        case 'g':
          if (!hasOverdue) handleSetView('goals');
          break;
        case 's':
          if (!hasOverdue) handleSetView('stats');
          break;
        case '/':
          e.preventDefault();
          setIsSearchOpen(true);
          break;
        case 'a':
          e.preventDefault();
          openAddTaskModal();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasOverdue, isTaskModalOpen, isSearchOpen, openAddTaskModal, isBioCheckInOpen, isSettingsOpen]);

  const handleCompleteTask = (id: string, duration?: number, flowState?: FlowState, finalDescription?: string) => {
    const task = todayTasks.find(t => t.id === id) || upcomingTasks.find(t => t.id === id);
    if (task?.isFrog) {
        playFrogCompleteSound();
    } else {
        playCompleteSound();
    }
    completeTask(id, duration, flowState, finalDescription);

    setShowCelebration(true);
    setTimeout(() => setShowCelebration(false), 3000);
  }

  const openEditTaskModal = useCallback((task: Task) => {
    setTaskToEdit(task);
    setTaskDefaults({});
    setIsTaskModalOpen(true);
  }, []);

  const closeModal = () => {
    setIsTaskModalOpen(false);
    setTaskToEdit(null);
    setTaskDefaults({});
  };

  const handleFormSubmit = (data: { title: string; description: string; dateAssigned: string, goalId?: string, isFrog: boolean, isRepetitive: boolean }) => {
    const finalData = { ...data, session: taskToEdit ? undefined : taskDefaults.session };

    if (taskToEdit) {
      updateTask(taskToEdit.id, data);
    } else {
      // @ts-ignore 
      addTask(finalData);
    }
    closeModal();
  };
  
  const handleNavigateToTrueNorth = () => {
      setOpenAssessmentOnGoalsMount(true);
      setCurrentView('goals');
  };
  
  const handleAssessmentOpened = () => {
      setOpenAssessmentOnGoalsMount(false);
  };

  const NavItem: React.FC<{ view: View, label: string, icon: React.ReactNode, hotkey: string, active?: boolean, disabled?: boolean }> = ({ view, label, icon, hotkey, active, disabled }) => {
    const isActive = active !== undefined ? active : currentView === view;
    return (
    <button
      onClick={() => !disabled && handleSetView(view)}
      disabled={disabled}
      className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition text-sm sm:text-base whitespace-nowrap group relative ${
        isActive
          ? 'bg-indigo-100 text-indigo-700 font-bold dark:bg-indigo-900 dark:text-indigo-200'
          : disabled 
            ? 'text-gray-300 dark:text-slate-700 cursor-not-allowed'
            : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800'
      }`}
      title={disabled ? "Complete overdue tasks first" : `Shortcut: ${hotkey}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )};

  const getBioModeLabel = () => {
      if (!isCircadianActive) return 'Bio-Adaptive';
      if (circadianState.mode === 'apex') return 'Apex Mode';
      if (circadianState.mode === 'recovery') return 'Recovery';
      return 'Maintenance';
  };

  const getBioModeColor = () => {
      if (!isCircadianActive) return 'text-gray-400 hover:text-indigo-500';
      if (circadianState.mode === 'apex') return 'bg-red-500 text-white shadow-red-500/50';
      if (circadianState.mode === 'recovery') return 'bg-emerald-500 text-white shadow-emerald-500/50';
      return 'bg-blue-500 text-white shadow-blue-500/50';
  };

  if (isLoading) {
      return (
          <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col justify-center items-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500 dark:text-gray-400 animate-pulse text-sm font-bold uppercase tracking-widest">Hydrating Mind-State...</p>
          </div>
      );
  }

  return (
    <div className="bg-gray-50 dark:bg-slate-900 min-h-screen font-sans flex flex-col transition-colors duration-200 print:bg-white relative">
      {isBioCheckInOpen && (
          <BioStateCheckIn 
            onSubmit={(data, score, mode, solar) => {
               submitBioCheckIn(data, score, mode, solar);
               setIsBioCheckInOpen(false);
            }} 
            onClose={() => setIsBioCheckInOpen(false)}
          />
      )}
      
      {showCelebration && <Celebration />}
      
      {gamificationEvent && (
          <GamificationToast 
            type={gamificationEvent.type}
            message={gamificationEvent.message} 
            xp={gamificationEvent.amount} 
            onClose={() => setGamificationEvent(null)} 
          />
      )}

      {/* Header and Player stick around even if hidden visually, to keep music playing */}
      <header className={`bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-20 border-b border-gray-200 dark:border-slate-700 print:hidden ${currentView === 'gamification' ? 'hidden' : 'block'}`}>
        <nav className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-4 overflow-hidden shrink-0">
            <Logo onReset={() => handleSetView('current')} />
            
            {/* Mode Switcher Toggle */}
            <div className="hidden sm:flex bg-gray-100 dark:bg-slate-700/50 p-1 rounded-full border border-gray-200 dark:border-slate-600 relative shadow-inner">
                {/* Manual Option */}
                <button
                    onClick={resetCircadianState}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-300 z-10 ${
                        !isCircadianActive 
                        ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm' 
                        : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                    }`}
                >
                    Manual
                </button>

                {/* Bio-Adaptive Option */}
                <button
                    onClick={() => setIsBioCheckInOpen(true)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-1.5 z-10 ${
                        isCircadianActive 
                        ? `${getBioModeColor()} shadow-md`
                        : 'text-gray-400 hover:text-indigo-500 dark:text-gray-500 dark:hover:text-indigo-400'
                    }`}
                >
                    {isCircadianActive && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>}
                    {getBioModeLabel()}
                </button>
            </div>
        </div>
        
        <div className="flex items-center space-x-1 sm:space-x-2 ml-2 overflow-x-auto lg:overflow-visible custom-scrollbar no-scrollbar">
            
            {/* Deep Work Music Player - Persists here */}
            <div className="mr-1 sm:mr-3">
                <DeepWorkPlayer />
            </div>

            <button 
                onClick={toggleTheme} 
                className="p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700 rounded-lg transition-colors" 
                title="Toggle Theme"
            >
                {theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}
            </button>
            
            <button onClick={() => setIsSearchOpen(true)} className="p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700 rounded-lg" title="Search (/)">
                <SearchIcon className="w-5 h-5" />
            </button>
            <NavItem view="current" label="Focus" hotkey="f" icon={<CalendarIcon className="w-5 h-5" />} disabled={hasOverdue} />
            <NavItem view="planning" label="Plan" hotkey="p" icon={<InboxIcon className="w-5 h-5" />} />
            <NavItem view="habits" label="Habits" hotkey="h" icon={<RepeatIcon className="w-5 h-5" />} disabled={hasOverdue} />
            <NavItem view="goals" label="Goals" hotkey="g" icon={<TrophyIcon className="w-5 h-5" />} disabled={hasOverdue} />
            <NavItem view="stats" label="Stats" hotkey="s" icon={<StatsIcon className="w-5 h-5" />} active={currentView === 'stats' || currentView === 'done'} disabled={hasOverdue} />
            <div className="border-l border-gray-200 dark:border-slate-600 h-6 mx-2 hidden md:block"></div>
            <div className="hidden md:block">
                <XPDisplay 
                    userProgress={userProgress} 
                    onClick={() => setCurrentView('gamification')} 
                />
            </div>
            
            {/* User Menu Dropdown */}
            <div className="relative group ml-2 hidden sm:block">
                <button className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold cursor-pointer shadow-sm focus:outline-none">
                    {userEmail.charAt(0).toUpperCase()}
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg py-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity invisible group-hover:visible border border-gray-100 dark:border-slate-600">
                    <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 truncate font-medium">{userEmail}</div>
                    <div className="border-t border-gray-100 dark:border-slate-700"></div>
                    <button 
                        onClick={() => setIsSettingsOpen(true)} 
                        className="block w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                    >
                        <SettingsIcon className="w-4 h-4" /> Settings
                    </button>
                    <button 
                        onClick={onLogout} 
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        Logout
                    </button>
                </div>
            </div>
        </div>
        </nav>
      </header>
      
      {currentView === 'gamification' ? (
          <GamificationView 
              userProgress={userProgress}
              trueNorthGoals={trueNorthGoals}
              tacticalGoals={goals}
              habits={habits}
              completedTasks={allCompletedTasks}
              onBack={() => setCurrentView('current')}
              onOpenTrueNorth={handleNavigateToTrueNorth}
              onNavigateToGoals={() => setCurrentView('goals')}
              onAddHabitClick={handleNavigateToHabits}
              onAddGoalClick={handleNavigateToAddGoal}
          />
      ) : (
        <main className="container mx-auto p-4 flex-grow relative print:p-0 print:w-full">
            {currentView === 'planning' && 
            <PlanningView
                todayTasks={todayTasks}
                upcomingTasks={upcomingTasks}
                allTasks={tasks}
                goals={goals}
                setFrog={setFrog}
                openEditModal={openEditTaskModal}
                deleteTask={deleteTask}
                reorderTodayTasks={reorderTodayTasks}
                hashtagConfigs={hashtagConfigs}
                updateTaskPriorities={updateTaskPriorities}
                moveTaskToTopToday={moveTaskToTopToday}
                onSelectHashtag={setSelectedHashtag}
                overdueTasks={overdueTasks}
                markWontDo={markWontDo}
                onAddTask={openAddTaskModal}
                updateTask={updateTask} 
                onRescheduleTask={rescheduleTask}
                circadianState={isCircadianActive ? circadianState : { ...circadianState, sunriseTime: undefined, sunsetTime: undefined }}
                addSubtasks={addSubtasks}
                completeTask={handleCompleteTask}
                isAiEnabled={userSettings.enableAi}
                createTask={addTask}
                sortTodayTasksCircadian={sortTodayTasksCircadian}
            />
            }
            {currentView === 'habits' && 
                <HabitsView 
                    habits={habits} 
                    goals={goals}
                    addHabit={addHabit} 
                    updateHabit={updateHabit} 
                    deleteHabit={deleteHabit} 
                />
            }
            {currentView === 'done' && 
                <DoneView 
                    tasks={allCompletedTasks} 
                    hashtagConfigs={hashtagConfigs} 
                    onSelectHashtag={setSelectedHashtag}
                    onBack={() => setCurrentView('stats')}
                />
            }
            {currentView === 'goals' && 
                <GoalsView 
                    goals={goals} 
                    addGoal={addGoal} 
                    updateGoal={updateGoal} 
                    deleteGoal={deleteGoal} 
                    addHabit={addHabit}
                    addTask={addTask}
                    updateGoalPriorities={updateGoalPriorities}
                    trueNorthGoals={trueNorthGoals}
                    addTrueNorthGoal={addTrueNorthGoal}
                    updateTrueNorthGoal={updateTrueNorthGoal}
                    deleteTrueNorthGoal={deleteTrueNorthGoal}
                    amalgam={amalgam}
                    updateAmalgam={updateAmalgam}
                    userProgress={userProgress}
                    openAssessmentOnMount={openAssessmentOnGoalsMount}
                    onAssessmentOpened={handleAssessmentOpened}
                    isAiEnabled={userSettings.enableAi}
                />
            }
            {currentView === 'stats' && 
                <StatsView 
                    stats={stats} 
                    recentTasks={recentCompletedTasks} 
                    allTasks={tasks}
                    hashtagConfigs={hashtagConfigs}
                    onColorChange={updateHashtagConfig}
                    accountabilityConfig={accountabilityConfig}
                    onUpdateAccountability={updateAccountabilityConfig}
                    onViewDone={() => setCurrentView('done')}
                    onSelectHashtag={setSelectedHashtag}
                />
            }
            {currentView === 'current' &&
            <CurrentView
                currentTask={currentTask}
                goals={goals}
                allTasks={tasks}
                completeTask={handleCompleteTask}
                addSubtasks={addSubtasks}
                addTask={addTask}
                onFrogEaten={() => {}} 
                deprioritizeTask={(id) => { 
                    const task = todayTasks.find(t => t.id === id);
                    if(task) {
                        const session = task.session || 'unassigned';
                        const tasksInSession = todayTasks.filter(t => (t.session || 'unassigned') === session);
                        const currentIndex = tasksInSession.findIndex(t => t.id === id);
                        if (currentIndex !== -1) {
                            reorderTodayTasks(id, session, currentIndex, session, tasksInSession.length - 1);
                        }
                    }
                }}
                openEditModal={openEditTaskModal}
                updateTask={updateTask}
                hashtagConfigs={hashtagConfigs}
                onSelectHashtag={setSelectedHashtag}
                amalgam={amalgam}
                trackBreakTime={trackBreakTime}
                onRescheduleTask={rescheduleTask}
                onAwardXp={awardSessionXp}
                isAiEnabled={userSettings.enableAi}
            />
            }

            <button 
                onClick={() => openAddTaskModal()}
                className="fixed bottom-8 right-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 shadow-lg transform transition-transform hover:scale-110 z-30 active:scale-95 flex items-center justify-center print:hidden"
                title="Add new task (a)"
            >
                <PlusIcon className="w-8 h-8" />
            </button>
        </main>
      )}

      <Modal isOpen={isTaskModalOpen} onClose={closeModal} title={taskToEdit ? "Edit Task" : "New Task"}>
          <TaskForm 
            onSubmit={handleFormSubmit}
            initialData={taskToEdit}
            goals={goals}
            onClose={closeModal}
            existingTasks={tasks}
            initialOverrides={taskDefaults}
            isAiEnabled={userSettings.enableAi}
          />
      </Modal>
      
      {selectedHashtag && (
          <HashtagManager 
            hashtag={selectedHashtag}
            onClose={() => setSelectedHashtag(null)}
            tasks={tasks.filter(t => t.hashtags.includes(selectedHashtag))}
            goals={goals}
            config={hashtagConfigs[selectedHashtag]}
            onUpdateConfig={updateHashtagConfig}
            onUpdateTask={updateTask}
            onMoveToToday={moveTaskToTopToday}
            onAddSubtasks={addSubtasks}
            onOpenEditModal={openEditTaskModal}
            isAiEnabled={userSettings.enableAi}
          />
      )}

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={userSettings} 
        onUpdateSettings={updateUserSettings}
        userEmail={userEmail}
      />

      <SearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        allTasks={tasks} 
      />

      <LevelUpModal 
        isOpen={justLeveledUp}
        onClose={() => setJustLeveledUp(false)}
        newLevel={userProgress.level}
      />
      
      {/* Warning Modal for Planning Overuse */}
      <Modal isOpen={planningWarning} onClose={() => setPlanningWarning(false)} title="Decision Fatigue Warning">
          <div className="p-6 text-center">
              <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <ShieldIcon className="w-10 h-10 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Stop Planning. Start Doing.</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                  You have visited the planning screen 5 times today. Constant rescheduling is a form of procrastination.
              </p>
              <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">
                      Further visits to the Plan view will result in XP penalties.
                  </p>
              </div>
              <button onClick={() => { setPlanningWarning(false); handleSetView('current'); }} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition">
                  Return to Focus Mode
              </button>
          </div>
      </Modal>

      {currentView !== 'gamification' && (
        <footer className="text-center py-6 text-gray-400 dark:text-gray-600 text-xs print:hidden">
            <p>Goalflow &copy; {new Date().getFullYear()} • Focus. Flow. Finish.</p>
        </footer>
      )}
    </div>
  );
};

export default App;
