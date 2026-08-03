import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateProjectDto {
  @IsNotEmpty({ message: 'Project name is required' })
  @IsString({ message: 'Project name must be a string' })
  name: string;

  @IsNotEmpty({ message: 'Project description is required' })
  @IsString({ message: 'Project description must be a string' })
  description: string;

  @IsNotEmpty({ message: 'Start date is required' })
  @IsDateString({}, { message: 'Start date must be a valid date' })
  startDate: string;

  @IsNotEmpty({ message: 'End date is required' })
  @IsDateString({}, { message: 'End date must be a valid date' })
  endDate: string;

  @IsNotEmpty({ message: 'Project owner is required' })
  @IsMongoId({ message: 'Owner must be a valid Mongo ID' })
  owner: string;

  @IsOptional()
  @IsArray({ message: 'Members must be an array' })
  @IsMongoId({ each: true, message: 'Each member must be a valid Mongo ID' })
  members?: string[];

  @IsOptional()
  @IsArray({ message: 'Teams must be an array' })
  @IsMongoId({ each: true, message: 'Each team must be a valid Mongo ID' })
  teams?: string[];
}
