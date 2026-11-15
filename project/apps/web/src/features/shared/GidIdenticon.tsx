export default function GidIdenticon({ seed }: { seed: string }) {
  let hash = 0;
  for (const character of seed)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < 5; y += 1)
    for (let x = 0; x < 3; x += 1) {
      hash ^= hash << 13;
      hash ^= hash >>> 17;
      hash ^= hash << 5;
      hash >>>= 0;
      if (hash >>> 31) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  return (
    <svg
      viewBox="0 0 5 5"
      width="100%"
      height="100%"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect width="5" height="5" fill={`hsl(${hue} 72% 94%)`} />
      {cells.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="1"
          height="1"
          fill={`hsl(${hue} 58% 42%)`}
        />
      ))}
    </svg>
  );
}
