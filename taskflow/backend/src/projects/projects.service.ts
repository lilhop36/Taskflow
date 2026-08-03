import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsRepository } from './projects.repository';
import { ProjectStatus } from './schemas/project.schema';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly usersService: UsersService,
  ) {}

  async create(createProjectDto: CreateProjectDto) {
    const startDate = new Date(createProjectDto.startDate);
    const endDate = new Date(createProjectDto.endDate);

    // BR-006: a project's date range must be valid (end on or after start)
    if (endDate < startDate) {
      throw new BadRequestException(
        'Project end date must be on or after the start date',
      );
    }

    // BR-008: the project owner must be a real user with the PM role
    const owner = await this.usersService.findById(createProjectDto.owner);
    if (!owner) {
      throw new NotFoundException('Project owner user not found');
    }
    if (owner.role !== UserRole.PROJECT_MANAGER) {
      throw new BadRequestException(
        'Project owner must be a Project Manager (BR-008)',
      );
    }

    const project = await this.projectsRepository.create({
      name: createProjectDto.name,
      description: createProjectDto.description,
      startDate,
      endDate,
      owner: createProjectDto.owner as any,
      members: (createProjectDto.members ?? []).map((id) => id as any),
    });

    return project.toObject();
  }

  async findAll() {
    const projects = await this.projectsRepository.findAll();
    return projects.map((p) => p.toObject());
  }

  async findById(id: string) {
    const project = await this.projectsRepository.findById(id);
    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }
    return project.toObject();
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    const project = await this.findById(id);

    // BR-006: keep the date range valid when either bound changes.
    // The existing project dates are the fallback for the untouched bound.
    const startDate = updateProjectDto.startDate
      ? new Date(updateProjectDto.startDate)
      : project.startDate;
    const endDate = updateProjectDto.endDate
      ? new Date(updateProjectDto.endDate)
      : project.endDate;
    if (endDate < startDate) {
      throw new BadRequestException(
        'Project end date must be on or after the start date',
      );
    }

    // Defense-in-depth: the DTO no longer carries `status` (archiving is only
    // allowed via the dedicated archive endpoint with its BR-003 guard), but
    // strip it here too so a direct service call can never bypass that rule.
    const updateData: any = { ...updateProjectDto };
    delete updateData.status;
    if (updateProjectDto.startDate) {
      updateData.startDate = new Date(updateProjectDto.startDate);
    }
    if (updateProjectDto.endDate) {
      updateData.endDate = new Date(updateProjectDto.endDate);
    }

    const updated = await this.projectsRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }
    return updated.toObject();
  }

  async archive(id: string) {
    const project = await this.findById(id);

    if (project.status === ProjectStatus.ARCHIVED) {
      throw new BadRequestException('This project is already archived');
    }

    const activeTasks = await this.projectsRepository.countActiveTasks(id);
    if (activeTasks > 0) {
      throw new BadRequestException(
        'Cannot archive a project with active (non-Done) tasks. Complete or reassign all tasks first.',
      );
    }

    const archived = await this.projectsRepository.archive(id);
    if (!archived) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }
    return archived.toObject();
  }

  /**
   * Checks whether a user may access a project's content (tasks/comments).
   *
   * FR-007.2 requires project access for commenting; BR-001 role hierarchy
   * extends that access: Administrators and Project Managers have
   * cross-project visibility (matching RolesGuard), while TeamMembers must
   * be an actual owner/member of the project.
   */
  async isUserMemberOfProject(
    userId: string,
    projectId: string,
    role?: UserRole,
  ): Promise<boolean> {
    if (role === UserRole.ADMIN || role === UserRole.PROJECT_MANAGER) {
      return true;
    }
    return this.projectsRepository.isUserMemberOfProject(userId, projectId);
  }
}
