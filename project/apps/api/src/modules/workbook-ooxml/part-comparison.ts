import { Readable } from "node:stream";

export function wrapWorkbookPartStream(source: NodeJS.ReadableStream): Readable {
  const wrapped = new Readable().wrap(source);
  wrapped.once("close", () => {
    if ("destroy" in source && typeof source.destroy === "function")
      source.destroy();
  });
  return wrapped;
}

export async function equalWorkbookPartStreams(
  left: Readable,
  right: Readable,
): Promise<boolean> {
  const leftIterator = left[Symbol.asyncIterator]();
  const rightIterator = right[Symbol.asyncIterator]();
  let leftChunk = Buffer.alloc(0);
  let rightChunk = Buffer.alloc(0);
  let leftDone = false;
  let rightDone = false;

  try {
    while (true) {
      const [nextLeft, nextRight] = await Promise.all([
        !leftChunk.length && !leftDone ? leftIterator.next() : undefined,
        !rightChunk.length && !rightDone ? rightIterator.next() : undefined,
      ]);
      if (nextLeft) {
        leftDone = Boolean(nextLeft.done);
        if (!nextLeft.done) leftChunk = nextLeft.value;
      }
      if (nextRight) {
        rightDone = Boolean(nextRight.done);
        if (!nextRight.done) rightChunk = nextRight.value;
      }
      if (leftDone || rightDone)
        return leftDone && rightDone && !leftChunk.length && !rightChunk.length;
      const length = Math.min(leftChunk.length, rightChunk.length);
      if (!leftChunk.subarray(0, length).equals(rightChunk.subarray(0, length)))
        return false;
      leftChunk = leftChunk.subarray(length);
      rightChunk = rightChunk.subarray(length);
    }
  } finally {
    left.destroy();
    right.destroy();
  }
}
