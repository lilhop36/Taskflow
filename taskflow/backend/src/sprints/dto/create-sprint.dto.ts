import {
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSprintDto {
  @IsNotEmpty({ message: 'Sprint name is required' })
  @IsString({ message: 'Sprint name must be a string' })
  @MaxLength(100, { message: 'Sprint name must not exceed 100 characters' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Sprint goal must be a string' })
  @MaxLength(500, { message: 'Sprint goal must not exceed 500 characters' })
  goal?: string;

  @IsNotEmpty({ message: 'Project is required' })
  @IsMongoId({ message: 'Project must be a valid MongoDB ID' })
  project: string;

  @IsNotEmpty({ message: 'Start date is required' })
  @IsDateString({}, { message: 'Start date must be a valid date' })
  startDate: string;

  @IsNotEmpty({ message: 'End date is required' })
  @IsDateString({}, { message: 'End date must be a valid date' })
  endDate: string;
}
