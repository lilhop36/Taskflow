import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Custom Parameter Decorator: @Project()
 *
 * Reads the Project document attached to the request by ProjectAccessGuard.
 * The guard loads the project (404 if missing) and verifies the caller is
 * a member (Admins/PMs bypass via BR-001), so handlers can trust
 * `request.project` without re-fetching or re-checking access.
 *
 * Usage:
 *   @UseGuards(ProjectAccessGuard)
 *   async findOne(@Project() project: any) { ... project.name ... }
 */
export const Project = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{
      project?: unknown;
    }>();
    return request.project;
  },
);
