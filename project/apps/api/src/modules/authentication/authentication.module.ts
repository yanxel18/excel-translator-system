import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthenticationService } from './authentication.service';
import { AuthenticationController } from './authentication.controller';
import { LocalStrategy } from './local.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { KeycloakVerifierService } from './keycloak-verifier.service';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [
    PersistenceModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '1h' },
    }),
  ],
  controllers: [AuthenticationController],
  providers: [AuthenticationService, LocalStrategy, JwtAuthGuard, KeycloakVerifierService],
  exports: [AuthenticationService, JwtAuthGuard, JwtModule],
})
export class AuthenticationModule {}
