import { noise2D } from "@remotion/noise";
import { random } from "remotion";

type Point = { x: number; y: number };

const boltPath = (
  seed: string,
  from: Point,
  to: Point,
  jitter: number,
  time: number,
): string => {
  const segments = 14;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const pts: string[] = [`M ${from.x} ${from.y}`];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    // Fade jitter at both ends so the bolt stays anchored.
    const falloff = Math.sin(t * Math.PI);
    const offset = noise2D(seed, t * 6.5, time) * jitter * falloff;
    pts.push(
      `L ${from.x + dx * t + px * offset} ${from.y + dy * t + py * offset}`,
    );
  }
  pts.push(`L ${to.x} ${to.y}`);
  return pts.join(" ");
};

/**
 * Noise-jittered electric arcs. `time` should be quantized (e.g. every 3
 * frames) by the caller for a convincing strobe-like re-strike.
 */
export const Lightning: React.FC<{
  seed: string;
  from: Point;
  to: Point;
  time: number;
  opacity: number;
  jitter?: number;
  width?: number;
  height?: number;
}> = ({ seed, from, to, time, opacity, jitter = 46, width = 1920, height = 1080 }) => {
  if (opacity <= 0.01) {
    return null;
  }
  const main = boltPath(`${seed}-a`, from, to, jitter, time);
  const branchT = 0.3 + random(`${seed}-bt-${Math.floor(time)}`) * 0.4;
  const bx = from.x + (to.x - from.x) * branchT;
  const by = from.y + (to.y - from.y) * branchT;
  const branch = boltPath(
    `${seed}-b`,
    { x: bx, y: by },
    {
      x: bx + (random(`${seed}-bx-${Math.floor(time)}`) - 0.5) * 260,
      y: by + 120 + random(`${seed}-by-${Math.floor(time)}`) * 160,
    },
    jitter * 0.7,
    time,
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0, opacity, mixBlendMode: "screen" }}
    >
      <g filter="blur(0px)">
        <path d={main} stroke="rgba(168,85,247,0.9)" strokeWidth={7} fill="none" style={{ filter: "blur(6px)" }} />
        <path d={main} stroke="rgba(233,213,255,0.95)" strokeWidth={2.6} fill="none" style={{ filter: "blur(1px)" }} />
        <path d={main} stroke="#fff" strokeWidth={1.1} fill="none" />
        <path d={branch} stroke="rgba(192,132,252,0.8)" strokeWidth={1.4} fill="none" style={{ filter: "blur(0.6px)" }} />
      </g>
    </svg>
  );
};
