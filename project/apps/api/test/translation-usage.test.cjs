const assert = require("node:assert/strict");
const { test } = require("node:test");
const { measureTranslationUsage } = require("../dist/modules/translation/translation-usage");

test("counts Unicode text and estimates tokens from UTF-8 bytes", () => {
  assert.deepEqual(
    measureTranslationUsage(
      [{ value: "Hello" }, { value: "日本😀" }],
      [{ translated: "Hi" }, { translated: "中文" }],
    ),
    { inputCharacters: 8, outputCharacters: 4, inputTokensEstimate: 4, outputTokensEstimate: 2 },
  );
  assert.deepEqual(measureTranslationUsage([], []), {
    inputCharacters: 0, outputCharacters: 0, inputTokensEstimate: 0, outputTokensEstimate: 0,
  });
});
