export function hasAttribute(
  attributes: string,
  name: string,
  expected: string,
): boolean {
  const escapedName = name.replace(":", "\\:");
  return new RegExp(`(?:^|\\s)${escapedName}=(['"])${expected}\\1`).test(
    attributes,
  );
}

export function sharedStringIndex(cellXml: string): number | undefined {
  const value = /<v(?:\s[^>]*)?>(\d+)<\/v>/.exec(cellXml)?.[1];
  if (value === undefined) return undefined;
  const index = Number(value);
  return Number.isSafeInteger(index) ? index : undefined;
}
