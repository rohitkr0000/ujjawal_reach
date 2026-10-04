import { describe, expect, it } from 'vitest';
import { looksLikeAadhaar } from '../src';

describe('looksLikeAadhaar', () => {
  it.each(['234567890123', '2345 6789 0123', '2345-6789-0123', 'my id is 234567890123 ok'])('flags %s', (v) => {
    expect(looksLikeAadhaar(v)).toBe(true);
  });
  it.each(['65', 'Block 12, Sector 4', '110059', '9876543210', '12345678901', '1234567890123', 'Flat 101'])('allows %s', (v) => {
    expect(looksLikeAadhaar(v)).toBe(false);
  });
});
