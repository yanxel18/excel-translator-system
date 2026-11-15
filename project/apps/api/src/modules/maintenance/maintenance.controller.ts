import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { strictObject } from "../../common/management-validation";
import { AdminAuthGuard } from "../authentication/admin-auth.guard";
import { JwtAuthGuard } from "../authentication/jwt-auth.guard";
import { MaintenanceScheduleInput, MaintenanceService } from "./maintenance.service";

function parseUtcInstant(value: unknown, label: string): Date {
  if (typeof value !== "string") {
    throw new BadRequestException(
      `${label} must be an RFC 3339 timestamp with an explicit time zone.`,
    );
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) {
    throw new BadRequestException(
      `${label} must be an RFC 3339 timestamp with an explicit time zone.`,
    );
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (daysInMonth ?? 0) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (zone !== "Z" &&
      (zone === "-00:00" ||
        Number(zone.slice(1, 3)) > 23 ||
        Number(zone.slice(4, 6)) > 59))
  ) {
    throw new BadRequestException(`${label} is not a valid timestamp.`);
  }
  const milliseconds = Date.parse(value);
  const instant = new Date(milliseconds);
  if (
    !Number.isFinite(milliseconds) ||
    instant.getUTCFullYear() < 1 ||
    instant.getUTCFullYear() > 9999
  ) {
    throw new BadRequestException(`${label} is not a valid timestamp.`);
  }
  return instant;
}

function parseScheduleInput(value: unknown): MaintenanceScheduleInput {
  const input = strictObject(value, ["enabled", "startsAt", "endsAt"]);
  if (typeof input.enabled !== "boolean") {
    throw new BadRequestException("enabled must be a boolean.");
  }
  const startsAt = parseUtcInstant(input.startsAt, "startsAt");
  const endsAt = parseUtcInstant(input.endsAt, "endsAt");
  if (startsAt.getTime() >= endsAt.getTime()) {
    throw new BadRequestException("endsAt must be later than startsAt.");
  }
  return { enabled: input.enabled, startsAt, endsAt };
}

@Controller("admin/maintenance-schedule")
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class MaintenanceAdminController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  getSchedule() {
    return this.maintenance.getSchedule();
  }

  @Put()
  @Header("Cache-Control", "no-store")
  update(
    @Body() body: unknown,
    @Req() request: Request & { user: { userId: string } },
  ) {
    return this.maintenance.updateSchedule(
      parseScheduleInput(body),
      request.user.userId,
    );
  }
}

@Controller("maintenance-notice")
@UseGuards(JwtAuthGuard)
export class MaintenanceNoticeController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  getActiveNotice() {
    return this.maintenance.getActiveNotice();
  }
}
