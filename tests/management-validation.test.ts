import { test, expect } from "@playwright/test";
import {
  fieldLimits,
  validateManagementField,
} from "../project/apps/web/src/features/system-settings/validation";

test("management limits match the V2 field matrix", () => {
  expect(fieldLimits).toEqual({
    gid: 64,
    username: 100,
    fullName: 50,
    email: 254,
    code: 32,
    name: 100,
    password: 128,
  });
});

for (const field of ["gid", "username", "fullName", "name"] as const) {
  test(`${field} permits CJK and rejects blank or oversized text`, () => {
    expect(
      validateManagementField(field, "  山田 太郎・张伟  "),
    ).toBeUndefined();
    expect(validateManagementField(field, " \u3000 ")).toBeTruthy();
    expect(
      validateManagementField(field, "名".repeat(fieldLimits[field])),
    ).toBeUndefined();
    expect(
      validateManagementField(field, "名".repeat(fieldLimits[field] + 1)),
    ).toBeTruthy();
  });
}

test("GID rejects controls without stripping them", () => {
  for (const control of ["\n", "\t", "\u0000", "\u007f", "\u0085"]) {
    expect(validateManagementField("gid", `${control}社員1`)).toBeTruthy();
  }
});

test("full names count supplementary Unicode characters correctly", () => {
  expect(validateManagementField("fullName", "𠮷".repeat(50))).toBeUndefined();
  expect(validateManagementField("fullName", "𠮷".repeat(51))).toBeTruthy();
});

test("Base code allows only the documented ASCII characters", () => {
  expect(validateManagementField("code", "  JTY_2-a  ")).toBeUndefined();
  for (const code of ["", " ", "東京", "A B", "A!B", "a".repeat(33)]) {
    expect(validateManagementField("code", code)).toBeTruthy();
  }
  expect(validateManagementField("code", "a".repeat(32))).toBeUndefined();
});

test("email requires an address and enforces the 254-character limit", () => {
  expect(
    validateManagementField("email", `a@${"b".repeat(248)}.com`),
  ).toBeUndefined();
  for (const email of [
    "",
    "a@b",
    "a b@example.com",
    "a@@b.com",
    `a@${"b".repeat(249)}.com`,
  ]) {
    expect(validateManagementField("email", email)).toBeTruthy();
  }
});

test("password length is checked exactly, without trimming or normalizing", () => {
  for (const password of [
    " ".repeat(12),
    ` ${"密".repeat(10)} `,
    "a".repeat(128),
  ]) {
    expect(validateManagementField("password", password)).toBeUndefined();
  }
  for (const password of ["", "a".repeat(11), ` ${"a".repeat(127)} `]) {
    expect(validateManagementField("password", password)).toBeTruthy();
  }
});
