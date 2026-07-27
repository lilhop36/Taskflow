import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsRepository } from './projects.repository';
import { ProjectStatus } from './schemas/project.schema';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
  ) {}

  async create(createProjectDto: CreateProjectDto) {
    const project = await this.projectsRepository.create({
      name: createProjectDto.name,
      description: createProjectDto.description,
      startDate: new Date(createProjectDto.startDate),
      endDate: new Date(createProjectDto.endDate),
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
    await this.findById(id);

    const updateData: any = { ...updateProjectDto };
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
}
