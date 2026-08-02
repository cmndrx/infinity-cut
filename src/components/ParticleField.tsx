import { noise3D } from "@remotion/noise";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { COLORS, TRAILER_HEIGHT, TRAILER_WIDTH } from "../config";

type Particle = {
  x: number;
  y: number;
  depth: number;
  size: number;
  gold: boolean;
  phase: number;
};

const buildParticles = (seed: string, count: number): Particle[] =>
  Array.from({ length: count }).map((_, i) => {
    const depth = 0.35 + random(`${seed}-d${i}`) * 0.65;
    return {
      x: random(`${seed}-x${i}`) * TRAILER_WIDTH,
      y: random(`${seed}-y${i}`) * TRAILER_HEIGHT,
      depth,
      size: 1.2 + depth * 3.4,
      gold: random(`${seed}-g${i}`) < 0.16,
      phase: random(`${seed}-p${i}`) * Math.PI * 2,
    };
  });

/**
 * Organic ember field. Particles rise slowly and drift on 3D noise —
 * no visible grid, no repeating pattern. Depth drives size/blur/parallax.
 */
export const ParticleField: React.FC<{
  seed?: string;
  count?: number;
  rise?: number;
  drift?: number;
  opacity?: number;
  parallaxX?: number;
}> = ({
  seed = "embers",
  count = 60,
  rise = 0.5,
  drift = 46,
  opacity = 1,
  parallaxX = 0,
}) => {
  const frame = useCurrentFrame();
  const particles = buildParticles(seed, count);

  return (
    <AbsoluteFill style={{ overflow: "hidden", opacity }}>
      {particles.map((p, i) => {
        const t = frame * 0.012;
        const nx = noise3D(`${seed}-nx`, p.x * 0.002, p.y * 0.002, t) * drift * p.depth;
        const ny = noise3D(`${seed}-ny`, p.x * 0.002, p.y * 0.002, t) * drift * 0.5 * p.depth;
        const risen = (p.y - frame * rise * p.depth) % (TRAILER_HEIGHT + 80);
        const y = risen < -40 ? risen + TRAILER_HEIGHT + 80 : risen;
        const x = p.x + nx + parallaxX * p.depth;
        const twinkle =
          0.55 + 0.45 * Math.sin(p.phase + frame * (0.05 + p.depth * 0.05));
        const color = p.gold ? COLORS.gold : COLORS.electric;
        const glow = p.gold ? "rgba(247,201,72,0.8)" : "rgba(168,85,247,0.8)";

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y + ny,
              width: p.size,
              height: p.size,
              borderRadius: 999,
              background: color,
              opacity: (0.1 + p.depth * 0.32) * twinkle,
              boxShadow: `0 0 ${p.size * 7}px ${glow}`,
              filter: p.depth < 0.55 ? "blur(1px)" : undefined,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
