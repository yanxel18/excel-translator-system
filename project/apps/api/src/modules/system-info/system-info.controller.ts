import { Controller, Get, Header } from "@nestjs/common";
import { ApplicationSettingsService } from "../application-settings/application-settings.service";

export function getTokyoCalendarYear(date = new Date()): number {
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(date);
  return Number(year);
}

@Controller("system")
export class SystemInfoController {
  constructor(private readonly settings: ApplicationSettingsService) {}

  @Get("info")
  @Header("Cache-Control", "no-store")
  async info() {
    const settings = await this.settings.getSettings();
    return {
      year: getTokyoCalendarYear(),
      maxUploadSizeMb: settings.maxUploadSizeMb,
    };
  }
}
