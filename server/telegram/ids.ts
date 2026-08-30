import { v5 as uuidv5 } from "uuid";

export const TELEGRAM_MUTATION_NAMESPACE = "af6e79e1-c616-4c61-bc96-7207d02c9a95";

export const mutationIdForUpdate = (updateId: number, operation: string): string =>
  uuidv5(`${updateId}:${operation}`, TELEGRAM_MUTATION_NAMESPACE);
