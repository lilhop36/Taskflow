import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * UpdateProjectDto — intentionally has NO `status` field.
 *
 * A project's lifecycle status must only change via the dedicated archive
 * endpoint (`PATCH /projects/:id/archive`), which enforces BR-003
 * (cannot archive while active tasks exist). Allowing `status` here would
 * let a client bypass that guard by PATCHing `{ status: 'Archived' }`
 * directly — `forbidNonWhitelisted` rejects any `status` key with a 400.
 */
export class UpdateProjectDto {
  @IsOptional()
  @IsString({ message: 'Project name must be a string' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Project description must be a string' })
  description?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid date' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid date' })
  endDate?: string;

  @IsOptional()
  @IsArray({ message: 'Members must be an array' })
  @IsMongoId({ each: true, message: 'Each member must be a valid Mongo ID' })
  members?: string[];

  @IsOptional()
  @IsArray({ message: 'Teams must be an array' })
  @IsMongoId({ each: true, message: 'Each team must be a valid Mongo ID' })
  teams?: string[];
}
