import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";
import {
  CTA_START,
  LIBRARY_HERO_START,
  LIBRARY_INTERFACE_START,
  MONTAGE_START,
} from "./config";
import { GAME_WORLDS } from "./data";

type SoundCue = {
  src: string;
  frame: number;
  volume: number;
};

const sfx = (name: string) => staticFile(`audio/sfx/${name}`);
const synthSfx = (name: string) => staticFile(`audio/synth/${name}`);
const GAMEPLAY_REVEAL_OFFSET = 42;

// Sound effects only. There is intentionally no score or music bed.
const cues: SoundCue[] = [
  { src: sfx("sfx-swoosh-in.mp3"), frame: 20, volume: 0.28 },
  { src: synthSfx("boom-big.wav"), frame: 72, volume: 0.76 },
  { src: sfx("anime-hit-sfx.mp3"), frame: 72, volume: 0.34 },
  { src: synthSfx("sub-drop.wav"), frame: MONTAGE_START, volume: 0.58 },
  { src: sfx("sfx-swoosh-out.mp3"), frame: MONTAGE_START, volume: 0.48 },
  ...GAME_WORLDS.map((world) => ({
    src: sfx("sfx-swoosh-in.mp3"),
    frame: MONTAGE_START + world.montageStart + GAMEPLAY_REVEAL_OFFSET,
    volume: 0.25,
  })),
  {
    src: sfx("sfx-swoosh-out.mp3"),
    frame: MONTAGE_START + GAME_WORLDS[1].montageStart,
    volume: 0.46,
  },
  {
    src: sfx("sfx-tokens.mp3"),
    frame: MONTAGE_START + GAME_WORLDS[1].montageStart + 8,
    volume: 0.48,
  },
  {
    src: sfx("sfx-attack-blast.mp3"),
    frame: MONTAGE_START + GAME_WORLDS[2].montageStart,
    volume: 0.6,
  },
  {
    src: sfx("anime-hit-sfx.mp3"),
    frame: MONTAGE_START + GAME_WORLDS[2].montageStart + 8,
    volume: 0.42,
  },
  {
    src: sfx("sfx-swoosh-out.mp3"),
    frame: MONTAGE_START + GAME_WORLDS[3].montageStart,
    volume: 0.48,
  },
  {
    src: sfx("sfx-menu-button.mp3"),
    frame: MONTAGE_START + GAME_WORLDS[3].montageStart + 14,
    volume: 0.3,
  },
  {
    src: synthSfx("boom-big.wav"),
    frame: MONTAGE_START + GAME_WORLDS[4].montageStart,
    volume: 0.68,
  },
  {
    src: sfx("sfx-attack-blast.mp3"),
    frame: MONTAGE_START + GAME_WORLDS[4].montageStart + 7,
    volume: 0.42,
  },
  { src: sfx("sfx-swoosh-in.mp3"), frame: LIBRARY_INTERFACE_START, volume: 0.42 },
  {
    src: sfx("sfx-menu-button.mp3"),
    frame: LIBRARY_INTERFACE_START + 22,
    volume: 0.24,
  },
  { src: synthSfx("boom-huge.wav"), frame: LIBRARY_HERO_START, volume: 0.86 },
  { src: sfx("anime-hit-sfx.mp3"), frame: LIBRARY_HERO_START, volume: 0.44 },
  { src: sfx("sfx-buff.mp3"), frame: LIBRARY_HERO_START + 18, volume: 0.34 },
  { src: sfx("sfx-swoosh-in.mp3"), frame: CTA_START, volume: 0.32 },
  { src: sfx("sfx-tokens.mp3"), frame: CTA_START + 10, volume: 0.5 },
  { src: sfx("sfx-menu-button.mp3"), frame: CTA_START + 40, volume: 0.3 },
];

export const LibrarySoundDesign: React.FC = () => {
  return (
    <>
      {cues.map((cue, index) => (
        <Sequence
          key={`${cue.src}-${cue.frame}-${index}`}
          from={cue.frame}
          premountFor={30}
        >
          <Audio src={cue.src} volume={() => cue.volume} />
        </Sequence>
      ))}
    </>
  );
};
