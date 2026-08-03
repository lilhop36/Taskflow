import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Validates that a route or query parameter is a well-formed MongoDB
 * ObjectId. Throws a 400 BadRequestException for malformed values instead
 * of letting a Mongoose CastError surface as a 500.
 *
 * Optional-safe: `undefined`, `null`, or empty strings pass through so it
 * can be used on optional query parameters (e.g. `?project=…` filters).
 */
@Injectable()
export class ParseMongoIdPipe implements PipeTransform<string | undefined> {
  transform(value: string | undefined): string | undefined {
    if (value === undefined || value === null || value === '') {
      return value;
    }
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid Mongo ID format: "${value}"`);
    }
    return value;
  }
}
