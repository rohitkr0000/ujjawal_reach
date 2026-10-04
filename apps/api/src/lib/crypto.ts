import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const uuid = (): string => randomUUID();

export const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// No 0/O/1/I so a card id can be read out over the phone.
const CARD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** "UR-7K3M9QXD": the id printed on a saved card. */
export function randomCardId(): string {
  const bytes = randomBytes(8);
  let s = '';
  for (const b of bytes) s += CARD_ALPHABET[b % CARD_ALPHABET.length];
  return `UR-${s}`;
}

/** 98XXXXXX29 */
export function maskMobile(m: string): string {
  return m.length === 10 ? `${m.slice(0, 2)}XXXXXX${m.slice(8)}` : 'XXXXXXXXXX';
}
