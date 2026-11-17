const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const {
  equalWorkbookPartStreams,
  wrapWorkbookPartStream,
} = require("../dist/modules/workbook-ooxml/part-comparison");

test("compares workbook parts exactly despite different stream chunk boundaries", async () => {
  const left = Readable.from([Buffer.from("ab"), Buffer.from("cdef"), Buffer.from("g")]);
  const right = Readable.from([Buffer.from("a"), Buffer.from("bcd"), Buffer.from("efg")]);
  assert.equal(await equalWorkbookPartStreams(left, right), true);
});

test("detects changed bytes and different lengths, including empty parts", async () => {
  for (const [left, right] of [
    ["abc", "abd"],
    ["abc", "abcd"],
    ["abcd", "abc"],
    ["", "a"],
  ]) {
    assert.equal(
      await equalWorkbookPartStreams(Readable.from([Buffer.from(left)]), Readable.from([Buffer.from(right)])),
      false,
    );
  }
  assert.equal(await equalWorkbookPartStreams(Readable.from([]), Readable.from([])), true);
});

test("propagates part stream errors and closes the other stream", async () => {
  const failed = new Readable({
    read() { this.destroy(new Error("broken part")); },
  });
  const other = new Readable({ read() {} });
  await assert.rejects(equalWorkbookPartStreams(failed, other), /broken part/);
  assert.equal(other.destroyed, true);
});

test("reports a right-hand stream error even if the left stream stalls", { timeout: 1000 }, async () => {
  const left = new Readable({ read() {} });
  const right = new Readable({
    read() { this.destroy(new Error("right part failed")); },
  });
  await assert.rejects(equalWorkbookPartStreams(left, right), /right part failed/);
  assert.equal(left.destroyed, true);
});

test("closes wrapped source streams when a mismatch ends comparison early", async () => {
  const left = Readable.from([Buffer.from("x")]);
  const right = Readable.from([Buffer.from("y")]);
  assert.equal(await equalWorkbookPartStreams(
    wrapWorkbookPartStream(left),
    wrapWorkbookPartStream(right),
  ), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(left.destroyed, true);
  assert.equal(right.destroyed, true);
});
