import { Controller, Get, Header } from "@nestjs/common";

export function getTokyoCalendarYear(date = new Date()): number {
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(date);
  return Number(year);
}

@Controller("system")
export class SystemInfoController {
  @Get("info")
  @Header("Cache-Control", "public, max-age=300")
  info() {
    return { year: getTokyoCalendarYear() };
  }
}
