import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { UserRole } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsRepository } from './projects.repository';
import { Project, ProjectStatus } from './schemas/project.schema';
import { VisibilityPolicyService } from './visibility-policy.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly usersService: UsersService,
    private readonly visibilityPolicy: VisibilityPolicyService,
  ) {}

  async create(createProjectDto: CreateProjectDto): Promise<Project> {
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
      owner: new Types.ObjectId(createProjectDto.owner),
      members: (createProjectDto.members ?? []).map(
        (id) => new Types.ObjectId(id),
      ),
    });

    return project.toObject();
  }

  async findAll(): Promise<Project[]> {
    const projects = await this.projectsRepository.findAll();
    return projects.map((p) => p.toObject() as Project);
  }

  /**
   * List projects scoped to what the caller may see:
   * - Administrators / Project Managers (BR-001 hierarchy) see all projects.
   * - Team Members see only the projects they own or are listed as a member of.
   * - A missing user fails closed — production routes always populate
   *   request.user via the global JwtAuthGuard.
   */
  async findAllForUser(user?: {
    _id: { toString(): string };
    role?: UserRole;
  }) {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    // BR-001 hierarchy: Admins/PMs see everything; Team Members only their
    // own projects (BR-003). Decision delegated to the single visibility
    // policy — the same rule every read endpoint uses.
    if (this.visibilityPolicy.isFullVisibility(user.role)) {
      return this.findAll();
    }
    const projects = await this.projectsRepository.findByMember(
      user._id.toString(),
    );
    return projects.map((p) => p.toObject());
  }

  async findById(id: string): Promise<Project> {
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
    // Plain-object update payload: the DTO carries ISO date strings for the
    // bounds, so they are converted to Date below.
    const updateData = { ...updateProjectDto } as Partial<Project>;
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
    return updated.toObject() as Project;
  }

  async archive(id: string): Promise<Project> {
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
}
