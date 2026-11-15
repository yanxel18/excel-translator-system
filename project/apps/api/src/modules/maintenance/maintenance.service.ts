import { Injectable } from "@nestjs/common";
import { recordManagementAudit } from "../../common/management-audit";
import { PrismaService } from "../persistence/prisma.service";
import { MAINTENANCE_SCHEDULE_ID } from "./maintenance.constants";

export interface MaintenanceScheduleInput {
  enabled: boolean;
  startsAt: Date;
  endsAt: Date;
}

export interface MaintenanceSchedule {
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export type MaintenanceNotice =
  | { active: false }
  | { active: true; startsAt: string; endsAt: string };

interface ScheduleWindow {
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export function isMaintenanceActive(
  schedule: ScheduleWindow,
  now: Date,
): boolean {
  return (
    schedule.enabled &&
    schedule.startsAt !== null &&
    schedule.endsAt !== null &&
    schedule.startsAt.getTime() <= now.getTime() &&
    now.getTime() < schedule.endsAt.getTime()
  );
}

function toScheduleResponse(schedule: {
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}): MaintenanceSchedule {
  return {
    enabled: schedule.enabled,
    startsAt: schedule.startsAt?.toISOString() ?? null,
    endsAt: schedule.endsAt?.toISOString() ?? null,
  };
}

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getSchedule(): Promise<MaintenanceSchedule> {
    const schedule = await this.prisma.maintenanceSchedule.upsert({
      where: { id: MAINTENANCE_SCHEDULE_ID },
      create: {
        id: MAINTENANCE_SCHEDULE_ID,
        enabled: false,
        startsAt: null,
        endsAt: null,
      },
      update: {},
      select: { enabled: true, startsAt: true, endsAt: true },
    });
    return toScheduleResponse(schedule);
  }

  async updateSchedule(
    input: MaintenanceScheduleInput,
    actorId: string,
  ): Promise<MaintenanceSchedule> {
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.maintenanceSchedule.upsert({
        where: { id: MAINTENANCE_SCHEDULE_ID },
        create: {
          id: MAINTENANCE_SCHEDULE_ID,
          enabled: input.enabled,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
        update: {
          enabled: input.enabled,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
        select: { enabled: true, startsAt: true, endsAt: true },
      });
      await recordManagementAudit(
        tx,
        actorId,
        "MAINTENANCE_SCHEDULE_UPDATED",
        "MAINTENANCE_SCHEDULE",
        MAINTENANCE_SCHEDULE_ID,
        ["enabled", "startsAt", "endsAt"],
      );
      return toScheduleResponse(saved);
    });
  }

  async getActiveNotice(now = new Date()): Promise<MaintenanceNotice> {
    const schedule = await this.prisma.maintenanceSchedule.findUnique({
      where: { id: MAINTENANCE_SCHEDULE_ID },
      select: { enabled: true, startsAt: true, endsAt: true },
    });
    if (!schedule || !isMaintenanceActive(schedule, now))
      return { active: false };
    return {
      active: true,
      startsAt: schedule.startsAt.toISOString(),
      endsAt: schedule.endsAt.toISOString(),
    };
  }
}
