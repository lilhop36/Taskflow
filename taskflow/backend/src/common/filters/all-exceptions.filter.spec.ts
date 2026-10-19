import { NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * Unit Tests — AllExceptionsFilter
 *
 * Maps Mongoose CastError/ValidationError and BSONError to clean 400s
 * instead of raw 500s; HttpExceptions keep their own status codes.
 */
describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  // Minimal mock of an Express response.
  const makeResponse = () => {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    return res;
  };

  const makeHost = (res: ReturnType<typeof makeResponse>) =>
    ({
      switchToHttp: () => ({
        getResponse: () => res,
      }),
    }) as any;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('should map a Mongoose CastError to a clean 400', () => {
    const res = makeResponse();
    const castError = Object.assign(new Error('Cast to ObjectId failed'), {
      name: 'CastError',
      path: 'project',
    });

    filter.catch(castError, makeHost(res));

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      message: 'Invalid value for field "project"',
      error: 'Bad Request',
    });
  });

  it('should map a CastError without a path to a generic message', () => {
    const res = makeResponse();
    const castError = Object.assign(new Error('Cast failed'), {
      name: 'CastError',
    });

    filter.catch(castError, makeHost(res));

    expect(res.statusCode).toBe(400);
    expect((res.body as any).message).toBe('Invalid identifier format');
  });

  it('should map a Mongoose ValidationError to a 400 with field messages', () => {
    const res = makeResponse();
    const validationError = Object.assign(new Error('Validation failed'), {
      name: 'ValidationError',
      errors: {
        title: { message: 'Title is required' },
        dueDate: { message: 'Due date is invalid' },
      },
    });

    filter.catch(validationError, makeHost(res));

    expect(res.statusCode).toBe(400);
    expect((res.body as any).message).toBe(
      'Title is required; Due date is invalid',
    );
  });

  it('should map a BSONError to a 400', () => {
    const res = makeResponse();
    const bsonError = Object.assign(
      new Error('input must be a 24 character hex string'),
      {
        name: 'BSONError',
      },
    );

    filter.catch(bsonError, makeHost(res));

    expect(res.statusCode).toBe(400);
    expect((res.body as any).message).toBe('Invalid identifier format');
  });

  it('should pass HttpException responses through unchanged', () => {
    const res = makeResponse();

    filter.catch(new NotFoundException('Widget not found'), makeHost(res));

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      message: 'Widget not found',
      error: 'Not Found',
    });
  });

  it('should return a sanitized 500 for unknown errors (no internals leaked)', () => {
    const res = makeResponse();
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    filter.catch(new Error('SENSITIVE_INTERNAL_DETAILS'), makeHost(res));

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(JSON.stringify(res.body)).not.toContain(
      'SENSITIVE_INTERNAL_DETAILS',
    );
    consoleSpy.mockRestore();
  });

  it('should handle non-object exceptions (e.g. thrown strings)', () => {
    const res = makeResponse();

    filter.catch('boom', makeHost(res));

    expect(res.statusCode).toBe(500);
  });
});
