import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  choice,
  pageNumber,
  pageSize,
  requiredText,
  strictObject,
  uuid,
} from "../../common/management-validation";
import { recordManagementAudit } from "../../common/management-audit";
import { PrismaService } from "../persistence/prisma.service";

@Injectable()
export class BaseService {
  constructor(private readonly prisma: PrismaService) {}

  async list(raw: unknown) {
    const input = strictObject(raw, [
      "q",
      "sort",
      "direction",
      "page",
      "pageSize",
    ]);
    const q =
      input.q === undefined || input.q === ""
        ? ""
        : requiredText(input.q, "Search", 100);
    const sort = choice(
      input.sort ?? "code",
      ["code", "name"] as const,
      "sort",
    );
    const direction = choice(
      input.direction ?? "asc",
      ["asc", "desc"] as const,
      "direction",
    );
    const page = pageNumber(input.page, 1, 1000000);
    const size = pageSize(input.pageSize);
    const where = q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.base.findMany({
        where,
        orderBy: [{ [sort]: direction }, { id: "asc" }],
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.base.count({ where }),
    ]);
    return { data, total, page, pageSize: size };
  }

  async create(raw: unknown, actorId: string) {
    const input = strictObject(raw, ["code", "name"]);
    const code = this.code(input.code);
    const name = requiredText(input.name, "Name", 100);
    try {
      return await this.prisma.$transaction(async (client) => {
        const tx = client as any;
        const base = await tx.base.create({ data: { code, name } });
        await recordManagementAudit(
          tx,
          actorId,
          "BASE_CREATED",
          "BASE",
          base.id,
          ["code", "name"],
        );
        return base;
      });
    } catch (error) {
      this.translateError(error);
    }
  }

  async update(id: unknown, raw: unknown, actorId: string) {
    const input = strictObject(raw, ["code", "name"]);
    if (!Object.keys(input).length)
      throw new BadRequestException("No changes supplied.");
    const data = {
      ...(input.code !== undefined ? { code: this.code(input.code) } : {}),
      ...(input.name !== undefined
        ? { name: requiredText(input.name, "Name", 100) }
        : {}),
    };
    const baseId = uuid(id);
    try {
      return await this.prisma.$transaction(async (client) => {
        const tx = client as any;
        const base = await tx.base.update({ where: { id: baseId }, data });
        await recordManagementAudit(
          tx,
          actorId,
          "BASE_UPDATED",
          "BASE",
          baseId,
          Object.keys(data),
        );
        return base;
      });
    } catch (error) {
      this.translateError(error);
    }
  }

  async remove(id: unknown, actorId: string) {
    const baseId = uuid(id);
    try {
      return await this.prisma.$transaction(async (client) => {
        const tx = client as any;
        const base = await tx.base.delete({ where: { id: baseId } });
        await recordManagementAudit(
          tx,
          actorId,
          "BASE_DELETED",
          "BASE",
          baseId,
          [],
        );
        return base;
      });
    } catch (error) {
      this.translateError(error);
    }
  }

  private code(value: unknown): string {
    const code = requiredText(value, "Code", 32).toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code))
      throw new BadRequestException("Invalid base code.");
    return code;
  }

  private translateError(error: unknown): never {
    const code = (error as { code?: string })?.code;
    if (code === "P2002")
      throw new ConflictException("A base with this code already exists.");
    if (code === "P2003")
      throw new ConflictException(
        "This base is assigned to users. Reassign them before deleting it.",
      );
    if (code === "P2025") throw new NotFoundException("Base not found.");
    throw error;
  }
}
