import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from './errors.js';

function clientStatusCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error && 'statusCode' in error) {
    const code = Number((error as { statusCode: unknown }).statusCode);
    if (Number.isFinite(code) && code >= 400 && code < 500) {
      return code;
    }
  }
  return undefined;
}

export function serializeError(error: unknown): {
  statusCode: number;
  body: { error: { code: string; message: string; details?: unknown } };
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: { error: { code: error.code, message: error.message } },
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return {
      statusCode: 409,
      body: {
        error: {
          code: 'CONFLICT',
          message: 'That record already exists',
        },
      },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2022' || error.code === 'P2021')) {
    return {
      statusCode: 503,
      body: {
        error: {
          code: 'ASSESSMENT_STORAGE_UNAVAILABLE',
          message: 'We could not save this right now. Your completed work has been preserved. Please try again.',
        },
      },
    };
  }

  const statusCode = clientStatusCode(error);
  if (statusCode) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return {
      statusCode,
      body: { error: { code: 'REQUEST_ERROR', message } },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error',
      },
    },
  };
}
