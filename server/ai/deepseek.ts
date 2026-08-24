import type { AppConfig } from "../config";
import type { AIProvider } from "./types";

export const createDeepSeekProvider = (config: AppConfig): AIProvider | undefined => {
  if (!config.DEEPSEEK_API_KEY) return undefined;
  return {
    name: "deepseek",
    model: config.DEEPSEEK_MODEL,
    async generateJson({ system, prompt, maxTokens }) {
      const response = await fetch(`${config.DEEPSEEK_API_BASE.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({
          model: config.DEEPSEEK_MODEL,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: maxTokens,
          stream: false
        }),
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`DeepSeek returned ${response.status}.`);
      const result = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned no content.");
      return {
        value: JSON.parse(content),
        usage: { prompt: result.usage?.prompt_tokens ?? 0, completion: result.usage?.completion_tokens ?? 0 }
      };
    }
  };
};
