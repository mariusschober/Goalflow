

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, Stats, Session, Goal, UserProgress, FlowState, HashtagConfig, Habit, AccountabilityConfig, TrueNorthGoal, GamificationEvent, CircadianState } from '../types';
import { getTodayYYYYMMDD } from '../utils/dateUtils';
import { parseTitleForExtras } from '../utils/timeAndTagParser';
import { storageService, STORES } from '../services/storage';
import { assertSchedule, compareQueueCandidates } from '../src/domain/scheduling';
import { v5 as uuidv5 } from 'uuid';

const HABIT_TASK_NAMESPACE = 'c3e4bcbb-9f56-4ff5-a3a8-9f7478284169';

export interface UserSettings {
    enableAi: boolean;
    penaltyMode?: 'off' | 'gentle' | 'classic';
}

const XP_PER_TASK = 10;
const XP_PER_FROG_MULTIPLIER = 3; 
const XP_GOAL_SYNERGY_BONUS = 15; 
const XP_HABIT_SETUP_BONUS = 50;
const BASE_XP_FOR_LEVEL = 100;

interface DailyTracking {
    date: string;
    planViewCount: number;
    dailyPostponeCount: number;
}

const calculateXpToNextLevel = (level: number) => level * BASE_XP_FOR_LEVEL;

export const useGoalflow = (userKey: string, legacyUserKey = userKey) => {
  // Keys for DB retrieval (User scoped)
  const USER_KEY = userKey;

  // --- State Definitions ---
  const [isLoading, setIsLoading] = useState(true);
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [trueNorthGoals, setTrueNorthGoals] = useState<TrueNorthGoal[]>([]);
  const [amalgam, setAmalgam] = useState<string>("My world takes care of me");
  const [hashtagConfigs, setHashtagConfigs] = useState<Record<string, HashtagConfig>>({});
  const [stats, setStats] = useState<Stats>({ tasksCompleted: 0, frogsEaten: 0, timeFocused: 0, totalBreakMinutes: 0 });
  const [allStats, setAllStats] = useState<{ [date: string]: Stats }>({});
  
  const [userProgress, setUserProgress] = useState<UserProgress>({ level: 1, xp: 0, xpToNextLevel: BASE_XP_FOR_LEVEL });
  const [dailyTracking, setDailyTracking] = useState<DailyTracking>({ date: getTodayYYYYMMDD(), planViewCount: 0, dailyPostponeCount: 0 });
  const [accountabilityConfig, setAccountabilityConfig] = useState<AccountabilityConfig>({ enabled: false, partners: [], scope: 'all', targetHashtags: [] });
  const [circadianState, setCircadianState] = useState<CircadianState>({ 
      lastCheckIn: '', score: 0, mode: 'maintenance', metrics: { sunrise: false, sleepHours: 0, energy: 0, clarity: 0, interest: 0 }
  });
  const [userSettings, setUserSettings] = useState<UserSettings>({ enableAi: false, penaltyMode: 'off' });
  const cloudAppliedStores = useRef(new Set<string>());

  // Transient State
  const [justLeveledUp, setJustLeveledUp] = useState(false);
  const [gamificationEvent, setGamificationEvent] = useState<GamificationEvent | null>(null);
  const [planningWarning, setPlanningWarning] = useState(false);
  const completedTaskIds = useRef(new Set<string>());

  // --- Initialization (Hydration) ---
  useEffect(() => {
    const loadData = async () => {
      try {
        await storageService.migrateUserKey(legacyUserKey, USER_KEY);
        const [
            lTasks, lGoals, lHabits, lTrueNorth, lAmalgam, lHashtags, lAllStats, lProgress, lDaily, lAccountability, lCircadian, lSettings
        ] = await Promise.all([
            storageService.migrateFromLocalStorage<Task[]>(STORES.TASKS, USER_KEY, `goalflow_tasks_${legacyUserKey}`, []),
            storageService.migrateFromLocalStorage<Goal[]>(STORES.GOALS, USER_KEY, `goalflow_goals_${legacyUserKey}`, []),
            storageService.migrateFromLocalStorage<Habit[]>(STORES.HABITS, USER_KEY, `goalflow_habits_${legacyUserKey}`, []),
            storageService.migrateFromLocalStorage<TrueNorthGoal[]>(STORES.TRUE_NORTH, USER_KEY, `goalflow_truenorth_${legacyUserKey}`, []),
            storageService.migrateFromLocalStorage<string>(STORES.AMALGAM, USER_KEY, `goalflow_amalgam_${legacyUserKey}`, "My world takes care of me"),
            storageService.migrateFromLocalStorage<any>(STORES.HASHTAGS, USER_KEY, `goalflow_hashtags_${legacyUserKey}`, {}),
            storageService.migrateFromLocalStorage<{ [date: string]: Stats }>(STORES.STATS, USER_KEY, `goalflow_stats_${legacyUserKey}`, {}),
            storageService.migrateFromLocalStorage<UserProgress>(STORES.PROGRESS, USER_KEY, `goalflow_progress_${legacyUserKey}`, { level: 1, xp: 0, xpToNextLevel: BASE_XP_FOR_LEVEL }),
            storageService.migrateFromLocalStorage<DailyTracking>(STORES.TRACKING, USER_KEY, `goalflow_tracking_${legacyUserKey}`, { date: getTodayYYYYMMDD(), planViewCount: 0, dailyPostponeCount: 0 }),
            storageService.migrateFromLocalStorage<AccountabilityConfig>(STORES.ACCOUNTABILITY, USER_KEY, `goalflow_accountability_${legacyUserKey}`, { enabled: false, partners: [], scope: 'all', targetHashtags: [] }),
            storageService.migrateFromLocalStorage<CircadianState>(STORES.CIRCADIAN, USER_KEY, `goalflow_circadian_${legacyUserKey}`, { lastCheckIn: '', score: 0, mode: 'maintenance', metrics: { sunrise: false, sleepHours: 0, energy: 0, clarity: 0, interest: 0 } }),
            storageService.migrateFromLocalStorage<UserSettings>(STORES.SETTINGS, USER_KEY, `goalflow_settings_${legacyUserKey}`, { enableAi: false, penaltyMode: 'off' }),
        ]);

        await storageService.createLocalSnapshot(USER_KEY, 'before-migration');
        const normalizedTasks = lTasks.map(task => {
            const migratedLoopNote = task.isRepetitive
                ? `${task.description ? `${task.description}\n\n` : ''}This was migrated from a Loop task. Complete it consciously, then create the next occurrence or convert it to a habit.`
                : task.description;
            return {
                ...task,
                description: migratedLoopNote,
                isRepetitive: false,
                schedulePrecision: task.schedulePrecision || 'day',
                scheduledFor: task.scheduledFor || task.dateAssigned,
                plannedOrder: task.plannedOrder ?? task.createdAt,
                frogFailures: task.frogFailures ?? task.rescheduleCount ?? 0,
                source: task.source || 'migration',
                lifecycleStatus: task.lifecycleStatus || (task.completed ? 'completed' : task.wontDo ? 'dropped' : 'open')
            } as Task;
        });
        setTasks(normalizedTasks);
        setGoals(lGoals);
        setHabits(lHabits);
        setTrueNorthGoals(lTrueNorth);
        setAmalgam(lAmalgam);
        setHashtagConfigs(lHashtags);
        setAllStats(lAllStats);
        
        // Stats for Today
        const today = getTodayYYYYMMDD();
        setStats(lAllStats[today] || { tasksCompleted: 0, frogsEaten: 0, timeFocused: 0, totalBreakMinutes: 0 });

        // Ensure Progress calculations
        setUserProgress({ ...lProgress, xpToNextLevel: calculateXpToNextLevel(lProgress.level) });
        
        // Reset daily tracking if new day
        if (lDaily.date !== today) {
            setDailyTracking({ date: today, planViewCount: 0, dailyPostponeCount: 0 });
        } else {
            setDailyTracking(lDaily);
        }

        setAccountabilityConfig(lAccountability);
        setCircadianState(lCircadian);
        setUserSettings(lSettings);

      } catch (err) {
          console.error("Failed to hydrate data", err);
      } finally {
          setIsLoading(false);
      }
    };

    loadData();
  }, [userKey, legacyUserKey]);

  // --- Persistence Wrappers ---
  // Using useRef to prevent effect loops when saving, saving is triggered by state changes.
  // We use a custom hook-like structure inside useEffect to handle debouncing.

  const persist = useCallback(async (store: string, data: any) => {
      try {
          await storageService.set(store, USER_KEY, data);
      } catch (e) {
          console.error(`Failed to persist ${store}`, e);
      }
  }, [USER_KEY]);

  const persistLocalState = useCallback((store: string, data: any) => {
      if (cloudAppliedStores.current.delete(store)) return;
      void persist(store, data);
  }, [persist]);

  // Watchers
  useEffect(() => { if (!isLoading) persistLocalState(STORES.TASKS, tasks); }, [tasks, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.GOALS, goals); }, [goals, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.HABITS, habits); }, [habits, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.TRUE_NORTH, trueNorthGoals); }, [trueNorthGoals, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.AMALGAM, amalgam); }, [amalgam, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.HASHTAGS, hashtagConfigs); }, [hashtagConfigs, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.PROGRESS, userProgress); }, [userProgress, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.TRACKING, dailyTracking); }, [dailyTracking, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.ACCOUNTABILITY, accountabilityConfig); }, [accountabilityConfig, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.CIRCADIAN, circadianState); }, [circadianState, isLoading, persistLocalState]);
  useEffect(() => { if (!isLoading) persistLocalState(STORES.SETTINGS, userSettings); }, [userSettings, isLoading, persistLocalState]);

  useEffect(() => {
      const applyCloudChange = (event: Event) => {
          const { storeName, value } = (event as CustomEvent<{ storeName: string; value: any }>).detail;
          cloudAppliedStores.current.add(storeName);
          if (storeName === STORES.TASKS) setTasks(value || []);
          else if (storeName === STORES.GOALS) setGoals(value || []);
          else if (storeName === STORES.HABITS) setHabits(value || []);
          else if (storeName === STORES.TRUE_NORTH) setTrueNorthGoals(value || []);
          else if (storeName === STORES.AMALGAM) setAmalgam(value || 'My world takes care of me');
          else if (storeName === STORES.HASHTAGS) setHashtagConfigs(value || {});
          else if (storeName === STORES.PROGRESS) setUserProgress(value);
          else if (storeName === STORES.TRACKING) setDailyTracking(value);
          else if (storeName === STORES.ACCOUNTABILITY) setAccountabilityConfig(value);
          else if (storeName === STORES.CIRCADIAN) setCircadianState(value);
          else if (storeName === STORES.SETTINGS) setUserSettings(value);
          else if (storeName === STORES.STATS) {
              setAllStats(value || {});
              setStats(value?.[getTodayYYYYMMDD()] || { tasksCompleted: 0, frogsEaten: 0, timeFocused: 0, totalBreakMinutes: 0 });
          }
      };
      window.addEventListener('goalflow:cloud-change', applyCloudChange);
      return () => window.removeEventListener('goalflow:cloud-change', applyCloudChange);
  }, []);

  // Special Stats Persistence
  useEffect(() => {
      if (!isLoading) {
          if (cloudAppliedStores.current.delete(STORES.STATS)) return;
          const today = getTodayYYYYMMDD();
          const updatedAllStats = { ...allStats, [today]: stats };
          // Only update if changed deeply? No, React state update is enough signal.
          // However, we avoid infinite loop by not setting AllStats in state here, just persisting it.
          // But we need to keep `allStats` ref current for other logic if needed.
          // Actually, let's update `allStats` state when `stats` changes, but do it carefully.
          // Simplification: Just persist the merged object.
          setAllStats(previous => previous[today] === stats ? previous : { ...previous, [today]: stats });
          void persist(STORES.STATS, updatedAllStats);
      }
  }, [stats, isLoading, persist]); // Dep on stats updates the DB record

  // --- Logic Exports ---

  const submitBioCheckIn = useCallback((data: CircadianState['metrics'], score: number, mode: CircadianState['mode'], solar?: { sunrise?: string, sunset?: string }) => {
      // 1. Update Circadian State (Current Session Mode)
      setCircadianState({
          lastCheckIn: getTodayYYYYMMDD(),
          metrics: data,
          score,
          mode,
          sunriseTime: solar?.sunrise,
          sunsetTime: solar?.sunset
      });

      // 2. Persist to Stats (Historical Data)
      setStats(prev => ({
          ...prev,
          bioLog: data,
          circadianScore: score
      }));
  }, []);

  const resetCircadianState = useCallback(() => {
      setCircadianState(prev => ({ ...prev, lastCheckIn: '' }));
  }, []);

  const updateUserSettings = useCallback((updates: Partial<UserSettings>) => {
      setUserSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // --- Habit Generation & Streak Break Logic (Simplified for brevity, logic remains same) ---
  useEffect(() => {
      if (isLoading) return;
      
      const today = getTodayYYYYMMDD();
      const todayDate = new Date();
      const dayOfWeek = todayDate.getDay();
      
      let newTasks: Task[] = [];
      let habitsUpdated = false;

      let updatedHabits = habits.map(h => ({ ...h }));
      
      const todaysTasks = tasks.filter(t => t.dateAssigned === today);
      const minCreatedAt = todaysTasks.length > 0 
          ? Math.min(...todaysTasks.map(t => t.createdAt)) 
          : Date.now();
      let prependCounter = 1;

      updatedHabits.forEach((habit, index) => {
          if (!habit) return; 

          if (habit.lastCompletedDate) {
              const [lastYear, lastMonth, lastDay] = habit.lastCompletedDate.split('-').map(Number);
              const lastDate = new Date(lastYear, lastMonth - 1, lastDay);
              const diffTime = todayDate.getTime() - lastDate.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
              
              if (habit.frequency === 'daily' && diffDays > 1) {
                  if (habit.streak > 0) {
                      updatedHabits[index].streak = 0;
                      habitsUpdated = true;
                  }
              }
          }

          let isDue = false;
          if (habit.frequency === 'daily') isDue = true;
          if (habit.frequency === 'specific_days' && habit.specificDays?.includes(dayOfWeek)) isDue = true;

          if (isDue) {
              const exists = tasks.some(t => t && t.habitId === habit.id && t.dateAssigned === today);
              if (!exists) {
                   const newTask: Task = {
                      id: uuidv5(`${habit.id}:${today}`, HABIT_TASK_NAMESPACE),
                      title: habit.title,
                      description: "", 
                      dateAssigned: today,
                      completed: false,
                      isFrog: false,
                      createdAt: habit.isHighPriority ? (minCreatedAt - (prependCounter++ * 1000)) : Date.now(),
                      habitId: habit.id,
                      goalId: habit.goalId, 
                      hashtags: ['habit', ...(habit.hashtags || [])],
                      duration: habit.duration || 25,
                      strikes: 0,
                      rescheduleCount: 0,
                      schedulePrecision: 'day',
                      scheduledFor: today,
                      plannedOrder: 0,
                      frogFailures: 0,
                      beforeFrog: !!habit.beforeFrog,
                      source: 'habit',
                      lifecycleStatus: 'open'
                  };
                  newTasks.push(newTask);
              }
          }
      });

      if (newTasks.length > 0) {
          setTasks(prev => {
              const existingIds = new Set(prev.map(task => task.id));
              return [...prev, ...newTasks.filter(task => !existingIds.has(task.id))];
          });
      }
      if (habitsUpdated) {
          setHabits(updatedHabits);
      }
  }, [habits, tasks, isLoading]); 

  // --- Helper Functions ---
  const checkLevelUp = (currentXp: number, currentLevel: number, currentNext: number) => {
      let xp = currentXp;
      let level = currentLevel;
      let next = currentNext;
      let leveledUp = false;

      while (xp >= next) {
          level += 1;
          xp -= next;
          next = calculateXpToNextLevel(level);
          leveledUp = true;
      }
      return { xp, level, next, leveledUp };
  };

  const applyPenalty = (amount: number, message: string) => {
      if ((userSettings.penaltyMode || 'off') === 'off') return;
      const appliedAmount = userSettings.penaltyMode === 'gentle' ? Math.ceil(amount / 2) : amount;
      setUserProgress(prev => ({
          ...prev,
          xp: Math.max(0, prev.xp - appliedAmount)
      }));
      setGamificationEvent({ type: 'penalty', amount: appliedAmount, message });
  };

  const awardSessionXp = useCallback((amount: number, message: string, type: 'reward' | 'milestone' = 'reward') => {
      setUserProgress(prev => {
          const { xp, level, next, leveledUp } = checkLevelUp(prev.xp + amount, prev.level, prev.xpToNextLevel);
          if (leveledUp) setJustLeveledUp(true);
          return { level, xp, xpToNextLevel: next };
      });
      setGamificationEvent({ type, amount, message });
  }, []);

  const trackPlanVisit = () => {
      setDailyTracking(prev => {
          const newCount = prev.planViewCount + 1;
          if (newCount === 6) setPlanningWarning(true);
          else if (newCount > 6) applyPenalty(50, "Stop Planning. Start Doing.");
          return { ...prev, planViewCount: newCount };
      });
  };

  const rescheduleTask = (taskId: string, newDate: string): boolean => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return false;
      if (task.isFrog) return false;

      const today = getTodayYYYYMMDD();
      const wasToday = task.dateAssigned === today;
      const isPushingToFuture = newDate > task.dateAssigned;

      let becomeFrog = false;

      setDailyTracking(prev => {
          let newPostponeCount = prev.dailyPostponeCount;
          if (wasToday && isPushingToFuture) {
              newPostponeCount++;
          }
          return { ...prev, dailyPostponeCount: newPostponeCount };
      });

      const newRescheduleCount = (task.rescheduleCount || 0) + (isPushingToFuture ? 1 : 0);
      if (newRescheduleCount >= 2) {
          becomeFrog = true;
          setGamificationEvent({ type: 'penalty', amount: 0, message: "Task hardened into a Frog." });
      }

      setTasks(prev => prev.map(t => t.id === taskId ? {
          ...t,
          dateAssigned: newDate,
          schedulePrecision: 'day',
          scheduledFor: newDate,
          plannedOrder: 0,
          session: undefined,
          rescheduleCount: newRescheduleCount,
          frogFailures: newRescheduleCount,
          isFrog: becomeFrog ? true : t.isFrog
      } : t));
      return true;
  };

  const addTask = useCallback((taskData: any) => {
    const { title, description, dateAssigned, goalId, isFrog, isRepetitive, session, duration, isBreak, schedulePrecision = 'day', scheduledFor } = taskData;
    if (!title.trim()) return;

    const { cleanTitle, duration: pDur, hashtags, dateAssigned: pDate, session: pSess, isFrog: pFrog, isQuickie } = parseTitleForExtras(title);
    
    const finalDate = pDate || dateAssigned || getTodayYYYYMMDD();
    const finalSchedulePrecision: 'day' | 'month' = pDate ? 'day' : schedulePrecision;
    const finalScheduledFor = pDate || scheduledFor || (finalSchedulePrecision === 'month' ? finalDate.slice(0, 7) : finalDate);
    assertSchedule(finalSchedulePrecision, finalScheduledFor, getTodayYYYYMMDD());
    const finalIsFrog = !!isFrog || !!pFrog;
    const finalDuration = duration || pDur || 25; 

    let finalGoalId = goalId;
    if (!finalGoalId && hashtags && hashtags.length > 0) {
        for (const tag of hashtags) {
            if (hashtagConfigs[tag]?.linkedGoalId) {
                finalGoalId = hashtagConfigs[tag].linkedGoalId;
                break;
            }
        }
    }

    setTasks(prev => {
        const isToday = finalDate === getTodayYYYYMMDD();
        let creationTime = Date.now();
        if (isToday && finalIsFrog) {
            const todaysTasks = prev.filter(t => t.dateAssigned === finalDate);
            const minCreatedAt = todaysTasks.length > 0 ? Math.min(...todaysTasks.map(t => t.createdAt)) : Date.now();
            creationTime = minCreatedAt - 1000;
        }

        const newTask: Task = {
          id: crypto.randomUUID(),
          title: cleanTitle,
          description: description,
          dateAssigned: finalDate,
          completed: false,
          isFrog: finalIsFrog,
          isRepetitive: !!isRepetitive,
          isQuickie: !!isQuickie,
          isBreak: !!isBreak,
          createdAt: creationTime,
          duration: finalDuration,
          hashtags,
          goalId: finalGoalId,
          session: session || pSess || (finalIsFrog ? 'morning' : undefined),
          strikes: 0,
          rescheduleCount: 0,
          schedulePrecision: finalSchedulePrecision,
          scheduledFor: finalScheduledFor,
          plannedOrder: 0,
          frogFailures: 0,
          beforeFrog: false,
          source: 'manual',
          lifecycleStatus: 'open'
        };
        return [...prev, newTask];
    });
    
    setHashtagConfigs(prev => {
        if (!hashtags || hashtags.length === 0) return prev;
        const next = { ...prev };
        let changed = false;
        hashtags.forEach((tag: string) => {
            if (!next[tag]) {
                const hue = Math.floor(Math.random() * 360);
                next[tag] = { color: `hsl(${hue}, 70%, 50%)` };
                changed = true;
            }
        });
        return changed ? next : prev;
    });
  }, [hashtagConfigs]);

  const addSubtasks = useCallback((subtasks: any[], parentTask: Task) => {
     const newTasks: Task[] = subtasks.map((st, index) => {
       const schedulePrecision = st.schedulePrecision || parentTask.schedulePrecision || 'day';
       const scheduledFor = st.scheduledFor || (schedulePrecision === 'month'
           ? (parentTask.scheduledFor || parentTask.dateAssigned).slice(0, 7)
           : st.dateAssigned || parentTask.scheduledFor || parentTask.dateAssigned);
       return {
         id: crypto.randomUUID(),
         title: st.title,
         duration: st.duration,
         dateAssigned: schedulePrecision === 'month' ? `${scheduledFor}-01` : scheduledFor,
         session: parentTask.session,
         goalId: parentTask.goalId,
         hashtags: parentTask.hashtags,
         completed: false,
         isFrog: false,
         isQuickie: st.duration <= 2,
         createdAt: Date.now() + index,
         strikes: 0,
         rescheduleCount: 0,
         schedulePrecision,
         scheduledFor,
         plannedOrder: (parentTask.plannedOrder || 0) + index,
         frogFailures: 0,
         beforeFrog: false,
         source: 'manual',
         parentTaskId: parentTask.id,
         lifecycleStatus: 'open'
       } as Task;
     });
     setTasks(prev => [
         ...prev.map(t => t.id === parentTask.id ? {
             ...t,
             completed: true,
             completedAt: Date.now(),
             lifecycleStatus: 'broken_down' as const
         } : t),
         ...newTasks
     ]);
  }, []);

  const updateTask = useCallback((taskId: string, updates: any) => {
    let parsedUpdates = { ...updates };
    const existingTask = tasks.find(task => task.id === taskId);
    if (existingTask?.isFrog) {
        parsedUpdates.isFrog = true;
        const nextScheduledFor = parsedUpdates.scheduledFor || parsedUpdates.dateAssigned || existingTask.scheduledFor || existingTask.dateAssigned;
        const currentScheduledFor = existingTask.scheduledFor || existingTask.dateAssigned;
        if (nextScheduledFor > currentScheduledFor) {
            parsedUpdates.schedulePrecision = existingTask.schedulePrecision;
            parsedUpdates.scheduledFor = existingTask.scheduledFor;
            parsedUpdates.dateAssigned = existingTask.dateAssigned;
        }
    }
    if (updates.title) {
        const { cleanTitle, duration, hashtags } = parseTitleForExtras(updates.title);
        parsedUpdates.title = cleanTitle;
        if (updates.duration === undefined && duration !== undefined) parsedUpdates.duration = duration;
        if (updates.hashtags === undefined) {
             parsedUpdates.hashtags = hashtags;
             if (hashtags.length > 0 && !parsedUpdates.goalId) {
                 for (const tag of hashtags) {
                    if (hashtagConfigs[tag]?.linkedGoalId) {
                        parsedUpdates.goalId = hashtagConfigs[tag].linkedGoalId;
                        break;
                    }
                }
             }
        }
    }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...parsedUpdates } : t));
  }, [hashtagConfigs, tasks]);

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => {
        const task = prev.find(t => t.id === taskId);
        if (task && task.habitId) {
             setHabits(h => h.map(hb => hb.id === task.habitId ? { ...hb, streak: 0 } : hb));
        }
        // Keep a tombstone in the synced snapshot. Filtering the row locally
        // would make a cloud reconciliation recreate it on the next reload.
        return prev.map(t => t.id === taskId ? {
            ...t,
            completed: true,
            wontDo: true,
            lifecycleStatus: 'archived' as const,
            deletedAt: new Date().toISOString(),
            completedAt: t.completedAt || Date.now()
        } : t);
    });
  }, []);

  const markWontDo = useCallback((taskId: string) => {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: true, wontDo: true, lifecycleStatus: 'dropped', completedAt: Date.now() } : t));
  }, []);

  const setFrog = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? {...t, isFrog: true } : t));
  }, []);
  
  const moveTaskToTopToday = useCallback((taskId: string) => {
    setTasks(prev => {
        const today = getTodayYYYYMMDD();
        const todaysTasks = prev.filter(t => t.dateAssigned === today && !t.completed && !t.wontDo);
        const minCreatedAt = todaysTasks.length > 0 ? Math.min(...todaysTasks.map(t => t.createdAt)) : Date.now();
        return prev.map(t => t.id === taskId ? { ...t, dateAssigned: today, createdAt: minCreatedAt - 1000, session: undefined } : t);
    });
  }, []);

  const completeTask = useCallback((taskId: string, actualDuration?: number, flowState?: FlowState, finalDescription?: string) => {
    if (completedTaskIds.current.has(taskId)) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.completed || task.wontDo || task.deletedAt) return;
    completedTaskIds.current.add(taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { 
        ...t, completed: true, lifecycleStatus: 'completed', completedAt: Date.now(), actualDuration, flowState, description: finalDescription || t.description
    } : t));

    if(task) {
        setStats(prev => ({
            ...prev,
            tasksCompleted: prev.tasksCompleted + 1,
            frogsEaten: prev.frogsEaten + (task.isFrog ? 1 : 0),
            timeFocused: prev.timeFocused + (actualDuration || task.duration || 0),
        }));

        if (task.goalId) {
            setGoals(prev => prev.map(g => g.id === task.goalId ? { ...g, completedTasks: g.completedTasks + 1 } : g));
        }
        
        let habitStreak = 0;
        if (task.habitId) {
            setHabits(prev => prev.map(h => {
                if (h.id === task.habitId) {
                    habitStreak = h.streak + 1;
                    return { ...h, streak: habitStreak, bestStreak: Math.max(h.bestStreak, habitStreak), lastCompletedDate: getTodayYYYYMMDD() };
                }
                return h;
            }));
        }

        let earnedXp = task.isFrog ? XP_PER_TASK * XP_PER_FROG_MULTIPLIER : XP_PER_TASK;
        if (task.habitId) earnedXp += (habitStreak * 2);
        if (task.goalId || task.habitId) earnedXp += XP_GOAL_SYNERGY_BONUS;
        if (flowState === 'flow') earnedXp += 15; 
        if (flowState === 'high') earnedXp += 10;

        const remainingToday = tasks.filter(t => t.id !== taskId && t.dateAssigned === getTodayYYYYMMDD() && !t.completed && !t.wontDo);
        if (remainingToday.length === 0) {
            earnedXp += 50;
            setTimeout(() => setGamificationEvent({ type: 'reward', amount: 50, message: "Day Complete!" }), 500);
        }

        setUserProgress(prev => {
            const { xp, level, next, leveledUp } = checkLevelUp(prev.xp + earnedXp, prev.level, prev.xpToNextLevel);
            if (leveledUp) setJustLeveledUp(true);
            return { level, xp, xpToNextLevel: next };
        });
    }
  }, [tasks, habits]);

  const trackBreakTime = useCallback((minutes: number) => {
      setStats(prev => ({ ...prev, totalBreakMinutes: (prev.totalBreakMinutes || 0) + minutes }));
  }, []);

  const addHabit = useCallback((habitData: any) => {
      const { cleanTitle, duration, hashtags } = parseTitleForExtras(habitData.title);
      const newHabit: Habit = {
          ...habitData, title: cleanTitle, duration: habitData.duration || duration || 25, hashtags: [...(habitData.hashtags || []), ...hashtags],
          id: crypto.randomUUID(), streak: 0, bestStreak: 0, createdAt: Date.now(), beforeFrog: !!habitData.beforeFrog
      };
      setHabits(prev => [...prev, newHabit]);
      setUserProgress(prev => {
          const newXp = prev.xp + XP_HABIT_SETUP_BONUS;
          if (newXp >= prev.xpToNextLevel) {
              setJustLeveledUp(true);
              return { level: prev.level + 1, xp: newXp - prev.xpToNextLevel, xpToNextLevel: calculateXpToNextLevel(prev.level + 1) };
          }
          return { ...prev, xp: newXp };
      });
  }, []);

  const deleteHabit = useCallback((id: string) => {
      setHabits(prev => prev.filter(h => h.id !== id));
      setTasks(prev => prev.map(t => t.habitId === id ? { ...t, habitId: undefined } : t));
  }, []);

  const updateHabit = useCallback((id: string, updates: any) => {
      let parsed = { ...updates };
      if (updates.title) {
          const { cleanTitle, duration, hashtags } = parseTitleForExtras(updates.title);
          parsed.title = cleanTitle;
          if (duration) parsed.duration = duration;
          if (hashtags.length) parsed.hashtags = hashtags;
      }
      setHabits(prev => prev.map(h => h.id === id ? { ...h, ...parsed } : h));
  }, []);

  const addGoal = useCallback((data: any) => {
    const id = crypto.randomUUID();
    setGoals(prev => [...prev, { ...data, id, completedTasks: 0, createdAt: Date.now() }]);
    return id;
  }, []);

  const updateGoal = useCallback((id: string, updates: any) => setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g)), []);
  const deleteGoal = useCallback((id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    setTasks(prev => prev.map(t => t.goalId === id ? { ...t, goalId: undefined } : t));
    setHabits(prev => prev.map(h => h.goalId === id ? { ...h, goalId: undefined } : h));
  }, []);

  const addTrueNorthGoal = useCallback((data: any) => {
    const id = crypto.randomUUID();
    setTrueNorthGoals(prev => [{ ...data, id, createdAt: Date.now() }, ...prev]);
    return id;
  }, []);
  const updateTrueNorthGoal = useCallback((id: string, updates: any) => setTrueNorthGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g)), []);
  const deleteTrueNorthGoal = useCallback((id: string) => {
    setTrueNorthGoals(prev => prev.filter(g => g.id !== id));
    setTasks(prev => prev.map(t => t.goalId === id ? { ...t, goalId: undefined } : t));
    setHabits(prev => prev.map(h => h.goalId === id ? { ...h, goalId: undefined } : h));
  }, []);

  const updateAmalgam = useCallback((text: string) => setAmalgam(text), []);
  const updateHashtagConfig = useCallback((tag: string, updates: any) => setHashtagConfigs(prev => ({ ...prev, [tag]: { ...prev[tag], ...updates } })), []);
  const updateAccountabilityConfig = useCallback((updates: any) => setAccountabilityConfig(prev => ({ ...prev, ...updates })), []);
  
  const updateGoalPriorities = useCallback((updates: any) => {
      setGoals(prev => {
          const updated = prev.map(g => updates[g.id] ? { ...g, ...updates[g.id] } : g);
          return updated.sort((a, b) => ((b.excitement || 0) + (b.roi || 0)) - ((a.excitement || 0) + (a.roi || 0)));
      });
  }, []);

  const reorderGlobalToday = useCallback((taskId: string, newIndex: number) => {
      setTasks(prev => {
          const today = getTodayYYYYMMDD();
          const todaysTasks = prev.filter(t => t && t.dateAssigned === today && !t.completed && !t.wontDo);
          todaysTasks.sort(compareQueueCandidates);
          const taskIndex = todaysTasks.findIndex(t => t.id === taskId);
          if (taskIndex === -1) return prev;
          const [movedTask] = todaysTasks.splice(taskIndex, 1);
          todaysTasks.splice(newIndex, 0, movedTask);
          const reorderedUpdates = todaysTasks.map((t, i) => ({ ...t, plannedOrder: i, session: undefined }));
          const otherTasks = prev.filter(t => !t || t.dateAssigned !== today || t.completed || t.wontDo);
          return [...otherTasks, ...reorderedUpdates];
      });
  }, []);

  const reorderTodayTasks = useCallback((tid: string, s1: any, sIdx: number, s2: any, dIdx: number) => reorderGlobalToday(tid, dIdx), [reorderGlobalToday]); 
  
  const updateTaskPriorities = useCallback((updates: any) => {
      setTasks(prev => {
          const today = getTodayYYYYMMDD();
          const todaysTasks = prev.filter(t => t && !t.completed && t.dateAssigned === today && !t.wontDo);
          const otherTasks = prev.filter(t => t && (t.completed || t.wontDo || t.dateAssigned !== today));
          const updatedToday = todaysTasks.map(t => updates[t.id] ? { ...t, ...updates[t.id] } : t);
          updatedToday.sort((a, b) => ((b.excitement||0)*1.5 + (b.roi||0)) - ((a.excitement||0)*1.5 + (a.roi||0)));
          return [...otherTasks, ...updatedToday.map((t, i) => ({ ...t, plannedOrder: i }))];
      });
  }, []);

  const sortTodayTasksCircadian = useCallback(() => {
      setTasks(prev => {
          const today = getTodayYYYYMMDD();
          const todaysTasks = prev.filter(t => t && !t.completed && t.dateAssigned === today && !t.wontDo);
          const otherTasks = prev.filter(t => t && (t.completed || t.wontDo || t.dateAssigned !== today));
          
          const sortedToday = [...todaysTasks].sort((a, b) => {
              // Circadian recommendations may reorder only inside the allowed precedence group.
              const aGroup = a.beforeFrog && a.habitId ? 0 : a.isFrog ? 1 : 2;
              const bGroup = b.beforeFrog && b.habitId ? 0 : b.isFrog ? 1 : 2;
              if (aGroup !== bGroup) return compareQueueCandidates(a, b);
              
              // 2. Breaks last
              if (a.isBreak && !b.isBreak) return 1;
              if (!a.isBreak && b.isBreak) return -1;
              
              // 3. Priority by excitement & ROI
              const aVal = (a.excitement || 0) * 1.5 + (a.roi || 0);
              const bVal = (b.excitement || 0) * 1.5 + (b.roi || 0);
              return bVal - aVal;
          });
          
          const reorderedToday = sortedToday.map((t, i) => ({ ...t, plannedOrder: i, session: undefined }));
          return [...otherTasks, ...reorderedToday];
      });
  }, []);

  const uncompletedTasks = useMemo(() => tasks.filter(task => task && !task.completed && !task.wontDo), [tasks]);
  const overdueTasks = useMemo(() => {
      const today = getTodayYYYYMMDD();
      const currentMonth = today.slice(0, 7);
      return tasks.filter(t => t && !t.completed && !t.wontDo && (
          t.schedulePrecision === 'month'
              ? (t.scheduledFor || t.dateAssigned.slice(0, 7)) <= currentMonth
              : t.dateAssigned < today
      ));
  }, [tasks]);

  const todayStr = getTodayYYYYMMDD();
  const todayTasks = useMemo(() => uncompletedTasks
      .filter(task => task.schedulePrecision !== 'month' && task.dateAssigned === todayStr)
      .sort(compareQueueCandidates), [uncompletedTasks, todayStr]);
  const upcomingTasks = useMemo(() => uncompletedTasks.filter(task => task.schedulePrecision === 'month'
      ? (task.scheduledFor || task.dateAssigned.slice(0, 7)) > todayStr.slice(0, 7)
      : task.dateAssigned > todayStr
  ).sort((a, b) => a.dateAssigned.localeCompare(b.dateAssigned) || a.createdAt - b.createdAt), [uncompletedTasks, todayStr]);
  const recentCompletedTasks = useMemo(() => tasks.filter(t => t && t.completed && !t.deletedAt).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 20), [tasks]);
  const allCompletedTasks = useMemo(() => tasks.filter(t => t && (t.completed || t.wontDo) && !t.deletedAt).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)), [tasks]);
  const currentTask = useMemo(() => todayTasks.length > 0 ? todayTasks[0] : null, [todayTasks]);

  return {
    isLoading,
    tasks, goals, habits, trueNorthGoals, amalgam,
    currentTask, todayTasks, upcomingTasks, overdueTasks, recentCompletedTasks, allCompletedTasks, 
    stats, userProgress, hashtagConfigs, accountabilityConfig, justLeveledUp, setJustLeveledUp,
    gamificationEvent, setGamificationEvent, planningWarning, setPlanningWarning,
    trackPlanVisit, rescheduleTask, awardSessionXp,
    addTask, addSubtasks, updateTask, deleteTask, markWontDo, setFrog, moveTaskToTopToday, completeTask,
    trackBreakTime, reorderTodayTasks, updateTaskPriorities, reorderGlobalToday, sortTodayTasksCircadian,
    addGoal, updateGoal, deleteGoal, addHabit, updateHabit, deleteHabit,
    updateHashtagConfig, updateAccountabilityConfig, updateGoalPriorities,
    addTrueNorthGoal, updateTrueNorthGoal, deleteTrueNorthGoal, updateAmalgam,
    circadianState, submitBioCheckIn, resetCircadianState,
    userSettings, updateUserSettings
  };
};
