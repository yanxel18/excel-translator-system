import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { AuthenticationService } from "./authentication.service";
import { KeycloakVerifierService } from "./keycloak-verifier.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { AdminAuthGuard } from "./admin-auth.guard";
import { strictObject } from "../../common/management-validation";

function credential(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.length || value.length > maxLength)
    throw new BadRequestException(`Invalid ${name}.`);
  return value;
}

@Controller("auth")
export class AuthenticationController {
  constructor(
    private readonly authService: AuthenticationService,
    private readonly keycloak: KeycloakVerifierService,
  ) {}

  @Get("oidc/config")
  oidcConfig() {
    return this.keycloak.getPublicConfig();
  }

  @Get("oidc/settings")
  @UseGuards(JwtAuthGuard, AdminAuthGuard)
  oidcSettings() {
    return this.keycloak.getSettings();
  }

  @Patch("oidc/settings")
  @UseGuards(JwtAuthGuard, AdminAuthGuard)
  updateOidcSettings(@Body() body: unknown, @Req() req: Request) {
    const settings = strictObject(body, [
      "mode",
      "enabled",
      "keycloakUrl",
      "realm",
      "clientId",
      "issuerUrl",
      "requiredGroup",
    ]);
    if (settings.mode === undefined && settings.enabled === undefined) {
      throw new BadRequestException("Authentication mode is required.");
    }
    if (
      settings.enabled !== undefined &&
      typeof settings.enabled !== "boolean"
    ) {
      throw new BadRequestException("OIDC enabled must be true or false.");
    }
    for (const [key, max] of Object.entries({
      mode: 16,
      keycloakUrl: 2048,
      realm: 128,
      clientId: 256,
      issuerUrl: 2048,
      requiredGroup: 512,
    })) {
      const value = settings[key];
      if (value != null && (typeof value !== "string" || value.length > max))
        throw new BadRequestException(`Invalid ${key}.`);
    }
    return this.keycloak.updateSettings(settings, (req as any).user?.userId);
  }

  @Post("login")
  async login(@Body() body: unknown) {
    const credentials = strictObject(body, ["username", "password"]);
    const user = await this.authService.validateUser(
      credential(credentials.username, "Username", 1024),
      credential(credentials.password, "Password", 1024),
    );
    if (!user) throw new UnauthorizedException("Invalid username or password.");
    return this.authService.login(user);
  }

  @Post("oidc/exchange")
  async exchangeKeycloakToken(@Body() body: unknown) {
    const payload = strictObject(body, ["accessToken"]);
    return this.authService.exchangeKeycloakToken(
      credential(payload.accessToken, "Access token", 32768),
    );
  }

  @Post("verify")
  async verifySession(@Body() body: unknown) {
    const payload = strictObject(body, ["token"]);
    const token = credential(payload.token, "Token", 32768);
    try {
      const decoded = await this.authService.verifySession(token);
      return { valid: true, user: decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  @Post("logout") logout() {
    return { success: true };
  }

  @Post("password/change")
  @UseGuards(JwtAuthGuard)
  changeOwnPassword(@Req() req: Request, @Body() body: unknown) {
    return this.authService.changeOwnPassword((req as any).user?.userId, body);
  }
}
