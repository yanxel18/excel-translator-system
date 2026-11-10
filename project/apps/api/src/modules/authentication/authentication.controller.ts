import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthenticationService } from './authentication.service';

@Controller('auth')
export class AuthenticationController {
  constructor(private readonly authService: AuthenticationService) {}

  @Post('login')
  async login(@Body() credentials: { username: string; password: string }) {
    const user = await this.authService.validateUser(credentials?.username, credentials?.password);
    if (!user) throw new UnauthorizedException('Invalid username or password.');
    return this.authService.login(user);
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
