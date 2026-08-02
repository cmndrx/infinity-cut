import { AbsoluteFill, useCurrentFrame } from "remotion";
import { LETTERBOX } from "../config";

/**
 * Global finishing layer rendered above every scene:
 * animated film grain, vignette and cinematic letterbox bars.
 */
export const CinematicOverlay: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Film grain — regenerated every frame */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          mixBlendMode: "overlay",
          opacity: 0.55,
        }}
      >
        <filter id="trailer-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves="2"
            seed={(frame * 7) % 983}
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#trailer-grain)" />
      </svg>

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(5,4,10,0) 52%, rgba(5,4,10,0.34) 80%, rgba(5,4,10,0.72) 100%)",
        }}
      />

      {/* Letterbox bars with a soft inner edge */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: LETTERBOX,
          background: "#000",
          boxShadow: "0 6px 22px rgba(0,0,0,0.55)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: LETTERBOX,
          background: "#000",
          boxShadow: "0 -6px 22px rgba(0,0,0,0.55)",
        }}
      />
    </AbsoluteFill>
  );
};
