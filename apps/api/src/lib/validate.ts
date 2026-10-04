import type { ZodType } from 'zod';
import { badRequest } from './errors';

/** Parse request data with a zod schema. Failures become a 400 with a readable message. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const path = issue && issue.path.length ? `${issue.path.join('.')}: ` : '';
  throw badRequest(`${path}${issue?.message ?? 'Invalid request'}`);
}

/** Remove control characters and collapse spaces in free text typed by a person. */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
