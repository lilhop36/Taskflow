import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { refId } from '../../common/ref-id';

/**
 * Stable ref-id surface on Project documents (populated or raw ObjectId).
 * `ownerId` / `memberIds` resolve the owner and members refs to id strings
 * regardless of whether the repository populated them — the seam that fixes
 * the runtime `toString()`-on-populated-doc bug.
 */
export interface ProjectDocumentRefs {
  ownerId: string | null;
  memberIds: string[];
}

export type ProjectDocument = HydratedDocument<Project> & ProjectDocumentRefs;

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

ProjectSchema.virtual('ownerId').get(function (this: ProjectDocument) {
  return refId(this.owner);
});

ProjectSchema.virtual('memberIds').get(function (this: ProjectDocument) {
  return this.members
    .map((member) => refId(member))
    .filter((id): id is string => id !== null);
});
