
import { useState, useEffect, useRef, useCallback } from 'react';

type TimerType = 'countdown' | 'stopwatch';

interface TimerSettings {
  taskDurationInMinutes?: number;
  onExpire?: () => void;
  taskId?: string;
}

const STORAGE_KEY = 'goalflow_timer_state';

interface PersistedState {
  taskId: string | undefined;
  startTime: number;
  pausedAt: number | null; // If null, it's running. If set, it's paused.
  elapsedBeforePause: number; // Accumulator for previous segments
  isActive: boolean;
  hasExpired: boolean;
}

export const useFocusTimer = (settings: TimerSettings) => {
  const { taskDurationInMinutes, onExpire, taskId } = settings;
  const timerType: TimerType = typeof taskDurationInMinutes === 'number' && taskDurationInMinutes > 0 ? 'countdown' : 'stopwatch';

  // --- State Initialization from Storage or Defaults ---
  const [timerState, setTimerState] = useState<PersistedState>(() => {
    if (typeof window === 'undefined') {
        return { taskId, startTime: 0, pausedAt: Date.now(), elapsedBeforePause: 0, isActive: false, hasExpired: false };
    }
    
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: PersistedState = JSON.parse(saved);
        // Only restore if it matches the current task (or if no task ID was provided previously)
        if (parsed.taskId === taskId) {
            // If it was running (pausedAt is null), we need to check if we missed the expiry
            return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load timer state", e);
    }
    
    // Default: Paused at 0
    return { 
        taskId, 
        startTime: Date.now(), 
        pausedAt: Date.now(), 
        elapsedBeforePause: 0, 
        isActive: false,
        hasExpired: false 
    };
  });

  const [displaySeconds, setDisplaySeconds] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // --- Persist State Effect ---
  useEffect(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
  }, [timerState]);

  // --- Reset if Task Changes ---
  useEffect(() => {
      // Reset if taskId changes (including becoming undefined when task is completed)
      if (timerState.taskId !== taskId) {
          setTimerState({
              taskId,
              startTime: Date.now(),
              pausedAt: Date.now(),
              elapsedBeforePause: 0,
              isActive: false, // Ensure timer stops
              hasExpired: false
          });
      }
  }, [taskId, timerState.taskId]);

  // --- Calculation Helper ---
  const calculateElapsed = useCallback(() => {
      const now = Date.now();
      let currentSession = 0;
      
      if (!timerState.pausedAt) {
          // Timer is running
          currentSession = Math.floor((now - timerState.startTime) / 1000);
      }
      
      return timerState.elapsedBeforePause + currentSession;
  }, [timerState.startTime, timerState.pausedAt, timerState.elapsedBeforePause]);

  // --- The Ticker ---
  useEffect(() => {
    if (timerState.isActive && !timerState.pausedAt) {
      intervalRef.current = window.setInterval(() => {
        const elapsed = calculateElapsed();
        
        // Expiry Check for Countdown
        if (timerType === 'countdown' && taskDurationInMinutes) {
            const totalSeconds = taskDurationInMinutes * 60;
            const remaining = totalSeconds - elapsed;
            
            setDisplaySeconds(Math.max(0, remaining));

            if (remaining <= 0 && !timerState.hasExpired) {
                // Expired!
                setTimerState(prev => ({ ...prev, hasExpired: true, isActive: false, pausedAt: Date.now(), elapsedBeforePause: elapsed }));
                if (onExpire) onExpire();
            }
        } else {
            // Stopwatch
            setDisplaySeconds(Math.max(0, elapsed));
        }
      }, 250); // Update UI 4 times a second for smoothness, logic is based on Delta time so speed doesn't matter
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      
      // Update display one last time to static value
      const elapsed = calculateElapsed();
      if (timerType === 'countdown' && taskDurationInMinutes) {
          setDisplaySeconds(Math.max(0, (taskDurationInMinutes * 60) - elapsed));
      } else {
          setDisplaySeconds(Math.max(0, elapsed));
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState.isActive, timerState.pausedAt, timerState.startTime, timerState.elapsedBeforePause, timerType, taskDurationInMinutes, onExpire, calculateElapsed]);


  // --- Controls ---

  const toggleTimer = useCallback(() => {
    setTimerState(prev => {
        const now = Date.now();
        if (prev.isActive) {
            // PAUSE
            const sessionDuration = Math.floor((now - prev.startTime) / 1000);
            return {
                ...prev,
                isActive: false,
                pausedAt: now,
                elapsedBeforePause: prev.elapsedBeforePause + sessionDuration
            };
        } else {
            // RESUME
            return {
                ...prev,
                isActive: true,
                pausedAt: null,
                startTime: now // Reset start time to now, elapsed is stored in accumulator
            };
        }
    });
  }, []);

  const pause = useCallback(() => {
      setTimerState(prev => {
          if (!prev.isActive) return prev;
          const now = Date.now();
          const sessionDuration = Math.floor((now - prev.startTime) / 1000);
          return {
              ...prev,
              isActive: false,
              pausedAt: now,
              elapsedBeforePause: prev.elapsedBeforePause + sessionDuration
          };
      });
  }, []);

  const resetTimer = useCallback(() => {
      setTimerState({
          taskId,
          startTime: Date.now(),
          pausedAt: Date.now(),
          elapsedBeforePause: 0,
          isActive: false,
          hasExpired: false
      });
  }, [taskId]);

  const addTime = useCallback((minutes: number) => {
      setTimerState(prev => {
          // Removing time from "elapsed" effectively adds time to the countdown
          const secondsToRemove = minutes * 60;
          return {
              ...prev,
              elapsedBeforePause: prev.elapsedBeforePause - secondsToRemove,
              hasExpired: false, // Reset expiry if we added time
              isActive: true, // Auto resume
              pausedAt: null,
              startTime: Date.now()
          };
      });
  }, []);

  return {
    displaySeconds,
    elapsedSeconds: calculateElapsed(), // Return total elapsed for stats
    isActive: timerState.isActive,
    hasExpired: timerState.hasExpired,
    timerType,
    toggleTimer,
    pause,
    resume: toggleTimer, // Reuse toggle for resume if needed explicitly
    resetTimer,
    addTime
  };
};
