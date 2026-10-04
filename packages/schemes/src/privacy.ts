/**
 * The portal never asks for or stores an Aadhaar number. If a person types a 12 digit number
 * (with or without spaces or dashes) into a free-text field, the form refuses it.
 */
export function looksLikeAadhaar(text: string): boolean {
  return /(?<!\d)(?:\d[ -]?){11}\d(?!\d)/.test(text);
}
