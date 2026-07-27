import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for creating a new comment on a task.
 *
 * Only `content` is required because `task` and `author` are resolved
 * from the route parameter and authenticated user respectively.
 * (The task ID comes from the URL, the author from the JWT token.)
 *
 * SRS: FR-007.1 — plain text comments
 * SRS: FR-007.2 — authorized users can post
 */
export class CreateCommentDto {
  /**
   * The plain-text comment body. No HTML, no markdown — just text.
   * This matches the SRS requirement for "text-only communication thread".
   */
  @IsNotEmpty({ message: 'Comment content is required' })
  @IsString({ message: 'Comment must be a string' })
  content: string;
}
