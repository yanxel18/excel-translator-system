import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { strictObject } from "../../common/management-validation";
import { AdminAuthGuard } from "../authentication/admin-auth.guard";
import { JwtAuthGuard } from "../authentication/jwt-auth.guard";
import {
  MAX_MAX_CONCURRENT_TRANSLATIONS,
  MAX_MAX_UPLOAD_SIZE_MB,
  MIN_MAX_CONCURRENT_TRANSLATIONS,
  MIN_MAX_UPLOAD_SIZE_MB,
} from "./application-settings.constants";
import {
  ApplicationSettings,
  ApplicationSettingsService,
} from "./application-settings.service";

@Controller("admin/application-settings")
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class ApplicationSettingsController {
  constructor(private readonly settings: ApplicationSettingsService) {}

  @Get()
  getSettings() {
    return this.settings.getSettings();
  }

  @Patch()
  update(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<ApplicationSettings> {
    const input = strictObject(body, [
      "maxUploadSizeMb",
      "maxConcurrentTranslations",
    ]);
    const update: Partial<ApplicationSettings> = {};
    if ("maxUploadSizeMb" in input) {
      const value = input.maxUploadSizeMb;
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < MIN_MAX_UPLOAD_SIZE_MB ||
        value > MAX_MAX_UPLOAD_SIZE_MB
      )
        throw new BadRequestException(
          `Maximum workbook size must be an integer from ${MIN_MAX_UPLOAD_SIZE_MB} to ${MAX_MAX_UPLOAD_SIZE_MB} MB.`,
        );
      update.maxUploadSizeMb = value;
    }
    if ("maxConcurrentTranslations" in input) {
      const value = input.maxConcurrentTranslations;
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < MIN_MAX_CONCURRENT_TRANSLATIONS ||
        value > MAX_MAX_CONCURRENT_TRANSLATIONS
      )
        throw new BadRequestException(
          `Concurrent translations must be an integer from ${MIN_MAX_CONCURRENT_TRANSLATIONS} to ${MAX_MAX_CONCURRENT_TRANSLATIONS}.`,
        );
      update.maxConcurrentTranslations = value;
    }
    if (!Object.keys(update).length)
      throw new BadRequestException("At least one setting is required.");

    const actorId = (request as any).user?.userId;
    return this.settings.updateSettings(
      update,
      typeof actorId === "string" ? actorId : undefined,
    );
  }
}
