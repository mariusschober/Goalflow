import type { AppConfig } from "../config";
import type { SpeechProvider } from "./types";

export const createOpenAiSpeechProvider = (config: AppConfig): SpeechProvider | undefined => {
  if (!config.OPENAI_API_KEY) return undefined;
  return {
    name: "openai",
    async transcribe({ audio, mimeType, fileName }) {
      const body = new FormData();
      body.append("model", config.OPENAI_TRANSCRIPTION_MODEL);
      body.append("file", new Blob([audio], { type: mimeType }), fileName);
      const response = await fetch(`${config.OPENAI_API_BASE.replace(/\/$/, "")}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.OPENAI_API_KEY}` },
        body,
        signal: AbortSignal.timeout(45_000)
      });
      if (!response.ok) throw new Error(`Transcription failed with status ${response.status}.`);
      const result = await response.json() as { text?: string };
      const text = result.text?.trim();
      if (!text) throw new Error("Transcription returned no text.");
      return text;
    }
  };
};
