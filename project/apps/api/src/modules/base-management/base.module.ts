import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { BaseController } from './base.controller';
import { BaseService } from './base.service';

@Module({ imports: [AuthenticationModule], controllers: [BaseController], providers: [BaseService] })
export class BaseModule {}
