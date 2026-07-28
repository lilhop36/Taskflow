import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateCommentDto {
  @IsNotEmpty({ message: 'Comment content is required' })
  @IsString({ message: 'Comment must be a string' })
  content: string;
}
