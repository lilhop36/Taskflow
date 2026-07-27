import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * Controller handling HTTP requests for the Users domain.
 *
 * Responsibilities:
 * - Define HTTP routes and verbs under the 'users' resource path (/api/users).
 * - Extract and pass request data (body parameters, route params) to UsersService.
 * - Delegate all business logic and validation handling to underlying layers.
 */
@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * FR-002.1: Create a new user profile.
   * Exposes POST /api/users
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  /**
   * FR-002: Retrieve all user accounts.
   * Exposes GET /api/users
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    return this.usersService.findAll();
  }

  /**
   * Retrieve a single user profile by ID.
   * Exposes GET /api/users/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  /**
   * FR-002.2: Update existing user profile details.
   * Exposes PATCH /api/users/:id
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * FR-002.3: Deactivate a user account.
   * Exposes PATCH /api/users/:id/deactivate
   */
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }
}
