type ManagementAuditClient = {
  managementAudit: {
    create(args: {
      data: {
        actorId: string | null;
        action: string;
        targetType: string;
        targetId: string;
        changes: { fields: string[] };
      };
    }): Promise<unknown>;
  };
};

export async function recordManagementAudit(
  client: ManagementAuditClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  fields: readonly string[],
): Promise<void> {
  if (typeof actorId !== "string" || !actorId.trim()) {
    throw new TypeError("Audit actor is required.");
  }
  if (
    !Array.isArray(fields) ||
    fields.some(
      (field) =>
        typeof field !== "string" ||
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field),
    )
  ) {
    throw new TypeError("Audit changes must contain field names only.");
  }
  await client.managementAudit.create({
    data: {
      actorId,
      action,
      targetType,
      targetId,
      changes: { fields: [...fields] },
    },
  });
}
