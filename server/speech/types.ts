export interface SpeechProvider {
  readonly name: string;
  transcribe(input: { audio: Uint8Array; mimeType: string; fileName: string }): Promise<string>;
}
