import type { GoalflowBackup } from './storage';

export interface EncryptedGoalflowBackup {
  format: 'goalflow-encrypted-backup';
  formatVersion: 1;
  cipher: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
};

const fromBase64 = (encoded: string): Uint8Array => {
  const binary = atob(encoded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

const deriveKey = async (password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptBackup = async (backup: GoalflowBackup, password: string): Promise<EncryptedGoalflowBackup> => {
  if (password.length < 12) throw new Error('Use a backup password with at least 12 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 310_000;
  const key = await deriveKey(password, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(backup)));
  return {
    format: 'goalflow-encrypted-backup',
    formatVersion: 1,
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
};

export const decryptBackup = async (encrypted: EncryptedGoalflowBackup, password: string): Promise<GoalflowBackup> => {
  if (encrypted.format !== 'goalflow-encrypted-backup' || encrypted.formatVersion !== 1) throw new Error('Unsupported encrypted backup format.');
  try {
    const salt = fromBase64(encrypted.salt);
    const iv = fromBase64(encrypted.iv);
    const key = await deriveKey(password, salt, encrypted.iterations);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromBase64(encrypted.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext)) as GoalflowBackup;
  } catch {
    throw new Error('The backup password is incorrect or the file is damaged.');
  }
};

export const isEncryptedBackup = (value: unknown): value is EncryptedGoalflowBackup =>
  Boolean(value && typeof value === 'object' && (value as EncryptedGoalflowBackup).format === 'goalflow-encrypted-backup');
