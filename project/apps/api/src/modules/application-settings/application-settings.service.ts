import { BadRequestException, Injectable } from "@nestjs/common";
import { getMaxConcurrentTranslations } from "../../config/translation-concurrency";
import { PrismaService } from "../persistence/prisma.service";
import {
  APPLICATION_SETTINGS_ID,
  DEFAULT_MAX_UPLOAD_SIZE_MB,
} from "./application-settings.constants";

export interface ApplicationSettings {
  maxUploadSizeMb: number;
  maxConcurrentTranslations: number;
}

@Injectable()
export class ApplicationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<ApplicationSettings> {
    return this.prisma.applicationSettings.upsert({
      where: { id: APPLICATION_SETTINGS_ID },
      create: {
        id: APPLICATION_SETTINGS_ID,
        maxUploadSizeMb: DEFAULT_MAX_UPLOAD_SIZE_MB,
        maxConcurrentTranslations: getMaxConcurrentTranslations(
          process.env.MAX_CONCURRENT_TRANSLATIONS,
        ),
      },
      update: {},
      select: {
        maxUploadSizeMb: true,
        maxConcurrentTranslations: true,
      },
    });
  }

  async updateSettings(
    input: Partial<ApplicationSettings>,
    actorId?: string,
  ): Promise<ApplicationSettings> {
    const current = await this.getSettings();
    const data: Partial<ApplicationSettings> = {};
    for (const key of ["maxUploadSizeMb", "maxConcurrentTranslations"] as const)
      if (input[key] !== undefined) data[key] = input[key];
    if (!Object.keys(data).length)
      throw new BadRequestException("At least one setting is required.");

    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.applicationSettings.update({
        where: { id: APPLICATION_SETTINGS_ID },
        data,
        select: {
          maxUploadSizeMb: true,
          maxConcurrentTranslations: true,
        },
      });
      await tx.managementAudit.create({
        data: {
          actorId: actorId ?? null,
          action: "UPDATE",
          targetType: "APPLICATION_SETTINGS",
          targetId: APPLICATION_SETTINGS_ID,
          changes: Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
              key,
              {
                before: current[key as keyof ApplicationSettings],
                after: value,
              },
            ]),
          ),
        },
      });
      return saved;
    });
  }
}
