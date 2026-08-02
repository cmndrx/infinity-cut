import { Audio, interpolate, Sequence, staticFile } from "remotion";
import {
  SCENE_2_START,
  SCENE_3_START,
  SCENE_4_START,
  SCENE_5_START,
  SCENE_6_START,
} from "../timeline";

const sfx = (name: string) => staticFile(`audio/sfx/${name}`);
const synth = (name: string) => staticFile(`audio/synth/${name}`);

const IMPACT_2 = SCENE_2_START + 34; // "CHANGES EVERYTHING" slam
const MONTAGE_CUTS = [0, 28, 50, 66, 82, 98].map((f) => SCENE_3_START + f);

type Cue = {
  src: string;
  frame: number;
  volume: number;
};

// Every beat in the trailer, expressed as (sound, frame, gain).
// The musical arc (drone, pulses, risers, aftermath pad) lives in the
// score bed itself — these cues are the transient layer on top.
const cues: Cue[] = [
  // Scene 1 — title letters begin to rise
  { src: sfx("sfx-swoosh-in.mp3"), frame: 20, volume: 0.22 },

  // Scene 2 — holo panels materialize, then the slam
  { src: sfx("sfx-swoosh-out.mp3"), frame: SCENE_2_START, volume: 0.3 },
  { src: sfx("sfx-cards-woosh.mp3"), frame: SCENE_2_START + 6, volume: 0.45 },
  { src: sfx("sfx-cards-woosh.mp3"), frame: SCENE_2_START + 12, volume: 0.4 },
  { src: sfx("sfx-cards-woosh.mp3"), frame: SCENE_2_START + 18, volume: 0.45 },
  { src: sfx("sfx-cards-woosh.mp3"), frame: SCENE_2_START + 24, volume: 0.4 },
  { src: synth("boom-big.wav"), frame: IMPACT_2, volume: 0.78 },
  { src: sfx("anime-hit-sfx.mp3"), frame: IMPACT_2, volume: 0.5 },

  // Scene 3 — a whoosh on every cut, character on the hero beats
  { src: sfx("card-shuffle-sfx.mp3"), frame: MONTAGE_CUTS[0], volume: 0.7 },
  { src: synth("sub-drop.wav"), frame: MONTAGE_CUTS[0], volume: 0.6 },
  { src: sfx("sfx-swoosh-out.mp3"), frame: MONTAGE_CUTS[1], volume: 0.5 },
  { src: sfx("sfx-attack-blast.mp3"), frame: MONTAGE_CUTS[1], volume: 0.55 },
  { src: sfx("sfx-swoosh-out.mp3"), frame: MONTAGE_CUTS[2], volume: 0.5 },
  { src: synth("sub-drop.wav"), frame: MONTAGE_CUTS[2], volume: 0.5 },
  { src: sfx("sfx-swoosh-out.mp3"), frame: MONTAGE_CUTS[3], volume: 0.5 },
  { src: sfx("sfx-tokens.mp3"), frame: MONTAGE_CUTS[3], volume: 0.55 },
  { src: sfx("sfx-swoosh-out.mp3"), frame: MONTAGE_CUTS[4], volume: 0.5 },
  { src: synth("sub-drop.wav"), frame: MONTAGE_CUTS[4], volume: 0.5 },
  { src: sfx("sfx-cards-woosh.mp3"), frame: MONTAGE_CUTS[5], volume: 0.55 },
  { src: sfx("sfx-swoosh-out.mp3"), frame: MONTAGE_CUTS[5], volume: 0.45 },

  // Scene 4 — white-out handoff, logo forms, caption ticks
  { src: synth("boom-big.wav"), frame: SCENE_4_START, volume: 0.85 },
  { src: sfx("sfx-buff.mp3"), frame: SCENE_4_START + 12, volume: 0.5 },
  { src: sfx("sfx-menu-button.mp3"), frame: SCENE_4_START + 58, volume: 0.2 },
  { src: sfx("sfx-menu-button.mp3"), frame: SCENE_4_START + 92, volume: 0.2 },
  { src: sfx("sfx-menu-button.mp3"), frame: SCENE_4_START + 122, volume: 0.2 },

  // Scene 5 — the biggest hit in the track
  { src: synth("boom-huge.wav"), frame: SCENE_5_START, volume: 0.85 },
  { src: sfx("anime-hit-sfx.mp3"), frame: SCENE_5_START, volume: 0.45 },
  { src: sfx("sfx-buff.mp3"), frame: SCENE_5_START + 22, volume: 0.32 },

  // Scene 6 — CTA steps
  { src: sfx("sfx-swoosh-in.mp3"), frame: SCENE_6_START, volume: 0.32 },
  { src: sfx("sfx-tokens.mp3"), frame: SCENE_6_START + 6, volume: 0.45 },
  { src: sfx("sfx-menu-button.mp3"), frame: SCENE_6_START + 24, volume: 0.28 },
];

/**
 * Temp score + sound design. The score bed (public/audio/synth/score-bed.wav)
 * is a synthesized placeholder timed to the hit map — swap that one file for
 * a licensed track at launch and the SFX cues stay valid.
 */
export const TrailerAudio: React.FC = () => {
  return (
    <>
      {/* Score bed, ducked under the two biggest hits for headroom */}
      <Audio
        src={synth("score-bed.wav")}
        volume={(f) =>
          interpolate(
            f,
            [
              IMPACT_2 - 2, IMPACT_2, IMPACT_2 + 14,
              SCENE_5_START - 4, SCENE_5_START, SCENE_5_START + 22,
            ],
            [0.9, 0.55, 0.9, 0.9, 0.5, 0.9],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />
      {cues.map((cue, i) => (
        <Sequence key={`${cue.src}-${cue.frame}-${i}`} from={cue.frame}>
          <Audio src={cue.src} volume={() => cue.volume} />
        </Sequence>
      ))}
    </>
  );
};
