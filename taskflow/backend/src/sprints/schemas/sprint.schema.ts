import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SprintDocument = HydratedDocument<Sprint>;

export enum SprintStatus {
  PLANNED = 'Planned',
  ACTIVE = 'Active',
  COMPLETED = 'Completed',
}

@Schema({ timestamps: true })
export class Sprint {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  goal: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Project' })
  project: Types.ObjectId;

  @Prop({
    required: true,
    enum: SprintStatus,
    default: SprintStatus.PLANNED,
  })
  status: SprintStatus;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const SprintSchema = SchemaFactory.createForClass(Sprint);

// A project can only have one Active sprint at a time
SprintSchema.index({ project: 1, status: 1 });
// Speed up listing sprints of a project
SprintSchema.index({ project: 1, createdAt: -1 });
