import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Comment, CommentSchema } from '../../comments/schemas/comment.schema';
import { Notification, NotificationSchema } from '../../notifications/schemas/notification.schema';
import { Project, ProjectSchema } from '../../projects/schemas/project.schema';
import { Task, TaskSchema } from '../../tasks/schemas/task.schema';
import { Team, TeamSchema } from '../../teams/schemas/team.schema';
import { User, UserSchema } from '../../users/schemas/user.schema';

const models = [
  { name: User.name, schema: UserSchema },
  { name: Project.name, schema: ProjectSchema },
  { name: Task.name, schema: TaskSchema },
  { name: Comment.name, schema: CommentSchema },
  { name: Notification.name, schema: NotificationSchema },
  { name: Team.name, schema: TeamSchema },
];

@Global()
@Module({
  imports: [
    MongooseModule.forFeature(models),
  ],
  exports: [MongooseModule],
})
export class DatabaseModelsModule {}
