import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationListener } from './listeners/notification.listener';

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
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationListener,
  ],
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
