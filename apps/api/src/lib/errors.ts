/** An error that is safe to show to the caller. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, message, 'bad_request', details);
export const unauthorized = (message = 'Please log in again') => new AppError(401, message, 'unauthorized');
export const forbidden = (message = 'You are not allowed to do this') =>
  new AppError(403, message, 'forbidden');
export const notFound = (message = 'Not found') => new AppError(404, message, 'not_found');
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, message, 'conflict', details);
export const tooMany = (message = 'Too many attempts. Please try again later.') =>
  new AppError(429, message, 'too_many_requests');
