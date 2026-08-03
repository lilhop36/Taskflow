import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationListener } from './listeners/notification.listener';
import { Notification, NotificationSchema } from './schemas/notification.schema';

/**
 * Feature module for user notifications.
 *
 * Uses NestJS EventEmitter for decoupled event handling.
 * The listener is registered here as a provider — it automatically
 * subscribes to events emitted by other modules (Tasks, Comments).
 *
 * SRS: FR-008.1-4
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationListener,
  ],
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
