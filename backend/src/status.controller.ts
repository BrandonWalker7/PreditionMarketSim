import { Controller, Get } from '@nestjs/common';

@Controller()
export class StatusController {
  @Get()
  status() {
    return { service: 'master-better-signaling', status: 'ok' };
  }
}
