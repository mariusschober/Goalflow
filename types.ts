
export type Session = 'morning' | 'afternoon' | 'evening';

export type FlowState = 'distracted' | 'good' | 'high' | 'flow';

export type FrequencyType = 'daily' | 'specific_days';

export type TimeFrame = 'today' | 'week' | 'month' | 'year' | 'all';

export type GamificationEventType = 'reward' | 'penalty' | 'milestone';

export type CircadianMode = 'recovery' | 'maintenance' | 'apex';

export type StimulantType = 'none' | 'coffee_low' | 'coffee_high' | 'meds' | 'meds_coffee';

export type MentalState = 'sluggish' | 'flow' | 'scattered' | 'hyperfocus';

export interface BioMetrics {
    sunrise: boolean; // Morning light viewed?
    sleepHours: number;
    energy: number;
    clarity: number;
    interest: number;
    wakeTime?: string; // HH:MM
    eatingWindow?: number; // Hours (e.g. 10)
    firstMealTime?: string; // HH:MM
    stimulant?: StimulantType;
    mentalState?: MentalState;
    locationOverride?: { lat: number; lng: number };
    // Derived or specific fields
    lastMealTime?: string; // Calculated
}

export interface CircadianState {
    lastCheckIn: string; // YYYY-MM-DD
    score: number; // 0-100
    mode: CircadianMode;
    sunriseTime?: string; // HH:MM (24h)
    sunsetTime?: string; // HH:MM (24h)
    solarNoonTime?: string; // HH:MM (24h)
    metrics: BioMetrics;
}

export interface GamificationEvent {
  type: GamificationEventType;
  amount: number;
  message: string;
}

export interface Habit {
  id: string;
  title: string;
  frequency: FrequencyType;
  specificDays?: number[]; // 0 = Sunday, 1 = Monday, etc.
  streak: number;
  bestStreak: number;
  lastCompletedDate?: string; // YYYY-MM-DD
  isHighPriority: boolean;
  beforeFrog?: boolean;
  createdAt: number;
  goalId?: string;
  duration?: number; // duration in minutes
  hashtags?: string[]; 
}

export interface Goal {
  id: string;
  name: string;
  description?: string;
  targetTasks?: number; // Legacy/Optional now
  deadline?: string; // YYYY-MM-DD
  completedTasks: number;
  color: string; // e.g., '#4F46E5'
  createdAt: number;
  excitement?: number;
  roi?: number;
}

// NEW: Conscious Creation Navigator Goal Structure
export interface TrueNorthGoal {
  id: string;
  vision: string; // "Life Celebration"
  isMoneyGoal: boolean;
  tangibleReality?: string; // If money goal, what is the object?
  sensoryDetails: string; // "Mental Blueprint" scene description
  planB: string; // Safety Net / Fallback
  importance: number; // 1-10 Scale (Attachment/Pressure)
  anchorHabit?: string; // Phase 4 anchor habit description or title
  anchorTask?: string; // Phase 4 anchor milestones or first task
  anchorHabitDuration?: number; // Duration of habit in minutes (default 15)
  createdAt: number;
}

export interface UserProgress {
  level: number;
  xp: number;
  xpToNextLevel: number;
}

export interface Task {
  cloudId?: string;
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  isFrog: boolean;
  isQuickie?: boolean; // <2m task
  isRepetitive?: boolean; // Loop feature
  isBreak?: boolean; // New: Break task
  createdAt: number;
  completedAt?: number;
  duration?: number; // estimated duration in minutes
  actualDuration?: number; // tracked duration in minutes
  hashtags: string[];
  dateAssigned: string; // YYYY-MM-DD format
  session?: Session;
  goalId?: string;
  flowState?: FlowState;
  habitId?: string;
  excitement?: number; // 0-100
  roi?: number; // 0-100
  strikes?: number; // Overdue counter
  wontDo?: boolean; // Marked as Won't Do/Archived
  rescheduleCount?: number; // Track how many times it was pushed
  schedulePrecision?: 'day' | 'month';
  scheduledFor?: string;
  scheduledTime?: string;
  plannedOrder?: number;
  frogFailures?: number;
  beforeFrog?: boolean;
  source?: 'manual' | 'habit' | 'telegram' | 'share' | 'ai' | 'migration';
  parentTaskId?: string;
  lifecycleStatus?: 'open' | 'completed' | 'broken_down' | 'dropped' | 'archived';
  deletedAt?: string;
}

export interface Stats {
  tasksCompleted: number;
  frogsEaten: number;
  timeFocused: number; // in minutes
  totalBreakMinutes: number; // New field for break tracking
  bioLog?: BioMetrics; // Daily record of bio state
  circadianScore?: number;
}

export interface HashtagConfig {
  color?: string; // Optional now to allow default
  linkedGoalId?: string;
}

export interface HashtagStat {
  tag: string;
  count: number;
  avgFlowScore: number; // 1-4 scale
}

export interface AccountabilityPartner {
  email: string;
  frequency: 'daily' | 'weekly';
}

export interface AccountabilityConfig {
  enabled: boolean;
  partners: AccountabilityPartner[];
  // Legacy fields for migration support
  partnerEmail?: string;
  frequency?: 'daily' | 'weekly';
  scope: 'all' | 'hashtags';
  targetHashtags: string[];
}
