import { Body, Controller, Get, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import { KeycloakVerifierService } from './keycloak-verifier.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminAuthGuard } from './admin-auth.guard';

@Controller('auth')
export class AuthenticationController {
  constructor(private readonly authService: AuthenticationService, private readonly keycloak: KeycloakVerifierService) {}

  @Get('oidc/config')
  oidcConfig() { return this.keycloak.getPublicConfig(); }

  @Get('oidc/settings')
  @UseGuards(JwtAuthGuard, AdminAuthGuard)
  oidcSettings() { return this.keycloak.getSettings(); }

  @Patch('oidc/settings')
  @UseGuards(JwtAuthGuard, AdminAuthGuard)
  updateOidcSettings(@Body() settings: Record<string, unknown>) { return this.keycloak.updateSettings(settings); }

  @Post('login')
  async login(@Body() credentials: { username: string; password: string }) {
    const user = await this.authService.validateUser(credentials?.username, credentials?.password);
    if (!user) throw new UnauthorizedException('Invalid username or password.');
    return this.authService.login(user);
  }

  @Post('oidc/exchange')
  async exchangeKeycloakToken(@Body() payload: { accessToken: string }) {
    return this.authService.exchangeKeycloakToken(payload?.accessToken);
  }

  @Post('verify')
  async verifySession(@Body() payload: { token: string }) {
    try {
      const decoded = await this.authService.verifySession(payload.token);
      return { valid: true, user: decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  @Post('logout') logout() { return { success: true }; }
}
