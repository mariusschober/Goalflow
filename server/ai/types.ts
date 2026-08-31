export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateJson(input: { system: string; prompt: string; maxTokens: number }): Promise<{ value: unknown; usage?: { prompt: number; completion: number } }>;
}
