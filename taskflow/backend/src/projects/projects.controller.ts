import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Project } from '../common/decorators/project.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { UserRole } from '../users/schemas/user.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

/** Shape of request.user needed for read scoping (BR-001). */
type UserContext = { _id: { toString(): string }; role?: UserRole };

/** The project shape ProjectAccessGuard attaches to the request. */
type ProjectView = Awaited<ReturnType<ProjectsService['findById']>>;

@Roles(UserRole.PROJECT_MANAGER, UserRole.ADMIN)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(createProjectDto);
  }

  /**
   * FR-003 read visibility: Admins/PMs see all projects; Team Members see
   * only the projects they own or belong to (scoped in ProjectsService).
   */
  @Get()
  @Roles(UserRole.TEAM_MEMBER)
  @HttpCode(HttpStatus.OK)
  async findAll(@CurrentUser() user?: UserContext) {
    return this.projectsService.findAllForUser(user);
  }

  @Get(':id')
  @Roles(UserRole.TEAM_MEMBER)
  @UseGuards(ProjectAccessGuard)
  @HttpCode(HttpStatus.OK)
  findOne(@Project() project: ProjectView) {
    // ProjectAccessGuard already loaded the project (plain object via the
    // service) and verified the caller may view it (BR-001 / membership).
    return project;
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, updateProjectDto);
  }

  @Patch(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id', ParseMongoIdPipe) id: string) {
    return this.projectsService.archive(id);
  }
}
