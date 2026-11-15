import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuthenticationMode } from "../../generated/prisma/client";
import { recordManagementAudit } from "../../common/management-audit";
import {
  choice,
  nullableText,
  pageNumber,
  pageSize,
  requiredEmail,
  requiredText,
  strictObject,
  uuid,
} from "../../common/management-validation";
import { hashPassword, verifyPassword } from "../authentication/passwords";
import { resolveKeycloakSettings } from "../authentication/keycloak-verifier.service";
import { PrismaService } from "../persistence/prisma.service";
import { baseAcronym } from "../base-management/base-validation";

type VersionedUserSource = {
  id: string;
  username: string;
  fullName?: string | null;
  email: string | null;
  enabled: boolean;
  base: { code: string } | null;
};

const userSelect = {
  id: true,
  gid: true,
  username: true,
  fullName: true,
  email: true,
  baseId: true,
  enabled: true,
  base: { select: { id: true, code: true, name: true } },
};
const userDetailSelect = {
  ...userSelect,
  passwordHash: true,
  sessionVersion: true,
  identities: { select: { provider: true, providerUsername: true } },
};
const sortFields = ["gid", "username", "fullName", "email", "base", "enabled"] as const;
const configuredAdminNames = () =>
  (process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
const isConfiguredAdminName = (username: string, names: string[]) =>
  names.includes(username.toLowerCase());

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(value: unknown, actorId: string) {
    return this.createAccount(value, actorId);
  }

  async createV2(value: unknown, actorId: string) {
    const input = strictObject(value, ["username", "fullName", "email", "baseAcronym", "password"]);
    const { baseAcronym: acronym, ...fields } = input;
    this.requiredFullName(input.fullName);
    return this.toV2(await this.createAccount(fields, actorId, baseAcronym(acronym)));
  }

  async getV2(id: unknown) {
    return this.toV2(await this.get(id));
  }

  async updateV2(id: unknown, value: unknown, actorId: string) {
    const input = strictObject(value, ["username", "fullName", "email", "baseAcronym", "enabled"]);
    if (!Object.keys(input).length)
      throw new BadRequestException("At least one user field is required.");
    if ("fullName" in input) this.requiredFullName(input.fullName);
    const { baseAcronym: acronym, ...fields } = input;
    const code = "baseAcronym" in input && acronym !== null ? baseAcronym(acronym) : undefined;
    if ("baseAcronym" in input) fields.baseId = null;
    return this.toV2(await this.updateAccount(id, fields, actorId, code));
  }

  private requiredFullName(value: unknown): string {
    const name = nullableText(value, "Full name", 50);
    if (!name) throw new BadRequestException("Full name is required.");
    return name;
  }

  private toV2(user: VersionedUserSource) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName ?? null,
      email: user.email,
      baseAcronym: user.base?.code ?? null,
      enabled: user.enabled,
    };
  }

  private async createAccount(value: unknown, actorId: string, code?: string) {
    const input = strictObject(value, [
      "gid",
      "username",
      "fullName",
      "email",
      "baseId",
      "password",
    ]);
    if (
      typeof input.gid === "string" &&
      /[\u0000-\u001f\u007f-\u009f]/.test(input.gid)
    )
      throw new BadRequestException("GID cannot contain control characters.");
    const gid = input.gid === undefined ? null : requiredText(input.gid, "GID", 64);
    if (typeof input.username === "string" && /[\u0000-\u001f\u007f-\u009f]/.test(input.username))
      throw new BadRequestException("Username cannot contain control characters.");
    const username = requiredText(input.username, "Username", 100);
    const fullName = nullableText(input.fullName, "Full name", 50);
    if (!gid && !fullName)
      throw new BadRequestException("Full name is required.");
    const email = requiredEmail(input.email);
    const requestedBaseId = code === undefined ? uuid(input.baseId) : undefined;
    const password = input.password;
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    )
      throw new BadRequestException(
        "Password must contain 12 to 128 characters.",
      );
    if (isConfiguredAdminName(username, configuredAdminNames())) {
      throw new BadRequestException(
        "This username is reserved for configured administrators.",
      );
    }
    const passwordHash = await hashPassword(password);
    try {
      return await this.prisma.$transaction(
        async (client) => {
          // The case-insensitive GID database constraint is required to enforce this check under concurrency.
          const tx = client as any;
          const selectedBase = await client.base.findUnique({
            where: code === undefined ? { id: requestedBaseId } : { code },
            select: { id: true },
          });
          if (!selectedBase) throw new BadRequestException("Choose an existing Base.");
          const baseId = selectedBase.id;
          if (
            await tx.user.findFirst({
              where: {
                OR: [
                  ...(gid ? [{ gid: { equals: gid, mode: "insensitive" } }] : []),
                  { username },
                  { email: { equals: email, mode: "insensitive" } },
                ],
              },
              select: { id: true },
            })
          ) {
            throw new ConflictException(
              "GID, username or email is already in use.",
            );
          }
          const user = await tx.user.create({
            data: {
              gid,
              username,
              fullName,
              email,
              baseId,
              passwordHash,
              identities: { create: { provider: "LOCAL", subject: username } },
            },
            select: userSelect,
          });
          await recordManagementAudit(
            tx,
            actorId,
            "USER_CREATED",
            "USER",
            user.id,
            [...(gid ? ["gid"] : []), "username", ...(fullName ? ["fullName"] : []), "email", "baseId", "localCredential"],
          );
          return {
            id: user.id,
            gid: user.gid,
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            baseId: user.baseId,
            enabled: user.enabled,
            base: user.base,
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (["P2002", "P2034"].includes((error as { code?: string }).code || ""))
        throw new ConflictException(
          "GID, username or email is already in use, or registration conflicted. Please retry.",
        );
      if ((error as { code?: string }).code === "P2003")
        throw new BadRequestException("Choose an existing Base.");
      throw error;
    }
  }

  async assignBase(id: unknown, value: unknown, actorId: string) {
    const input = strictObject(value, ["baseId"]);
    const userId = uuid(id);
    const baseId = uuid(input.baseId);
    try {
      return await this.prisma.$transaction(async (client) => {
        const tx = client as any;
        const user = await tx.user.update({
          where: { id: userId },
          data: { baseId },
          select: userSelect,
        });
        await recordManagementAudit(
          tx,
          actorId,
          "USER_BASE_ASSIGNED",
          "USER",
          userId,
          ["baseId"],
        );
        return user;
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2003")
        throw new BadRequestException("Choose an existing Base.");
      if (code === "P2025") throw new NotFoundException("User not found.");
      throw error;
    }
  }

  async get(id: unknown) {
    const userId = uuid(id);
    const user = await (this.prisma.user as any).findUnique({
      where: { id: userId },
      select: userDetailSelect,
    });
    if (!user) throw new NotFoundException("User not found.");
    return this.toUserDetail(user);
  }

  async update(id: unknown, value: unknown, actorId: string) {
    return this.updateAccount(id, value, actorId);
  }

  private async updateAccount(id: unknown, value: unknown, actorId: string, baseCode?: string) {
    const userId = uuid(id);
    const input = strictObject(value, [
      "gid",
      "username",
      "fullName",
      "email",
      "baseId",
      "enabled",
    ]);
    if (!Object.keys(input).length)
      throw new BadRequestException("At least one user field is required.");

    const data: Record<string, unknown> = {};
    if ("gid" in input) {
      if (
        typeof input.gid === "string" &&
        /[\u0000-\u001f\u007f-\u009f]/.test(input.gid)
      )
        throw new BadRequestException("GID cannot contain control characters.");
      data.gid = requiredText(input.gid, "GID", 64);
    }
    let updatedUsername: string | undefined;
    if ("username" in input) {
      if (typeof input.username === "string" && /[\u0000-\u001f\u007f-\u009f]/.test(input.username))
        throw new BadRequestException("Username cannot contain control characters.");
      updatedUsername = requiredText(input.username, "Username", 100);
      data.username = updatedUsername;
    }
    if ("fullName" in input)
      data.fullName = nullableText(input.fullName, "Full name", 50);
    if ("email" in input)
      data.email = input.email === null ? null : requiredEmail(input.email);
    if ("baseId" in input)
      data.baseId =
        input.baseId === null || input.baseId === ""
          ? null
          : uuid(input.baseId);
    if ("enabled" in input) {
      if (typeof input.enabled !== "boolean")
        throw new BadRequestException("Enabled must be true or false.");
      data.enabled = input.enabled;
    }

    try {
      return await this.prisma.$transaction(
        async (client) => {
          const tx = client as any;
          const current = await tx.user.findUnique({
            where: { id: userId },
            select: userDetailSelect,
          });
          if (!current) throw new NotFoundException("User not found.");
          if (baseCode !== undefined) {
            const base = await client.base.findUnique({ where: { code: baseCode }, select: { id: true } });
            if (!base) throw new BadRequestException("Choose an existing Base.");
            data.baseId = base.id;
          }

          const configuredAdmins = configuredAdminNames();
          if (
            updatedUsername !== undefined &&
            isConfiguredAdminName(current.username, configuredAdmins) !==
              isConfiguredAdminName(updatedUsername, configuredAdmins)
          )
            throw new BadRequestException(
              "Username cannot change configured administrator status.",
            );

          const uniqueChecks: Record<string, unknown>[] = [];
          if ("gid" in data)
            uniqueChecks.push({
              gid: { equals: data.gid, mode: "insensitive" },
            });
          if ("username" in data)
            uniqueChecks.push({ username: data.username });
          if ("email" in data && data.email !== null)
            uniqueChecks.push({
              email: { equals: data.email, mode: "insensitive" },
            });
          if (
            uniqueChecks.length &&
            (await tx.user.findFirst({
              where: { id: { not: userId }, OR: uniqueChecks },
              select: { id: true },
            }))
          )
            throw new ConflictException(
              "GID, username or email is already in use.",
            );

          if (current.enabled && data.enabled === false) {
            const oidc = await tx.oidcSettings.findUnique({
              where: { id: "default" },
              select: {
                mode: true,
                enabled: true,
                keycloakUrl: true,
                realm: true,
                clientId: true,
                issuerUrl: true,
              },
            });
            const authenticationSettings = resolveKeycloakSettings(oidc);
            const localAuthEnabled =
              process.env.LOCAL_AUTH_ENABLED === "true";
            const localAvailable =
              localAuthEnabled &&
              authenticationSettings.mode !== AuthenticationMode.OIDC;
            const oidcAvailable =
              authenticationSettings.enabled &&
              Boolean(
                authenticationSettings.keycloakUrl &&
                  authenticationSettings.realm &&
                  authenticationSettings.clientId &&
                  authenticationSettings.issuerUrl,
              );
            const currentOidcNames = current.identities
              .filter(
                (identity: any) =>
                  identity.provider === "KEYCLOAK" &&
                  identity.providerUsername,
              )
              .map((identity: any) => identity.providerUsername);
            const hasUnmappedOidcIdentity =
              configuredAdmins.length > 0 &&
              oidcAvailable &&
              current.identities.some(
                (identity: any) =>
                  identity.provider === "KEYCLOAK" &&
                  !identity.providerUsername,
              );
            const currentIsConfiguredAdmin =
              isConfiguredAdminName(current.username, configuredAdmins) ||
              currentOidcNames.some((username: string) =>
                isConfiguredAdminName(username, configuredAdmins),
              ) ||
              hasUnmappedOidcIdentity;

            if (currentIsConfiguredAdmin) {
              const candidates = configuredAdmins.length
                ? await tx.user.findMany({
                    where: {
                      id: { not: userId },
                      enabled: true,
                      OR: [
                        {
                          username: {
                            in: configuredAdmins,
                            mode: "insensitive",
                          },
                        },
                        {
                          identities: {
                            some: {
                              provider: "KEYCLOAK",
                              providerUsername: {
                                in: configuredAdmins,
                                mode: "insensitive",
                              },
                            },
                          },
                        },
                      ],
                    },
                    select: {
                      id: true,
                      username: true,
                      passwordHash: true,
                      identities: {
                        select: { provider: true, providerUsername: true },
                      },
                    },
                  })
                : [];
              const hasUsableAdministrator = candidates.some(
                (candidate: any) =>
                  (localAvailable &&
                    Boolean(candidate.passwordHash) &&
                    isConfiguredAdminName(
                      candidate.username,
                      configuredAdmins,
                    )) ||
                  (oidcAvailable &&
                    candidate.identities.some(
                      (identity: any) =>
                        identity.provider === "KEYCLOAK" &&
                        identity.providerUsername &&
                        isConfiguredAdminName(
                          identity.providerUsername,
                          configuredAdmins,
                        ),
                    )),
              );
              if (!hasUsableAdministrator)
                throw new BadRequestException(
                  "Cannot disable the last administrator with a usable configured login.",
                );
            }
            data.sessionVersion = { increment: 1 };
          }

          if (data.baseId) {
            const base = await tx.base.findUnique({
              where: { id: data.baseId },
              select: { id: true },
            });
            if (!base)
              throw new BadRequestException("Choose an existing Base.");
          }
          const usernameChanged =
            updatedUsername !== undefined && updatedUsername !== current.username;
          if (usernameChanged) data.sessionVersion = { increment: 1 };
          const updated = await tx.user.update({
            where: { id: userId },
            data,
            select: userDetailSelect,
          });
          if (usernameChanged) {
            await tx.userIdentity.updateMany({
              where: { userId, provider: "LOCAL" },
              data: { subject: updatedUsername },
            });
          }
          await recordManagementAudit(
            tx,
            actorId,
            "USER_UPDATED",
            "USER",
            userId,
            Object.keys(input),
          );
          return this.toUserDetail(updated);
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002" || code === "P2034")
        throw new ConflictException(
          "GID, username or email is already in use, or the update conflicted. Please retry.",
        );
      if (code === "P2003")
        throw new BadRequestException("Choose an existing Base.");
      if (code === "P2025") throw new NotFoundException("User not found.");
      throw error;
    }
  }

  async resetPassword(id: unknown, value: unknown, actorId: string) {
    const userId = uuid(id);
    const input = strictObject(value, ["password"]);
    const password = input.password;
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    ) {
      throw new BadRequestException(
        "Password must contain 12 to 128 characters.",
      );
    }
    const passwordHash = await hashPassword(password);
    try {
      return await this.prisma.$transaction(
        async (client) => {
          const tx = client as any;
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true },
          });
          if (!user) throw new NotFoundException("User not found.");
          if (!user.passwordHash)
            throw new BadRequestException(
              "Local password is not configured for this account.",
            );
          if (await verifyPassword(password, user.passwordHash))
            throw new BadRequestException(
              "New password must differ from the current password.",
            );
          const updated = await tx.user.update({
            where: { id: userId },
            data: { passwordHash, sessionVersion: { increment: 1 } },
            select: { id: true, enabled: true, sessionVersion: true },
          });
          await recordManagementAudit(
            tx,
            actorId,
            "LOCAL_PASSWORD_RESET",
            "USER",
            userId,
            ["localCredential"],
          );
          return updated;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2025") throw new NotFoundException("User not found.");
      if (code === "P2034")
        throw new ConflictException("Password reset conflicted. Please retry.");
      throw error;
    }
  }

  private toUserDetail(user: any) {
    const { identities, passwordHash, ...detail } = user;
    const identityProviders = (identities || []).map(
      (identity: any) => identity.provider,
    );
    if (passwordHash && !identityProviders.includes("LOCAL"))
      identityProviders.push("LOCAL");
    return {
      ...detail,
      hasLocalPassword: Boolean(passwordHash),
      identityProviders,
    };
  }

  async list(value: unknown) {
    const query = strictObject(value, [
      "q",
      "baseId",
      "enabled",
      "sort",
      "direction",
      "page",
      "pageSize",
    ]);
    const q =
      query.q === undefined || query.q === ""
        ? ""
        : requiredText(query.q, "Search", 120);
    const baseId =
      query.baseId === undefined || query.baseId === ""
        ? undefined
        : uuid(query.baseId);
    const enabled =
      query.enabled === undefined || query.enabled === ""
        ? undefined
        : choice(
            query.enabled,
            ["true", "false"] as const,
            "enabled filter",
          ) === "true";
    const sort = choice(query.sort ?? "username", sortFields, "sort");
    const direction = choice(
      query.direction ?? "asc",
      ["asc", "desc"] as const,
      "direction",
    );
    const page = pageNumber(query.page, 1, 100000);
    const size = pageSize(query.pageSize);
    const where: any = {
      ...(baseId ? { baseId } : {}),
      ...(enabled === undefined ? {} : { enabled }),
    };
    if (q) {
      // Resolve Base matches separately so the User text predicates remain indexable.
      const matchingBases = await this.prisma.base.findMany({
        where: {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      where.OR = [
        { gid: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(matchingBases.length
          ? [{ baseId: { in: matchingBases.map((base) => base.id) } }]
          : []),
        ...(["enabled", "disabled"].includes(q.toLowerCase())
          ? [{ enabled: q.toLowerCase() === "enabled" }]
          : []),
      ];
    }
    const orderBy: any = [
      sort === "base" ? { base: { name: direction } } : { [sort]: direction },
      { id: "asc" },
    ];
    const users = this.prisma.user as any;
    const [data, total] = await Promise.all([
      users.findMany({
        where,
        orderBy,
        skip: (page - 1) * size,
        take: size,
        select: userSelect,
      }),
      users.count({ where }),
    ]);
    return { data, total, page, pageSize: size };
  }
}
