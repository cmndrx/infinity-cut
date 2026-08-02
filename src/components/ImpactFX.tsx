import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

/**
 * White/purple impact flash. Renders nothing outside its window.
 */
export const Flash: React.FC<{
  at: number;
  duration?: number;
  peak?: number;
  color?: string;
}> = ({ at, duration = 10, peak = 1, color = "255,255,255" }) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + duration) {
    return null;
  }
  const opacity = interpolate(
    frame,
    [at, at + Math.min(2, duration * 0.25), at + duration],
    [0, peak, 0],
    { easing: Easing.out(Easing.quad), extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 50%, rgba(${color},${opacity}) 0%, rgba(${color},${opacity * 0.75}) 38%, rgba(${color},${opacity * 0.3}) 74%, rgba(${color},${opacity * 0.12}) 100%)`,
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * Expanding shockwave ring.
 */
export const Shockwave: React.FC<{
  at: number;
  duration?: number;
  maxRadius?: number;
  x?: string;
  y?: string;
  color?: string;
}> = ({ at, duration = 34, maxRadius = 1200, x = "50%", y = "50%", color = "192,132,252" }) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + duration) {
    return null;
  }
  const progress = interpolate(frame, [at, at + duration], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const size = 60 + progress * maxRadius;
  const opacity = (1 - progress) * 0.85;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size * 0.66,
        borderRadius: "50%",
        transform: "translate(-50%, -50%)",
        border: `${3 - progress * 2}px solid rgba(${color},${opacity})`,
        boxShadow: `0 0 ${30 + progress * 60}px rgba(${color},${opacity * 0.6}), inset 0 0 ${24 + progress * 40}px rgba(${color},${opacity * 0.3})`,
        mixBlendMode: "screen",
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * Horizontal anamorphic lens flare.
 */
export const AnamorphicFlare: React.FC<{
  opacity: number;
  y?: string;
  width?: number;
  hue?: string;
}> = ({ opacity, y = "50%", width = 1600, hue = "168,85,247" }) => {
  if (opacity <= 0.01) {
    return null;
  }
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: y,
          width,
          height: 6,
          transform: "translate(-50%, -50%)",
          background: `linear-gradient(90deg, rgba(${hue},0) 0%, rgba(${hue},0.35) 22%, rgba(255,255,255,0.95) 50%, rgba(${hue},0.35) 78%, rgba(${hue},0) 100%)`,
          filter: "blur(2px)",
          opacity,
          mixBlendMode: "screen",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: y,
          width: width * 0.5,
          height: 42,
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(ellipse, rgba(255,255,255,0.5) 0%, rgba(${hue},0.28) 40%, rgba(${hue},0) 72%)`,
          filter: "blur(8px)",
          opacity,
          mixBlendMode: "screen",
        }}
      />
    </>
  );
};

/**
 * Two chroma-offset ghost copies of children — flashes RGB-split for the
 * first frames of an impact. Wrap the element being hit.
 */
export const ChromaticImpact: React.FC<{
  amount: number;
  children: React.ReactNode;
}> = ({ amount, children }) => {
  if (amount <= 0.01) {
    return <>{children}</>;
  }
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${-6 * amount}px)`,
          opacity: 0.55 * amount,
          filter: "hue-rotate(-45deg) saturate(3)",
          mixBlendMode: "screen",
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${6 * amount}px)`,
          opacity: 0.55 * amount,
          filter: "hue-rotate(90deg) saturate(3)",
          mixBlendMode: "screen",
        }}
      >
        {children}
      </div>
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
};
