import { randomInt } from 'node:crypto';

// No look-alike characters (0/O, 1/l/I): the password is typed into the station's setup portal.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Random password for MQTT clients (24 chars ≈ 139 bits of entropy). */
export function generatePassword(length = 24): string {
  let password = '';
  for (let i = 0; i < length; i++) password += ALPHABET[randomInt(ALPHABET.length)];
  return password;
}
