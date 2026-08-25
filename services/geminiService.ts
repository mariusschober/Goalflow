import { apiUrl, supabase } from './authService';

const authenticatedFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set('authorization', `Bearer ${session.access_token}`);
  return fetch(apiUrl(input), { ...init, headers });
};

export interface AiSubtask {
  title: string;
  estimatedDuration: number;
}

export interface AiHabitSuggestion {
    title: string;
    reasoning: string;
    type: 'habit' | 'task';
    duration?: number;
    dateAssigned?: string;
    frequency?: 'daily' | 'specific_days';
    specificDays?: number[];
}

export interface ValidationResult {
    isActionable: boolean;
    reason?: string;
    suggestions?: string[];
}

// In-memory cache to prevent hitting quota for repeated identical calls
const visualizationCache = new Map<string, string>();
const validationCache = new Map<string, ValidationResult>();

export const breakdownTaskWithGemini = async (taskTitle: string): Promise<AiSubtask[]> => {
  try {
    const response = await authenticatedFetch("/api/gemini/breakdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskTitle }),
    });

    if (!response.ok) {
      throw new Error("Failed to connect to backend");
    }

    const result = await response.json();
    if (result && Array.isArray(result.subtasks)) {
      return result.subtasks;
    }
    return [];
  } catch (error) {
    console.error("Error in breakdownTaskWithGemini api client:", error);
    return [];
  }
};

export const getGoalHabitSuggestions = async (goalTitle: string, goalDescription: string): Promise<AiHabitSuggestion[]> => {
  try {
    const response = await authenticatedFetch("/api/gemini/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalTitle, goalDescription }),
    });

    if (!response.ok) {
      throw new Error("Failed to connect to backend");
    }

    const result = await response.json();
    return result.suggestions || [];
  } catch (error) {
    console.error("Error in getGoalHabitSuggestions api client:", error);
    return [];
  }
};

export const getVisualizationPrompt = async (taskTitle: string): Promise<string> => {
  if (visualizationCache.has(taskTitle)) {
    return visualizationCache.get(taskTitle)!;
  }

  try {
    const response = await authenticatedFetch("/api/gemini/visualization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskTitle }),
    });

    if (!response.ok) {
      throw new Error("Failed to connect to backend");
    }

    const result = await response.json();
    const prompt = result.prompt || "Imagine completing this task easily and gracefully.";
    visualizationCache.set(taskTitle, prompt);
    return prompt;
  } catch (error) {
    console.warn("Error getting visualization prompt:", error);
    return "Imagine completing this task easily and gracefully.";
  }
};

export interface ImportanceReductionResult {
    reframing: string;
    importanceExercise: string;
    coachingTip: string;
}

export interface OuterIntentionResult {
    suggestedHabit: string;
    suggestedHabitReason: string;
    suggestedTasks: string[];
}

export const validateTaskActionability = async (taskTitle: string): Promise<ValidationResult> => {
  if (validationCache.has(taskTitle)) {
    return validationCache.get(taskTitle)!;
  }

  try {
    const response = await authenticatedFetch("/api/gemini/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskTitle }),
    });

    if (!response.ok) {
      throw new Error("Failed to connect to backend");
    }

    const result = await response.json();
    validationCache.set(taskTitle, result);
    return result;
  } catch (error) {
    console.error("Error validating task actionability:", error);
    return { isActionable: true }; 
  }
};

export const reduceImportanceWithGemini = async (vision: string, sensoryDetails: string, planB: string, importance: number): Promise<ImportanceReductionResult> => {
  try {
    const response = await authenticatedFetch("/api/gemini/reduce-importance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vision, sensoryDetails, planB, importance }),
    });

    if (!response.ok) {
      throw new Error("Failed to consult importance coach");
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error calling reduce-importance assistant:", error);
    return {
      reframing: "Regard this vision as calmly as walking to your mailbox. It is simple, clear, and certain.",
      importanceExercise: "Inhale deeply for 4 seconds, walk 10 paces outside, and physically touch a natural surface to ground your energy.",
      coachingTip: "Formulate a strong Plan B (safety net) to let your subconscious mind fully relax."
    };
  }
};

export const getOuterIntentionRecommendations = async (vision: string, sensoryDetails: string): Promise<OuterIntentionResult> => {
  try {
    const response = await authenticatedFetch("/api/gemini/outer-intention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vision, sensoryDetails }),
    });

    if (!response.ok) {
      throw new Error("Failed to consult Outer Intention Coach");
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error calling core outer-intention recommender:", error);
    return {
      suggestedHabit: "15-Min Focused Execution",
      suggestedHabitReason: "Consistently acting on your goal daily matches the script momentum.",
      suggestedTasks: [
        "Jot down 3 milestones for this month",
        "Block 15 minutes in your calendar for tomorrow",
        "Set up folder structure or clean up workspace"
      ]
    };
  }
};
