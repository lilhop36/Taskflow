import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ProjectDocument = HydratedDocument<Project>;

export enum ProjectStatus {
  ACTIVE = 'Active',
  ARCHIVED = 'Archived',
}

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, enum: ProjectStatus, default: ProjectStatus.ACTIVE })
  status: ProjectStatus;

  @Prop({ required: true, type: SchemaTypes.ObjectId, ref: 'User' })
  owner: Types.ObjectId;

  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: 'User' }], default: [] })
  members: Types.ObjectId[];

  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: 'Team' }], default: [] })
  teams: Types.ObjectId[];
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
