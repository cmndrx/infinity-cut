import { noise2D } from "@remotion/noise";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS } from "../config";
import { ParticleField } from "./ParticleField";

/**
 * Premium nebula backdrop: drifting fog blobs on noise + ember field.
 */
export const Background: React.FC<{
  glowOpacity?: number;
  particleCount?: number;
  seed?: string;
}> = ({ glowOpacity = 0.45, particleCount = 50, seed = "bg" }) => {
  const frame = useCurrentFrame();
  const t = frame * 0.008;
  const fogX = noise2D(`${seed}-fx`, t, 0) * 90;
  const fogY = noise2D(`${seed}-fy`, 0, t) * 50;
  const fog2X = noise2D(`${seed}-f2x`, t + 10, 0) * 120;

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: COLORS.background }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 58%, rgba(139,92,246,${glowOpacity * 0.55}) 0%, rgba(88,44,160,${glowOpacity * 0.22}) 30%, rgba(5,4,10,0) 66%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 340 + fogX,
          top: 320 + fogY,
          width: 900,
          height: 560,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(106,58,196,0.16) 0%, rgba(63,28,120,0.08) 46%, rgba(5,4,10,0) 72%)",
          filter: "blur(46px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 220 - fog2X,
          top: 420 - fogY,
          width: 760,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(168,85,247,0.1) 0%, rgba(247,201,72,0.03) 48%, rgba(5,4,10,0) 74%)",
          filter: "blur(52px)",
        }}
      />
      <ParticleField seed={seed} count={particleCount} />
    </AbsoluteFill>
  );
};
