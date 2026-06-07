

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, Stats, Session, Goal, UserProgress, FlowState, HashtagConfig, Habit, AccountabilityConfig, TrueNorthGoal, GamificationEvent, CircadianState } from '../types';
import { getTodayYYYYMMDD } from '../utils/dateUtils';
import { parseTitleForExtras } from '../utils/timeAndTagParser';
import { storageService, STORES } from '../services/storage';

export interface UserSettings {
    enableAi: boolean;
}

const XP_PER_TASK = 10;
const XP_PER_FROG_MULTIPLIER = 3; 
const XP_GOAL_SYNERGY_BONUS = 15; 
const XP_HABIT_SETUP_BONUS = 50;
const XP_HABIT_PENALTY = 50;
const BASE_XP_FOR_LEVEL = 100;

interface DailyTracking {
    date: string;
    planViewCount: number;
    dailyPostponeCount: number;
}

const calculateXpToNextLevel = (level: number) => level * BASE_XP_FOR_LEVEL;

export const useGoalflow = (userEmail: string) => {
  // Keys for DB retrieval (User scoped)
  const USER_KEY = userEmail; 

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
  const [userSettings, setUserSettings] = useState<UserSettings>({ enableAi: false });

  // Transient State
  const [justLeveledUp, setJustLeveledUp] = useState(false);
  const [gamificationEvent, setGamificationEvent] = useState<GamificationEvent | null>(null);
  const [planningWarning, setPlanningWarning] = useState(false);

  // --- Initialization (Hydration) ---
  useEffect(() => {
    const loadData = async () => {
      try {
        const [
            lTasks, lGoals, lHabits, lTrueNorth, lAmalgam, lHashtags, lAllStats, lProgress, lDaily, lAccountability, lCircadian, lSettings
        ] = await Promise.all([
            storageService.migrateFromLocalStorage<Task[]>(STORES.TASKS, USER_KEY, `goalflow_tasks_${userEmail}`, []),
            storageService.migrateFromLocalStorage<Goal[]>(STORES.GOALS, USER_KEY, `goalflow_goals_${userEmail}`, []),
            storageService.migrateFromLocalStorage<Habit[]>(STORES.HABITS, USER_KEY, `goalflow_habits_${userEmail}`, []),
            storageService.migrateFromLocalStorage<TrueNorthGoal[]>(STORES.TRUE_NORTH, USER_KEY, `goalflow_truenorth_${userEmail}`, []),
            storageService.migrateFromLocalStorage<string>(STORES.AMALGAM, USER_KEY, `goalflow_amalgam_${userEmail}`, "My world takes care of me"),
            storageService.migrateFromLocalStorage<any>(STORES.HASHTAGS, USER_KEY, `goalflow_hashtags_${userEmail}`, {}),
            storageService.migrateFromLocalStorage<{ [date: string]: Stats }>(STORES.STATS, USER_KEY, `goalflow_stats_${userEmail}`, {}),
            storageService.migrateFromLocalStorage<UserProgress>(STORES.PROGRESS, USER_KEY, `goalflow_progress_${userEmail}`, { level: 1, xp: 0, xpToNextLevel: BASE_XP_FOR_LEVEL }),
            storageService.migrateFromLocalStorage<DailyTracking>(STORES.TRACKING, USER_KEY, `goalflow_tracking_${userEmail}`, { date: getTodayYYYYMMDD(), planViewCount: 0, dailyPostponeCount: 0 }),
            storageService.migrateFromLocalStorage<AccountabilityConfig>(STORES.ACCOUNTABILITY, USER_KEY, `goalflow_accountability_${userEmail}`, { enabled: false, partners: [], scope: 'all', targetHashtags: [] }),
            storageService.migrateFromLocalStorage<CircadianState>(STORES.CIRCADIAN, USER_KEY, `goalflow_circadian_${userEmail}`, { lastCheckIn: '', score: 0, mode: 'maintenance', metrics: { sunrise: false, sleepHours: 0, energy: 0, clarity: 0, interest: 0 } }),
            storageService.migrateFromLocalStorage<UserSettings>(STORES.SETTINGS, USER_KEY, `goalflow_settings_${userEmail}`, { enableAi: false }),
        ]);

        setTasks(lTasks);
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
  }, [userEmail]);

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

  // Watchers
  useEffect(() => { if (!isLoading) persist(STORES.TASKS, tasks); }, [tasks, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.GOALS, goals); }, [goals, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.HABITS, habits); }, [habits, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.TRUE_NORTH, trueNorthGoals); }, [trueNorthGoals, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.AMALGAM, amalgam); }, [amalgam, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.HASHTAGS, hashtagConfigs); }, [hashtagConfigs, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.PROGRESS, userProgress); }, [userProgress, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.TRACKING, dailyTracking); }, [dailyTracking, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.ACCOUNTABILITY, accountabilityConfig); }, [accountabilityConfig, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.CIRCADIAN, circadianState); }, [circadianState, isLoading, persist]);
  useEffect(() => { if (!isLoading) persist(STORES.SETTINGS, userSettings); }, [userSettings, isLoading, persist]);

  // Special Stats Persistence
  useEffect(() => {
      if (!isLoading) {
          const today = getTodayYYYYMMDD();
          const updatedAllStats = { ...allStats, [today]: stats };
          // Only update if changed deeply? No, React state update is enough signal.
          // However, we avoid infinite loop by not setting AllStats in state here, just persisting it.
          // But we need to keep `allStats` ref current for other logic if needed.
          // Actually, let's update `allStats` state when `stats` changes, but do it carefully.
          // Simplification: Just persist the merged object.
          persist(STORES.STATS, updatedAllStats);
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
      let xpPenalty = 0;

      let updatedHabits = habits.map(h => ({ ...h }));
      
      const todaysTasks = tasks.filter(t => t.dateAssigned === today);
      const minCreatedAt = todaysTasks.length > 0 
          ? Math.min(...todaysTasks.map(t => t.createdAt)) 
          : Date.now();
      let prependCounter = 1;

      updatedHabits.forEach((habit, index) => {
          if (!habit) return; 

          if (habit.lastCompletedDate) {
              const lastDate = new Date(habit.lastCompletedDate);
              const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
              
              if (habit.frequency === 'daily' && diffDays > 1) {
                  if (habit.streak > 0) {
                      updatedHabits[index].streak = 0;
                      habitsUpdated = true;
                      xpPenalty += XP_HABIT_PENALTY;
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
                      id: `habit-${habit.id}-${today}`,
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
                      rescheduleCount: 0
                  };
                  newTasks.push(newTask);
              }
          }
      });

      if (newTasks.length > 0) {
          setTasks(prev => [...prev, ...newTasks]);
      }
      if (habitsUpdated) {
          setHabits(updatedHabits);
      }
      if (xpPenalty > 0) {
          setUserProgress(prev => ({
              ...prev,
              xp: Math.max(0, prev.xp - XP_HABIT_PENALTY)
          }));
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
      setUserProgress(prev => ({
          ...prev,
          xp: Math.max(0, prev.xp - amount)
      }));
      setGamificationEvent({ type: 'penalty', amount, message });
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
      const isPushingToFuture = newDate > today;

      let penaltyApplied = false;
      let penaltyMsg = "";
      let penaltyAmt = 0;
      let becomeFrog = false;

      setDailyTracking(prev => {
          let newPostponeCount = prev.dailyPostponeCount;
          if (wasToday && isPushingToFuture) {
              newPostponeCount++;
              if (newPostponeCount > 2) {
                  penaltyApplied = true;
                  penaltyAmt += 20;
                  penaltyMsg = "Only plan what you can act on.";
              }
          }
          return { ...prev, dailyPostponeCount: newPostponeCount };
      });

      const newRescheduleCount = (task.rescheduleCount || 0) + 1;
      if (newRescheduleCount === 2) {
          penaltyApplied = true;
          penaltyAmt += 10;
          penaltyMsg = penaltyMsg ? `${penaltyMsg} Also, re-planning costs energy.` : "Re-planning costs energy.";
      }
      if (newRescheduleCount >= 3) {
          becomeFrog = true;
          setGamificationEvent({ type: 'penalty', amount: 0, message: "Task hardened into a Frog." });
      }

      if (penaltyApplied) applyPenalty(penaltyAmt, penaltyMsg);

      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, dateAssigned: newDate, session: undefined, rescheduleCount: newRescheduleCount, isFrog: becomeFrog ? true : t.isFrog } : t));
      return true;
  };

  const addTask = useCallback((taskData: any) => {
    const { title, description, dateAssigned, goalId, isFrog, isRepetitive, session, duration, isBreak } = taskData;
    if (!title.trim()) return;

    const { cleanTitle, duration: pDur, hashtags, dateAssigned: pDate, session: pSess, isFrog: pFrog, isQuickie } = parseTitleForExtras(title);
    
    const finalDate = pDate || dateAssigned || getTodayYYYYMMDD();
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
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
          rescheduleCount: 0
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
     const newTasks: Task[] = subtasks.map((st, index) => ({
         id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
         title: st.title,
         duration: st.duration,
         dateAssigned: parentTask.dateAssigned,
         session: parentTask.session,
         goalId: parentTask.goalId,
         hashtags: parentTask.hashtags,
         completed: false,
         isFrog: false,
         isQuickie: st.duration <= 2,
         createdAt: Date.now() + index,
         strikes: 0,
         rescheduleCount: 0
     }));
     setTasks(prev => [...prev.filter(t => t.id !== parentTask.id), ...newTasks]);
  }, []);

  const updateTask = useCallback((taskId: string, updates: any) => {
    let parsedUpdates = { ...updates };
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
  }, [hashtagConfigs]);

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => {
        const task = prev.find(t => t.id === taskId);
        if (task && task.habitId) {
             setHabits(h => h.map(hb => hb.id === task.habitId ? { ...hb, streak: 0 } : hb));
             setUserProgress(p => ({ ...p, xp: Math.max(0, p.xp - XP_HABIT_PENALTY) }));
        }
        return prev.filter(t => t.id !== taskId);
    });
  }, []);

  const markWontDo = useCallback((taskId: string) => {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: true, wontDo: true, completedAt: Date.now() } : t));
  }, []);

  const setFrog = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? {...t, isFrog: !t.isFrog } : t));
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
    setTasks(prev => prev.map(t => t.id === taskId ? { 
        ...t, completed: true, completedAt: Date.now(), actualDuration, flowState, description: finalDescription || t.description
    } : t));

    const task = tasks.find(t => t.id === taskId);
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
          id: `habit-${Date.now()}`, streak: 0, bestStreak: 0, createdAt: Date.now()
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
    const id = `${Date.now()}`;
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
    const id = `tn-${Date.now()}`;
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
          todaysTasks.sort((a, b) => a.createdAt - b.createdAt);
          const taskIndex = todaysTasks.findIndex(t => t.id === taskId);
          if (taskIndex === -1) return prev;
          const [movedTask] = todaysTasks.splice(taskIndex, 1);
          todaysTasks.splice(newIndex, 0, movedTask);
          const now = Date.now();
          const reorderedUpdates = todaysTasks.map((t, i) => ({ ...t, createdAt: now + i, session: undefined }));
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
          const now = Date.now();
          return [...otherTasks, ...updatedToday.map((t, i) => ({ ...t, createdAt: now + i }))];
      });
  }, []);

  const sortTodayTasksCircadian = useCallback(() => {
      setTasks(prev => {
          const today = getTodayYYYYMMDD();
          const todaysTasks = prev.filter(t => t && !t.completed && t.dateAssigned === today && !t.wontDo);
          const otherTasks = prev.filter(t => t && (t.completed || t.wontDo || t.dateAssigned !== today));
          
          const sortedToday = [...todaysTasks].sort((a, b) => {
              // 1. Frogs first
              if (a.isFrog && !b.isFrog) return -1;
              if (!a.isFrog && b.isFrog) return 1;
              
              // 2. Breaks last
              if (a.isBreak && !b.isBreak) return 1;
              if (!a.isBreak && b.isBreak) return -1;
              
              // 3. Priority by excitement & ROI
              const aVal = (a.excitement || 0) * 1.5 + (a.roi || 0);
              const bVal = (b.excitement || 0) * 1.5 + (b.roi || 0);
              return bVal - aVal;
          });
          
          const now = Date.now();
          const reorderedToday = sortedToday.map((t, i) => ({ ...t, createdAt: now + i, session: undefined }));
          return [...otherTasks, ...reorderedToday];
      });
  }, []);

  const uncompletedTasks = useMemo(() => tasks.filter(task => task && !task.completed && !task.wontDo), [tasks]);
  const overdueTasks = useMemo(() => {
      const today = getTodayYYYYMMDD();
      return tasks.filter(t => t && !t.completed && !t.wontDo && t.dateAssigned < today);
  }, [tasks]);

  const todayStr = getTodayYYYYMMDD();
  const todayTasks = useMemo(() => uncompletedTasks.filter(task => task.dateAssigned === todayStr).sort((a, b) => a.createdAt - b.createdAt), [uncompletedTasks, todayStr]);
  const upcomingTasks = useMemo(() => uncompletedTasks.filter(task => task.dateAssigned > todayStr).sort((a, b) => a.dateAssigned.localeCompare(b.dateAssigned) || a.createdAt - b.createdAt), [uncompletedTasks, todayStr]);
  const recentCompletedTasks = useMemo(() => tasks.filter(t => t && t.completed).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 20), [tasks]);
  const allCompletedTasks = useMemo(() => tasks.filter(t => t && (t.completed || t.wontDo)).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)), [tasks]);
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
