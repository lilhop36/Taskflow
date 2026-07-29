import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsRepository } from './teams.repository';
import { TeamsService } from './teams.service';

@Module({
  imports: [],
  controllers: [TeamsController],
  providers: [TeamsService, TeamsRepository],
  exports: [TeamsService, TeamsRepository],
})
export class TeamsModule {}