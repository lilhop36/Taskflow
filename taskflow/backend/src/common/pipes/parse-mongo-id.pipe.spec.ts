import { BadRequestException } from '@nestjs/common';
import { ParseMongoIdPipe } from './parse-mongo-id.pipe';

/**
 * Unit Tests — ParseMongoIdPipe
 *
 * Rejects malformed Mongo ObjectIds with a 400 instead of letting them
 * reach Mongoose and surface as a CastError 500.
 */
describe('ParseMongoIdPipe', () => {
  const pipe = new ParseMongoIdPipe();
  const VALID_ID = '507f1f77bcf86cd799439011';

  it('should pass through a valid ObjectId unchanged', () => {
    expect(pipe.transform(VALID_ID)).toBe(VALID_ID);
  });

  it('should throw BadRequestException for a malformed id', () => {
    expect(() => pipe.transform('not-an-id')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for a too-short hex string', () => {
    expect(() => pipe.transform('abc123')).toThrow(BadRequestException);
  });

  it('should pass an empty string through (optional query param treated as absent)', () => {
    expect(pipe.transform('')).toBe('');
  });

  it('should pass undefined through (optional query params)', () => {
    expect(pipe.transform(undefined)).toBeUndefined();
  });

  it('should pass null through', () => {
    expect(pipe.transform(null as any)).toBeNull();
  });
});
