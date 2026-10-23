import { hash, verify } from '@node-rs/argon2';
import { generatePassword } from '@wx/mqtt-admin';

// argon2id with the OWASP minimum parameters (19 MiB memory, 2 iterations).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * Spends the same time as a real verification when the e-mail does not exist, so response
 * times do not reveal which e-mails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('wx-dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}

/** Policy beyond the minimum length enforced by the request schema. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.toLowerCase() === email.toLowerCase()) return 'A senha não pode ser igual ao e-mail';
  if (/^(.)\1+$/.test(password)) return 'A senha não pode ser um único caractere repetido';
  return null;
}

/** Temporary password handed to the user by an admin; must be changed on first login. */
export const temporaryPassword = (): string => generatePassword(16);
