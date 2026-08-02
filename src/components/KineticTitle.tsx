import { Easing, interpolate, useCurrentFrame } from "remotion";
import { ICE_TEXT_GRADIENT } from "../config";
import { DISPLAY_FONT } from "../fonts";

/**
 * Per-letter staggered reveal: each glyph rises out of a blur.
 * Far more cinematic than a whole-block fade.
 */
export const KineticTitle: React.FC<{
  text: string;
  startFrame: number;
  stagger?: number;
  letterDuration?: number;
  fontSize: number;
  letterSpacing?: string;
  fontWeight?: number;
  gradient?: string;
  glow?: string;
}> = ({
  text,
  startFrame,
  stagger = 2.2,
  letterDuration = 22,
  fontSize,
  letterSpacing = "0.14em",
  fontWeight = 900,
  gradient = ICE_TEXT_GRADIENT,
  glow = "0 0 34px rgba(192,132,252,0.55), 0 0 90px rgba(139,92,246,0.3)",
}) => {
  const frame = useCurrentFrame();
  const letters = Array.from(text);

  return (
    <div
      style={{
        display: "flex",
        filter: `drop-shadow(${glow.split(",").length > 2 ? "0 0 30px rgba(192,132,252,0.45)" : glow})`,
      }}
    >
      {letters.map((letter, i) => {
        const localStart = startFrame + i * stagger;
        const progress = interpolate(
          frame,
          [localStart, localStart + letterDuration],
          [0, 1],
          {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        );
        const blur = (1 - progress) * 14;
        const y = (1 - progress) * 26;

        return (
          <span
            key={`${letter}-${i}`}
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize,
              fontWeight,
              letterSpacing,
              lineHeight: 1.08,
              textTransform: "uppercase",
              background: gradient,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              opacity: progress,
              transform: `translateY(${y}px)`,
              filter: `blur(${blur}px)`,
              whiteSpace: "pre",
            }}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
};
