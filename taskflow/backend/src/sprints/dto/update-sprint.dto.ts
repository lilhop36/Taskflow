import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SprintStatus } from '../schemas/sprint.schema';

export class UpdateSprintDto {
  @IsOptional()
  @IsString({ message: 'Sprint name must be a string' })
  @MaxLength(100, { message: 'Sprint name must not exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Sprint goal must be a string' })
  @MaxLength(500, { message: 'Sprint goal must not exceed 500 characters' })
  goal?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid date' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid date' })
  endDate?: string;

  @IsOptional()
  @IsEnum(SprintStatus, { message: 'Invalid sprint status' })
  status?: SprintStatus;
}
