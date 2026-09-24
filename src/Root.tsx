import {Composition} from "remotion";
import {EditorComposition} from "./editor/EditorComposition";
import {createEmptyProject} from "./editor/project";
const project = createEmptyProject();
export const RemotionRoot = () => <Composition id="InfinityCutExport" component={EditorComposition} durationInFrames={project.durationInFrames} fps={project.fps} width={project.width} height={project.height} defaultProps={{project}} calculateMetadata={({props}) => ({durationInFrames: props.project.durationInFrames, fps: props.project.fps, width: props.project.width, height: props.project.height})} />;
