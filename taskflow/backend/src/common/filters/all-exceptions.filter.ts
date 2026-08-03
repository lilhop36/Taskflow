import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Global exception filter.
 *
 * Normalizes errors that Nest's default filter renders as raw 500s:
 * - Mongoose `CastError` (e.g. an invalid ObjectId reaching a query) → 400
 * - Mongoose `ValidationError` (schema-level validation) → 400
 * - BSON `BSONError` (e.g. `new Types.ObjectId('not-an-id')`) → 400
 *
 * `HttpException`s (404, 403, 401, …) keep their own status codes, and
 * unknown errors return a sanitized 500 that never leaks internals.
 *
 * Registered globally via APP_FILTER in AppModule.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Preserve Nest's own HTTP exceptions (BadRequest, NotFound, Forbidden…)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const body =
        typeof res === 'string'
          ? { statusCode: status, message: res }
          : res;
      response.status(status).json(body);
      return;
    }

    const mapped = this.mapMongooseError(exception);
    if (mapped) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: mapped,
        error: 'Bad Request',
      });
      return;
    }

    // Unknown error — log and return a sanitized 500.
    console.error('Unhandled exception:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }

  /**
   * Maps Mongoose/BSON errors to a clean client message, or null when the
   * exception is not one of the known types.
   */
  private mapMongooseError(exception: unknown): string | null {
    if (!exception || typeof exception !== 'object') return null;
    const name = (exception as { name?: unknown }).name;

    if (name === 'CastError') {
      const path = (exception as { path?: unknown }).path;
      return path
        ? `Invalid value for field "${path}"`
        : 'Invalid identifier format';
    }

    if (name === 'ValidationError') {
      const errors = (exception as { errors?: Record<string, { message?: string }> })
        .errors;
      if (errors && Object.keys(errors).length > 0) {
        return Object.values(errors)
          .map((e) => e.message)
          .join('; ');
      }
      return 'Validation failed';
    }

    if (name === 'BSONError' || name === 'BSONTypeError') {
      return 'Invalid identifier format';
    }

    return null;
  }
}
