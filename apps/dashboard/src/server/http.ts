import { z } from 'zod';

// Error messages are Portuguese: the SPA shows them to the user as they are.
z.config(z.locales.pt());

/** An error with an HTTP status and a stable code the SPA can react to. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (message = 'Recurso não encontrado') =>
  new HttpError(404, 'NOT_FOUND', message);
export const forbidden = (message = 'Acesso negado') => new HttpError(403, 'FORBIDDEN', message);
export const conflict = (message: string, code = 'CONFLICT') => new HttpError(409, code, message);
export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);

/** Validates input with zod; failures become a 400 with the problem of each field. */
export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const { formErrors, fieldErrors } = z.flattenError(result.error);
    throw new HttpError(400, 'VALIDATION', 'Dados inválidos', { formErrors, fieldErrors });
  }
  return result.data;
}
