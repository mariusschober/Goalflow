import { GoogleGenAI, Type } from "@google/genai";

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

const isQuotaError = (error: any): boolean => {
    const msg = error?.toString() || '';
    return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || error?.status === 429;
};

// Helper to get fresh client
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const breakdownTaskWithGemini = async (taskTitle: string): Promise<AiSubtask[]> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Break down the following project/task into 3-6 smaller, concrete, and actionable sub-tasks. 
      Task: "${taskTitle}"
      
      Ensure the sub-tasks are logical steps to complete the main task.
      Estimate the duration for each sub-task in minutes (usually between 5 and 60 minutes).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subtasks: {
              type: Type.ARRAY,
              description: 'List of actionable sub-tasks.',
              items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "The actionable sub-task title." },
                    estimatedDuration: { type: Type.INTEGER, description: "Estimated time in minutes." }
                },
                required: ["title", "estimatedDuration"]
              }
            }
          },
          required: ['subtasks']
        },
      },
    });

    const text = response.text;
    if (!text) return [];

    const result = JSON.parse(text);
    
    if (result && Array.isArray(result.subtasks)) {
      return result.subtasks;
    }
    return [];

  } catch (error) {
    if (isQuotaError(error)) {
        console.warn("Gemini API Quota Exceeded (Breakdown).");
    } else {
        console.error("Error calling Gemini API:", error);
    }
    // Return empty array to allow UI to fail gracefully
    return [];
  }
};

export const getGoalHabitSuggestions = async (goalTitle: string, goalDescription: string): Promise<AiHabitSuggestion[]> => {
    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `I have a long-term goal: "${goalTitle}".
            Description: "${goalDescription}".
            
            Act as an expert in behavioral psychology and Atomic Habits.
            Suggest 4-6 specific, actionable items to achieve this goal.
            Mix "Micro-Habits" (2-minute rule, daily repetitions) and "Key Tasks" (setup, milestones).
            
            For each suggestion, provide:
            1. A short, punchy title (e.g., "Read 2 pages", "Setup savings account").
            2. A very brief reasoning based on psychology (e.g., "Reduces friction", "Identity reinforcement").
            3. Whether it is a 'habit' (recurring) or a 'task' (one-off).
            4. An estimated duration in minutes for the action (e.g. 2, 5, 15, 30).`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suggestions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    reasoning: { type: Type.STRING },
                                    type: { type: Type.STRING, enum: ['habit', 'task'] },
                                    duration: { type: Type.INTEGER, description: "Duration in minutes" }
                                },
                                required: ['title', 'reasoning', 'type', 'duration']
                            }
                        }
                    },
                    required: ['suggestions']
                }
            }
        });

        const text = response.text;
        if (!text) return [];
        const result = JSON.parse(text);
        return result.suggestions || [];

    } catch (error) {
        if (isQuotaError(error)) {
            console.warn("Gemini API Quota Exceeded (Goal Suggestions).");
        } else {
            console.error("Error getting goal suggestions:", error);
        }
        return [];
    }
};

export const getVisualizationPrompt = async (taskTitle: string): Promise<string> => {
    if (visualizationCache.has(taskTitle)) {
        return visualizationCache.get(taskTitle)!;
    }

    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Create a short, powerful 1-sentence visualization prompt for the user who is about to start this task: "${taskTitle}".
            
            The prompt should:
            1. Encourage a "Flow State" and ease.
            2. Focus on the process being effortless and graceful.
            3. Describe the successful completion or the immediate positive action.
            
            Example: "Imagine your hands moving effortlessly across the keyboard, the words flowing naturally."
            
            Output ONLY the sentence.`,
        });
        
        const text = response.text || "Imagine completing this task easily and gracefully.";
        visualizationCache.set(taskTitle, text);
        return text;
    } catch (error) {
        // Suppress error log for quota issues on non-essential features
        return "Imagine completing this task easily and gracefully.";
    }
};

export const validateTaskActionability = async (taskTitle: string): Promise<ValidationResult> => {
    if (validationCache.has(taskTitle)) {
        return validationCache.get(taskTitle)!;
    }

    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `You are an expert productivity coach acting as an "Input Guardrail". 
            Your goal is to distinguish between "Projects" (vague, multi-step outcomes) and "Actionable Steps" (binary, execution-focused, physical actions).

            Task Input: "${taskTitle}"

            Rules for Rejection (Project):
            1. Broad verbs like "Learn", "Plan", "Work on", "Finish", "Organize".
            2. Outcomes that require multiple distinct sittings or steps (e.g., "Write Thesis", "Build App").
            3. Vague concepts without a clear starting point.

            Rules for Acceptance (Action):
            1. Specific physical actions like "Read Chapter 1", "Draft Outline", "Email John", "Write function X".
            2. Tasks that can be started *immediately* without further planning.
            3. Time-bound or small-scope items.

            Output JSON:
            {
                "isActionable": boolean,
                "reason": "A short, empathetic, 1-sentence explanation.",
                "suggestions": ["Action 1", "Action 2", "Action 3"]
            }`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isActionable: { type: Type.BOOLEAN },
                        reason: { type: Type.STRING },
                        suggestions: { 
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    required: ['isActionable']
                }
            }
        });

        const text = response.text;
        let result: ValidationResult = { isActionable: true };
        
        if (text) {
            result = JSON.parse(text);
        }
        
        validationCache.set(taskTitle, result);
        return result;

    } catch (error) {
        if (isQuotaError(error)) {
            console.warn("Gemini API Quota Exceeded (Validation). Failing open.");
        } else {
            console.error("Error validating task:", error);
        }
        // Fallback: If AI is down/quota exceeded, we must allow the user to proceed manually
        return { isActionable: true }; 
    }
};