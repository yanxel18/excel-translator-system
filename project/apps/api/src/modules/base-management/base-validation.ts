import { BadRequestException } from "@nestjs/common";
import { requiredText } from "../../common/management-validation";

export function baseAcronym(value: unknown): string {
  const code = requiredText(value, "Code", 32).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code))
    throw new BadRequestException("Invalid base code.");
  return code;
}
