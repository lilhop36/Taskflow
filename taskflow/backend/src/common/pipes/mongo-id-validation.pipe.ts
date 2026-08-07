import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

/**
 * Validates MongoDB ObjectId format in route parameters and query parameters.
 * Prevents 500 errors from invalid MongoDB IDs and returns proper 400 errors.
 */
@Injectable()
export class MongoIdValidationPipe implements PipeTransform<string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!isValidObjectId(value)) {
      throw new BadRequestException(
        `Invalid ${metadata.type === 'param' ? 'parameter' : 'query'} format: ${value} is not a valid MongoDB ObjectId`,
      );
    }
    return value;
  }
}

/**
 * Optional MongoDB ID validation pipe - allows null/undefined values
 */
@Injectable()
export class OptionalMongoIdValidationPipe implements PipeTransform<string> {
  transform(value: string, metadata: ArgumentMetadata): string | undefined {
    if (!value) return undefined;
    if (!isValidObjectId(value)) {
      throw new BadRequestException(
        `Invalid ${metadata.type === 'param' ? 'parameter' : 'query'} format: ${value} is not a valid MongoDB ObjectId`,
      );
    }
    return value;
  }
}
