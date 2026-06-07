import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON bodies
  app.use(express.json());

  // Lazy key check helper to prevent crashing at startup if key is missing
  const getGeminiClient = () => {
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    return new GoogleGenAI({ apiKey: key });
  };

  // API Route for Breakdown
  app.post("/api/gemini/breakdown", async (req, res) => {
    try {
      const { taskTitle } = req.body;
      if (!taskTitle) {
        return res.status(400).json({ error: "taskTitle is required" });
      }
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
      if (!text) {
        return res.json({ subtasks: [] });
      }
      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error("Error in server-side breakdownTaskWithGemini:", error);
      res.status(500).json({ error: error.message || "Failed to breakdown task" });
    }
  });

  // API Route for Suggestions
  app.post("/api/gemini/suggestions", async (req, res) => {
    try {
      const { goalTitle, goalDescription } = req.body;
      if (!goalTitle) {
        return res.status(400).json({ error: "goalTitle is required" });
      }
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `I have a long-term goal: "${goalTitle}".
        Description: "${goalDescription || ''}".
        
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
      if (!text) {
        return res.json({ suggestions: [] });
      }
      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error("Error in server-side suggestions:", error);
      res.status(500).json({ error: error.message || "Failed to get suggestions" });
    }
  });

  // API Route for Visualization
  app.post("/api/gemini/visualization", async (req, res) => {
    try {
      const { taskTitle } = req.body;
      if (!taskTitle) {
        return res.status(400).json({ error: "taskTitle is required" });
      }
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Create a short, powerful 1-sentence visualization prompt for the user who is about to start this task: "${taskTitle}".
        
        The prompt should:
        1. Encourage a "Flow State" and ease.
        2. Focus on the process being effortless and graceful.
        3. Describe the successful completion or the immediate positive action.
        
        Example: "Imagine your hands moving effortlessly across the keyboard, the words flowing naturally."
        
        Output ONLY the sentence.`,
      });
      const text = response.text || "Imagine completing this task easily and gracefully.";
      res.json({ prompt: text });
    } catch (error: any) {
      console.error("Error in server-side visualization:", error);
      res.json({ prompt: "Imagine completing this task easily and gracefully." });
    }
  });

  // API Route for Transurfing Importance Reduction
  app.post("/api/gemini/reduce-importance", async (req, res) => {
    try {
      const { vision, sensoryDetails, planB, importance } = req.body;
      if (!vision) {
        return res.status(400).json({ error: "vision is required" });
      }
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `According to Vadim Zeland's Reality Transurfing, "importance" is the primary barrier to manifestation because it creates "excess potential," which triggers balancing forces that actively disrupt the outcome.
        
        The goal of this coaching feedback is to advise the user on how to reduce their Importance Level which they've rated as ${importance || 5}/10.
        
        Details of the Goal/Vision:
        - Vision: "${vision}"
        - Sensory Details: "${sensoryDetails || ''}"
        - Safety Net (Plan B): "${planB || ''}"
        
        Respond with an objective, calming, non-judgmental Coaching Report in JSON format:
        {
          "reframing": "Alternative low-pressure framing of the vision. Describe it as though it has already happened or as a routine, simple fact (like going to the mailbox to get a letter). No excitement or desperation.",
          "importanceExercise": "A concrete 15-second physical action, safety-net exercise, or visual exercise tailored to this goal that reduces attachment immediately.",
          "coachingTip": "A crisp, direct Zeland-style coaching advice pointing out where the 'attachment trap' lies in their specific sensory details or plan B (e.g., if Plan B is missing, mention why a safety net is essential for inner comfort)."
        }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reframing: { type: Type.STRING },
              importanceExercise: { type: Type.STRING },
              coachingTip: { type: Type.STRING }
            },
            required: ['reframing', 'importanceExercise', 'coachingTip']
          }
        }
      });

      const text = response.text;
      if (!text) {
        return res.json({ 
          reframing: "Treat your vision with the calm expectation of getting mail.", 
          importanceExercise: "Formulate a concrete Plan B to erase the fear of failure.", 
          coachingTip: "Lowering importance is the key to letting outer intention work." 
        });
      }
      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error("Error in server-side reduce-importance:", error);
      res.status(500).json({ error: error.message || "Failed to process importance recommendation." });
    }
  });

  // API Route for Task Validation
  app.post("/api/gemini/validate", async (req, res) => {
    try {
      const { taskTitle } = req.body;
      if (!taskTitle) {
        return res.status(400).json({ error: "taskTitle is required" });
      }
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
      if (!text) {
        return res.json({ isActionable: true });
      }
      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error("Error in server-side validation:", error);
      res.json({ isActionable: true, reason: "Quota exceeded or temporary error." });
    }
  });

  // API Route for Transurfing Outer Intention (Phase 4)
  app.post("/api/gemini/outer-intention", async (req, res) => {
    try {
      const { vision, sensoryDetails } = req.body;
      if (!vision) {
        return res.status(400).json({ error: "vision is required" });
      }
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `According to Vadim Zeland's Reality Transurfing, "Outer Intention" represents active alignment with the universe, moving along the script of variations through silent, focused physical action.
        
        We need to help the user translate their ultimate True North vision: "${vision}" and mental blueprint details: "${sensoryDetails || ''}" into actual physical anchors.
        
        Provide the following concrete recommendation:
        1. "suggestedHabit" representing a small daily habit (Atomic Habit, e.g. 10-15 mins) that is a direct, minor physical expression of this vision.
        2. "suggestedHabitReason" detailing how this specific action coordinates outer intention.
        3. "suggestedTasks" being an array of exactly 3 concrete, one-off, binary tasks that they can perform immediately (within 24 hours) to signal action to their subconscious mind.
        
        Respond with an objective, neat coaching report in JSON format:
        {
          "suggestedHabit": "A punchy name of the habit (e.g., '10-Min Vision Sketching', '2-Page Study')",
          "suggestedHabitReason": "How this routine action trains outer intention and bridges the gap to reality",
          "suggestedTasks": [
            "Milestone Task 1 title (e.g., 'Draft domain list for the project')",
            "Milestone Task 2 title (e.g., 'Email the expert in group')",
            "Milestone Task 3 title (e.g., 'Create local spreadsheet to calculate numbers')"
          ]
        }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedHabit: { type: Type.STRING },
              suggestedHabitReason: { type: Type.STRING },
              suggestedTasks: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ['suggestedHabit', 'suggestedHabitReason', 'suggestedTasks']
          }
        }
      });

      const text = response.text;
      if (!text) {
        return res.json({
          suggestedHabit: "10-Min Goal Planning",
          suggestedHabitReason: "Taking small regular steps feeds the outer intention flow.",
          suggestedTasks: [
            "Research first milestone online",
            "Write outline for next week's efforts",
            "Identify 1 resource needed to proceed"
          ]
        });
      }
      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error("Error in server-side outer-intention:", error);
      res.status(500).json({ error: error.message || "Failed to generate outer intention recommendations." });
    }
  });

  // Serve static assets or use Vite dev server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
