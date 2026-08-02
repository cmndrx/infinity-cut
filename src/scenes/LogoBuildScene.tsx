import { noise2D } from "@remotion/noise";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Lightning } from "../components/Lightning";
import { SceneFrame } from "../components/SceneFrame";
import { COLORS, ICE_TEXT_GRADIENT } from "../config";
import { DISPLAY_FONT } from "../fonts";

const LOGO_SRC = staticFile("logo-assets/infinft-royale-3-tight.png");
const PARTICLE_COUNT = 110;
const CX = 960;
const CY = 470;

const captions = [
  { text: "A New", keyword: "Arena", start: 58, end: 90 },
  { text: "New", keyword: "Rewards", start: 92, end: 120 },
  { text: "New", keyword: "Legends", start: 122, end: 150 },
];

/**
 * Scene 4 — the chaos converges. Particles spiral inward, electricity
 * crawls around the emblem, and the Season 3 logo forms out of light.
 */
export const LogoBuildScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Open bright (montage white-out hands off here), settle fast.
  const openWash = interpolate(frame, [0, 14], [1, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const push = interpolate(frame, [0, 150], [1, 1.07], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoOpacity = interpolate(frame, [10, 44], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoBlur = interpolate(frame, [10, 46], [16, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoScale = interpolate(frame, [10, 60], [1.22, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rimPulse =
    0.65 + 0.35 * Math.sin(frame * 0.11) * interpolate(frame, [40, 70], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  const raysRotation = frame * 0.25;
  const raysOpacity = interpolate(frame, [16, 60, 150], [0, 0.5, 0.34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Electric strikes: quantized time so bolts re-strike every few frames,
  // gated so they flicker instead of burning constantly.
  const boltTime = Math.floor(frame / 3);
  const boltGateA = random(`gateA-${boltTime}`) > 0.4;
  const boltGateB = random(`gateB-${boltTime}`) > 0.55;
  const boltPhase = interpolate(frame, [22, 34, 110, 145], [0, 1, 0.8, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 44%, rgba(139,92,246,0.26) 0%, rgba(88,44,160,0.1) 26%, ${COLORS.background} 66%)`,
          }}
        />

        {/* Rotating god rays */}
        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY,
            width: 1500,
            height: 1500,
            transform: `translate(-50%, -50%) rotate(${raysRotation}deg)`,
            background:
              "conic-gradient(from 0deg, rgba(168,85,247,0) 0deg, rgba(168,85,247,0.16) 14deg, rgba(168,85,247,0) 32deg, rgba(247,201,72,0.1) 70deg, rgba(168,85,247,0) 96deg, rgba(168,85,247,0.14) 150deg, rgba(168,85,247,0) 180deg, rgba(247,201,72,0.08) 224deg, rgba(168,85,247,0) 260deg, rgba(168,85,247,0.15) 316deg, rgba(168,85,247,0) 360deg)",
            WebkitMaskImage:
              "radial-gradient(circle, rgba(0,0,0,0) 6%, #000 26%, rgba(0,0,0,0) 62%)",
            maskImage:
              "radial-gradient(circle, rgba(0,0,0,0) 6%, #000 26%, rgba(0,0,0,0) 62%)",
            opacity: raysOpacity,
          }}
        />

        {/* Converging particle vortex */}
        {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
          const startRadius = 620 + random(`vr${i}`) * 800;
          const angle0 = random(`va${i}`) * Math.PI * 2;
          const spin = (random(`vs${i}`) - 0.5) * 3.4;
          const converge = interpolate(frame, [0, 64 + random(`vd${i}`) * 30], [1, 0.12], {
            easing: Easing.bezier(0.3, 0.7, 0.2, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const radius = startRadius * converge;
          const angle = angle0 + frame * 0.024 * spin + (1 - converge) * 2.2;
          const x = CX + Math.cos(angle) * radius;
          const y = CY + Math.sin(angle) * radius * 0.6;
          const gold = random(`vg${i}`) < 0.2;
          const size = 2 + random(`vz${i}`) * 3.6;
          const nearCenter = radius < 150;
          const opacity =
            (0.25 + random(`vo${i}`) * 0.5) * (nearCenter ? radius / 150 : 1);

          return (
            <div
              key={`v${i}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: size,
                height: size,
                borderRadius: 999,
                background: gold ? COLORS.gold : COLORS.electric,
                boxShadow: gold
                  ? `0 0 ${size * 6}px rgba(247,201,72,0.85)`
                  : `0 0 ${size * 7}px rgba(168,85,247,0.85)`,
                opacity,
              }}
            />
          );
        })}

        {/* Orbiting energy arcs */}
        {[0, 1].map((i) => {
          const reveal = interpolate(frame, [14 + i * 8, 40 + i * 8], [0, 1], {
            easing: Easing.out(Easing.cubic),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={`arc${i}`}
              style={{
                position: "absolute",
                left: CX,
                top: CY,
                width: 860 - i * 120,
                height: 400 - i * 70,
                borderRadius: "50%",
                border: "2px solid transparent",
                borderTopColor: `rgba(192,132,252,${0.75 - i * 0.2})`,
                borderLeftColor: i === 0 ? "rgba(247,201,72,0.55)" : "transparent",
                transform: `translate(-50%, -50%) rotate(${-20 + i * 30 + frame * (i === 0 ? 0.9 : -0.7)}deg)`,
                opacity: reveal * 0.85,
                boxShadow: "0 0 26px rgba(168,85,247,0.3)",
                mixBlendMode: "screen",
              }}
            />
          );
        })}

        {/* Electricity crawling around the emblem */}
        {boltGateA ? (
          <Lightning
            seed="boltA"
            from={{ x: CX - 470, y: CY - 210 }}
            to={{ x: CX + 430, y: CY + 180 }}
            time={boltTime}
            opacity={boltPhase * 0.9}
            jitter={62}
          />
        ) : null}
        {boltGateB ? (
          <Lightning
            seed="boltB"
            from={{ x: CX + 480, y: CY - 250 }}
            to={{ x: CX - 420, y: CY + 210 }}
            time={boltTime + 37}
            opacity={boltPhase * 0.7}
            jitter={54}
          />
        ) : null}

        {/* Core glow + the logo itself */}
        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY,
            width: 980,
            height: 620,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(ellipse, rgba(247,201,72,0.16) 0%, rgba(168,85,247,0.2) 34%, rgba(5,4,10,0) 70%)",
            filter: "blur(18px)",
            opacity: logoOpacity * rimPulse,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY,
            transform: `translate(-50%, -50%) scale(${logoScale})`,
            opacity: logoOpacity,
            filter: `blur(${logoBlur}px) drop-shadow(0 0 30px rgba(255,244,214,${0.3 * rimPulse})) drop-shadow(0 0 70px rgba(192,132,252,${0.5 * rimPulse})) drop-shadow(0 10px 60px rgba(0,0,0,0.6))`,
          }}
        >
          <Img src={LOGO_SRC} style={{ width: 820, height: "auto", display: "block" }} />
        </div>

        {/* Narration captions — clean, sequential, center-bottom */}
        {captions.map((c) => {
          const inP = interpolate(frame, [c.start, c.start + 9], [0, 1], {
            easing: Easing.out(Easing.cubic),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const outP = interpolate(frame, [c.end - 7, c.end], [1, 0], {
            easing: Easing.in(Easing.quad),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const visible = inP * outP;
          const rise = (1 - inP) * 18;
          const wobble = noise2D(`cap-${c.keyword}`, frame * 0.02, 0) * 2;

          return (
            <div
              key={c.keyword}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 856,
                display: "flex",
                justifyContent: "center",
                gap: 22,
                opacity: visible,
                transform: `translateY(${rise + wobble}px)`,
                fontFamily: DISPLAY_FONT,
                fontSize: 42,
                fontWeight: 800,
                letterSpacing: "0.4em",
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  background: ICE_TEXT_GRADIENT,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  filter: "drop-shadow(0 0 24px rgba(192,132,252,0.5))",
                }}
              >
                {c.text}
              </span>
              <span
                style={{
                  color: COLORS.gold,
                  textShadow:
                    "0 0 22px rgba(247,201,72,0.65), 0 0 60px rgba(247,201,72,0.3)",
                }}
              >
                {c.keyword}
              </span>
            </div>
          );
        })}
      </AbsoluteFill>

      {/* Handoff wash from montage white-out */}
      <AbsoluteFill
        style={{ background: "#F6EFFF", opacity: openWash, pointerEvents: "none" }}
      />
    </SceneFrame>
  );
};
