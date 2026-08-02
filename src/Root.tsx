import "./index.css";
import { Composition } from "remotion";
import { SeasonThreeTrailer } from "./Composition";
import {
  TRAILER_DURATION_FRAMES,
  TRAILER_FPS,
  TRAILER_HEIGHT,
  TRAILER_WIDTH,
} from "./config";
import { GameLibraryTrailer } from "./game-library-trailer/GameLibraryTrailer";
import {
  GAME_LIBRARY_DURATION_FRAMES,
  GAME_LIBRARY_FPS,
  GAME_LIBRARY_HEIGHT,
  GAME_LIBRARY_WIDTH,
} from "./game-library-trailer/config";

import { TestProject } from "./TestProject";
import {EditorComposition} from "./editor/EditorComposition";
import {sampleProject} from "./editor/project";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Season3LaunchTrailer"
        component={SeasonThreeTrailer}
        durationInFrames={TRAILER_DURATION_FRAMES}
        fps={TRAILER_FPS}
        width={TRAILER_WIDTH}
        height={TRAILER_HEIGHT}
      />
      <Composition
        id="GameLibraryLaunchTrailer"
        component={GameLibraryTrailer}
        durationInFrames={GAME_LIBRARY_DURATION_FRAMES}
        fps={GAME_LIBRARY_FPS}
        width={GAME_LIBRARY_WIDTH}
        height={GAME_LIBRARY_HEIGHT}
      />
      <Composition
        id="TestProject"
        component={TestProject}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="InfinityCutExport"
        component={EditorComposition}
        durationInFrames={sampleProject.durationInFrames}
        fps={sampleProject.fps}
        width={sampleProject.width}
        height={sampleProject.height}
        defaultProps={{project: sampleProject}}
        calculateMetadata={({props}) => ({
          durationInFrames: props.project.durationInFrames,
          fps: props.project.fps,
          width: props.project.width,
          height: props.project.height,
        })}
      />
    </>
  );
};
