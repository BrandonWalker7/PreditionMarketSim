import { Module } from '@nestjs/common';
import { StatusController } from './status.controller';
import { SignalingGateway } from './signaling.gateway';

@Module({
  controllers: [StatusController],
  providers: [SignalingGateway],
})
export class AppModule {}
