function measureText(values: Iterable<string>): { characters: number; tokens: number } {
  let characters = 0;
  let bytes = 0;
  for (const value of values) {
    for (const _character of value) characters++;
    bytes += Buffer.byteLength(value, "utf8");
  }
  return { characters, tokens: Math.ceil(bytes / 4) };
}

export function measureTranslationUsage(
  input: readonly { value: string }[],
  output: readonly { translated: string }[],
) {
  const source = measureText(input.map((item) => item.value));
  const translated = measureText(output.map((item) => item.translated));
  return {
    inputCharacters: source.characters,
    outputCharacters: translated.characters,
    inputTokensEstimate: source.tokens,
    outputTokensEstimate: translated.tokens,
  };
}
