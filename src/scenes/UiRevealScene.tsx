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
import { Background } from "../components/Background";
import { GoldText } from "../components/GoldText";
import { ChromaticImpact, Flash, Shockwave } from "../components/ImpactFX";
import { SceneFrame } from "../components/SceneFrame";
import { ICE_TEXT_GRADIENT } from "../config";
import { BODY_FONT, DISPLAY_FONT } from "../fonts";

const IMPACT_FRAME = 34;

type HoloPanel = {
  src: string;
  label: string;
  width: number;
  delay: number;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  tilt: number;
};

const holoPanels: HoloPanel[] = [
  {
    src: staticFile("infinft-assets/cards/cardpack-season-2-booster.png"),
    label: "Booster Packs",
    width: 196,
    delay: 6,
    top: 138,
    left: 168,
    tilt: -6,
  },
  {
    src: staticFile("infinft-assets/cards/back-of-card.png"),
    label: "Card Reveals",
    width: 182,
    delay: 12,
    top: 142,
    right: 184,
    tilt: 6,
  },
  {
    src: staticFile("infinft-assets/ui/deck-closed.png"),
    label: "Deck Loadouts",
    width: 178,
    delay: 18,
    bottom: 148,
    left: 178,
    tilt: 5,
  },
  {
    src: staticFile("infinft-assets/ui/battleboard-main-h.png"),
    label: "Battle Arena",
    width: 384,
    delay: 24,
    bottom: 158,
    right: 140,
    tilt: -4,
  },
];

const streaks = Array.from({ length: 12 }).map((_, i) => ({
  y: 150 + random(`streak-y${i}`) * 760,
  speed: 26 + random(`streak-s${i}`) * 34,
  offset: random(`streak-o${i}`) * 2600,
  width: 320 + random(`streak-w${i}`) * 420,
  tilt: -10 + random(`streak-t${i}`) * 4,
  gold: random(`streak-g${i}`) < 0.2,
}));

/**
 * Scene 2 — particles accelerate into light streaks, the game's real UI
 * assembles as holographic panels, then "CHANGES EVERYTHING" hits.
 */
export const UiRevealScene: React.FC = () => {
  const frame = useCurrentFrame();

  const accel = interpolate(frame, [0, 90], [0.7, 2.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const gridOpacity = interpolate(frame, [0, 26], [0, 0.5], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title impact: slam + chroma split + micro-shake.
  const slam = interpolate(frame, [IMPACT_FRAME, IMPACT_FRAME + 7], [1.4, 1], {
    easing: Easing.bezier(0.12, 0.9, 0.24, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleOpacity = interpolate(frame, [IMPACT_FRAME, IMPACT_FRAME + 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleBlur = interpolate(frame, [IMPACT_FRAME, IMPACT_FRAME + 6], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chroma = interpolate(frame, [IMPACT_FRAME, IMPACT_FRAME + 10], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shakeAmp = interpolate(frame, [IMPACT_FRAME, IMPACT_FRAME + 12], [9, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shakeX = noise2D("shake2x", frame * 0.9, 0) * shakeAmp;
  const shakeY = noise2D("shake2y", 0, frame * 0.9) * shakeAmp;
  const settle = interpolate(frame, [IMPACT_FRAME + 7, 90], [1, 1.025], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shine = interpolate(frame, [IMPACT_FRAME + 14, IMPACT_FRAME + 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame>
      <AbsoluteFill style={{ transform: `translate(${shakeX}px, ${shakeY}px)` }}>
        <Background glowOpacity={0.65} particleCount={44} seed="ui" />

        {/* Perspective grid floor */}
        <div
          style={{
            position: "absolute",
            left: -300,
            right: -300,
            bottom: -160,
            height: 560,
            transform: "perspective(760px) rotateX(63deg)",
            transformOrigin: "50% 100%",
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(168,85,247,0.4) 0px, rgba(168,85,247,0.4) 1.5px, transparent 1.5px, transparent 72px), repeating-linear-gradient(90deg, rgba(168,85,247,0.28) 0px, rgba(168,85,247,0.28) 1.5px, transparent 1.5px, transparent 72px)",
            backgroundPositionY: `${frame * 3.4}px`,
            WebkitMaskImage:
              "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 46%, #000 100%)",
            maskImage:
              "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 46%, #000 100%)",
            opacity: gridOpacity,
          }}
        />
        {/* Horizon glow above the grid */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 220,
            height: 200,
            background:
              "radial-gradient(ellipse at 50% 100%, rgba(168,85,247,0.22) 0%, rgba(5,4,10,0) 68%)",
            opacity: gridOpacity,
          }}
        />

        {/* Accelerating light streaks */}
        {streaks.map((s, i) => {
          const x = ((s.offset + frame * s.speed * accel) % 2800) - 700;
          const centerFade = 1 - Math.abs(x - 700) / 1500;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: s.y,
                width: s.width,
                height: 2.5,
                borderRadius: 999,
                transform: `rotate(${s.tilt}deg)`,
                background: s.gold
                  ? "linear-gradient(90deg, rgba(247,201,72,0), rgba(255,233,163,0.9), rgba(247,201,72,0))"
                  : "linear-gradient(90deg, rgba(168,85,247,0), rgba(216,180,254,0.85), rgba(168,85,247,0))",
                boxShadow: s.gold
                  ? "0 0 18px rgba(247,201,72,0.5)"
                  : "0 0 18px rgba(168,85,247,0.55)",
                opacity: Math.max(0, centerFade) * 0.6,
                mixBlendMode: "screen",
              }}
            />
          );
        })}

        {/* Expanding concentric rings behind the title */}
        {[0, 1, 2].map((i) => {
          const start = 6 + i * 9;
          const p = interpolate(frame, [start, start + 46], [0, 1], {
            easing: Easing.out(Easing.cubic),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={`ring-${i}`}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 240 + p * 1500,
                height: (240 + p * 1500) * 0.62,
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                border: "1px solid rgba(192,132,252,0.5)",
                opacity: (1 - p) * 0.5,
                mixBlendMode: "screen",
              }}
            />
          );
        })}

        {/* Holographic UI panels — real game assets */}
        {holoPanels.map((panel) => {
          const p = interpolate(frame, [panel.delay, panel.delay + 20], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const bob = noise2D(`bob-${panel.label}`, frame * 0.02, 0) * 5;
          const scanY = interpolate(
            frame,
            [panel.delay + 4, panel.delay + 26],
            [-10, 110],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          return (
            <div
              key={panel.label}
              style={{
                position: "absolute",
                top: panel.top,
                right: panel.right,
                bottom: panel.bottom,
                left: panel.left,
                width: panel.width,
                opacity: p,
                transform: `translateY(${(1 - p) * 40 + bob}px) rotate(${panel.tilt * (1 - p * 0.4)}deg)`,
              }}
            >
              {/* Holo glow */}
              <div
                style={{
                  position: "absolute",
                  inset: -26,
                  background:
                    "radial-gradient(ellipse, rgba(168,85,247,0.3) 0%, rgba(5,4,10,0) 70%)",
                  filter: "blur(16px)",
                }}
              />
              <div
                style={{
                  position: "relative",
                  clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
                  filter: "drop-shadow(0 14px 34px rgba(0,0,0,0.55))",
                }}
              >
                <Img
                  src={panel.src}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
                {/* Scanline sweep during materialization */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: `${scanY}%`,
                    height: 3,
                    background:
                      "linear-gradient(90deg, rgba(233,213,255,0), rgba(233,213,255,0.9), rgba(233,213,255,0))",
                    boxShadow: "0 0 16px rgba(192,132,252,0.8)",
                    opacity: scanY > 105 ? 0 : 0.85,
                  }}
                />
              </div>
              {/* Corner brackets */}
              {[
                { top: -10, left: -10, bw: "2px 0 0 2px" },
                { top: -10, right: -10, bw: "2px 2px 0 0" },
                { bottom: -10, left: -10, bw: "0 0 2px 2px" },
                { bottom: -10, right: -10, bw: "0 2px 2px 0" },
              ].map((c, ci) => (
                <div
                  key={ci}
                  style={{
                    position: "absolute",
                    width: 18,
                    height: 18,
                    top: c.top,
                    left: c.left,
                    right: c.right,
                    bottom: c.bottom,
                    borderStyle: "solid",
                    borderColor: "rgba(192,132,252,0.85)",
                    borderWidth: c.bw,
                    opacity: p,
                  }}
                />
              ))}
              <div
                style={{
                  marginTop: 16,
                  textAlign: "center",
                  fontFamily: BODY_FONT,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "0.24em",
                  textTransform: "uppercase",
                  color: "rgba(233,213,255,0.85)",
                  textShadow: "0 0 16px rgba(168,85,247,0.6)",
                  paddingLeft: "0.24em",
                }}
              >
                {panel.label}
              </div>
            </div>
          );
        })}

        {/* Impact title */}
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div
            style={{
              transform: `scale(${slam * settle})`,
              opacity: titleOpacity,
              filter: `blur(${titleBlur}px)`,
            }}
          >
            <ChromaticImpact amount={chroma}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div
                  style={{
                    fontFamily: DISPLAY_FONT,
                    fontSize: 86,
                    fontWeight: 800,
                    letterSpacing: "0.3em",
                    textTransform: "uppercase",
                    background: ICE_TEXT_GRADIENT,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    filter: "drop-shadow(0 0 30px rgba(192,132,252,0.5))",
                    paddingLeft: "0.3em",
                  }}
                >
                  Changes
                </div>
                <GoldText fontSize={138} letterSpacing="0.05em" shineProgress={shine} glow={0.7}>
                  Everything
                </GoldText>
              </div>
            </ChromaticImpact>
          </div>
        </AbsoluteFill>

        <Shockwave at={IMPACT_FRAME} maxRadius={1500} color="192,132,252" />
        <Shockwave at={IMPACT_FRAME + 3} maxRadius={1100} color="247,201,72" />
      </AbsoluteFill>

      <Flash at={IMPACT_FRAME} duration={9} peak={0.75} color="228,208,255" />

      {/* Dark edges keep focus center-frame */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(5,4,10,0) 55%, rgba(5,4,10,0.5) 92%)",
        }}
      />
    </SceneFrame>
  );
};
