import { GOLD_TEXT_GRADIENT } from "../config";
import { DISPLAY_FONT } from "../fonts";

/**
 * Metallic gold gradient display text with an optional specular shine sweep.
 * `shineProgress` runs 0 → 1 to slide a highlight across the glyphs.
 */
export const GoldText: React.FC<{
  children: React.ReactNode;
  fontSize: number;
  letterSpacing?: string;
  fontWeight?: number;
  shineProgress?: number | null;
  glow?: number;
  style?: React.CSSProperties;
}> = ({
  children,
  fontSize,
  letterSpacing = "0.06em",
  fontWeight = 900,
  shineProgress = null,
  glow = 0.5,
  style,
}) => {
  const baseText: React.CSSProperties = {
    fontFamily: DISPLAY_FONT,
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight: 1,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        position: "relative",
        filter: `drop-shadow(0 2px 0 rgba(60,35,4,0.85)) drop-shadow(0 0 26px rgba(247,201,72,${glow * 0.55})) drop-shadow(0 0 70px rgba(168,85,247,${glow * 0.5}))`,
        ...style,
      }}
    >
      <div
        style={{
          ...baseText,
          background: GOLD_TEXT_GRADIENT,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        {children}
      </div>
      {shineProgress !== null ? (
        <div
          style={{
            ...baseText,
            position: "absolute",
            inset: 0,
            background: `linear-gradient(112deg, rgba(255,255,255,0) 42%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 58%)`,
            backgroundSize: "260% 100%",
            backgroundPosition: `${(1 - shineProgress) * 220 - 60}% 0%`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
};
