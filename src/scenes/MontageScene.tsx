import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Flash } from "../components/ImpactFX";
import { SceneFrame } from "../components/SceneFrame";
import { BODY_FONT } from "../fonts";

type Cut = {
  id: string;
  src: string;
  label: string;
  from: number;
  duration: number;
  trimBefore: number;
  playbackRate?: number;
  zoomFrom: number;
  zoomTo: number;
  originX?: string;
  originY?: string;
};

// Full-bleed rapid cuts. Nothing stays readable for long except the two
// hero beats (pack rip, battle) — recognition and excitement, not explanation.
const cuts: Cut[] = [
  {
    id: "pack",
    src: staticFile("gameplay/open-pack-video.mov"),
    label: "Rip the Pack",
    from: 0,
    duration: 28,
    trimBefore: 185,
    zoomFrom: 1.14,
    zoomTo: 1.24,
    originX: "46%",
    originY: "40%",
  },
  {
    id: "battle",
    src: staticFile("gameplay/battle-video.mov"),
    label: "Enter the Arena",
    from: 28,
    duration: 22,
    trimBefore: 22,
    zoomFrom: 1.16,
    zoomTo: 1.06,
  },
  {
    id: "level",
    src: staticFile("gameplay/player-level-view.mov"),
    label: "Level Up",
    from: 50,
    duration: 16,
    trimBefore: 168,
    zoomFrom: 1.06,
    zoomTo: 1.16,
    originX: "38%",
  },
  {
    id: "store",
    src: staticFile("gameplay/store-video.mov"),
    label: "Raid the Store",
    from: 66,
    duration: 16,
    trimBefore: 54,
    zoomFrom: 1.18,
    zoomTo: 1.08,
    originX: "62%",
  },
  {
    id: "ranks",
    src: staticFile("gameplay/leaderboards-video.mov"),
    label: "Climb the Ranks",
    from: 82,
    duration: 16,
    trimBefore: 36,
    zoomFrom: 1.06,
    zoomTo: 1.15,
  },
  {
    id: "deck",
    src: staticFile("gameplay/decksmith-view.mov"),
    label: "Forge Your Deck",
    from: 98,
    duration: 14,
    trimBefore: 4,
    zoomFrom: 1.1,
    zoomTo: 1.22,
  },
];

const RAMP_START = 112; // final white-out acceleration into the logo build

export const MontageScene: React.FC = () => {
  const frame = useCurrentFrame();

  const rampWhite = interpolate(frame, [RAMP_START, 119], [0, 1], {
    easing: Easing.in(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rampBlur = rampWhite * 14;
  const rampScale = 1 + rampWhite * 0.16;

  return (
    <SceneFrame>
      <AbsoluteFill
        style={{
          transform: `scale(${rampScale})`,
          filter: rampBlur > 0.2 ? `blur(${rampBlur}px)` : undefined,
        }}
      >
        {cuts.map((cut) => {
          const zoom = interpolate(
            frame,
            [cut.from, cut.from + cut.duration],
            [cut.zoomFrom, cut.zoomTo],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const labelIn = interpolate(frame, [cut.from + 3, cut.from + 8], [0, 1], {
            easing: Easing.out(Easing.cubic),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <Sequence
              key={cut.id}
              from={cut.from}
              durationInFrames={cut.duration + 2}
              premountFor={40}
            >
              <AbsoluteFill style={{ overflow: "hidden", background: "#05040a" }}>
                <AbsoluteFill
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: `${cut.originX ?? "50%"} ${cut.originY ?? "50%"}`,
                  }}
                >
                  <Video
                    src={cut.src}
                    muted
                    trimBefore={cut.trimBefore}
                    playbackRate={cut.playbackRate ?? 1}
                    objectFit="cover"
                    style={{ width: "100%", height: "100%" }}
                  />
                </AbsoluteFill>

                {/* Duotone trailer grade */}
                <AbsoluteFill
                  style={{
                    background:
                      "linear-gradient(118deg, rgba(88,44,160,0.32) 0%, rgba(20,8,42,0.08) 38%, rgba(247,201,72,0.1) 100%)",
                    mixBlendMode: "overlay",
                  }}
                />
                <AbsoluteFill
                  style={{
                    background:
                      "radial-gradient(ellipse at 50% 50%, rgba(5,4,10,0) 58%, rgba(5,4,10,0.55) 100%)",
                  }}
                />

                {/* Kinetic label */}
                <div
                  style={{
                    position: "absolute",
                    left: 132,
                    bottom: 158,
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    opacity: labelIn,
                    transform: `translateX(${(1 - labelIn) * -44}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 46,
                      background:
                        "linear-gradient(180deg, #FFE9A3 0%, #F7C948 60%, #B97A1B 100%)",
                      boxShadow: "0 0 18px rgba(247,201,72,0.7)",
                    }}
                  />
                  <div
                    style={{
                      fontFamily: BODY_FONT,
                      fontSize: 34,
                      fontWeight: 800,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      color: "#fff",
                      textShadow:
                        "0 2px 14px rgba(0,0,0,0.8), 0 0 34px rgba(168,85,247,0.5)",
                    }}
                  >
                    {cut.label}
                  </div>
                </div>
              </AbsoluteFill>
            </Sequence>
          );
        })}

        {/* Flash frames on every cut */}
        {cuts.slice(1).map((cut) => (
          <Flash key={`flash-${cut.id}`} at={cut.from} duration={5} peak={0.55} />
        ))}
      </AbsoluteFill>

      {/* Speed-ramp white-out into the logo build */}
      <AbsoluteFill
        style={{
          background: "#F6EFFF",
          opacity: rampWhite,
          pointerEvents: "none",
        }}
      />
    </SceneFrame>
  );
};
