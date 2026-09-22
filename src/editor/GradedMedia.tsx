import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {cancelRender, getRemotionEnvironment, Img, OffthreadVideo} from "remotion";
import type {ColorGrade, ProjectLut} from "./types";
import {buildGradeTexture} from "./grade-texture";
import {createGradeRenderer} from "./grade-gpu";

type VideoProps = React.ComponentProps<typeof OffthreadVideo>;
export const GradedMedia: React.FC<{grade: ColorGrade; luts: ProjectLut[]; kind: "video" | "image"; media: VideoProps}> = ({grade, luts, kind, media}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastFrame = useRef<TexImageSource | null>(null);
  const renderer = useRef<ReturnType<typeof createGradeRenderer> | null>(null);
  const [error, setError] = useState<string>();
  const compiled = useMemo(() => {
    try { return {data: buildGradeTexture(grade, luts)}; }
    catch (cause) { return {error: cause instanceof Error ? cause.message : "Color processing failed"}; }
  }, [grade, luts]);
  const fail = useCallback((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (getRemotionEnvironment().isRendering) cancelRender(new Error(message));
    setError(message);
  }, []);
  const draw = useCallback((frame: TexImageSource) => {
    lastFrame.current = frame;
    try {
      if (!canvas.current) return;
      if (!compiled.data) throw new Error(compiled.error);
      const size = frame as {videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; width?: number; height?: number};
      const width = size.videoWidth || size.naturalWidth || size.width || 1;
      const height = size.videoHeight || size.naturalHeight || size.height || 1;
      if (canvas.current.width !== width) canvas.current.width = width;
      if (canvas.current.height !== height) canvas.current.height = height;
      renderer.current ??= createGradeRenderer(canvas.current, compiled.data);
      renderer.current.draw(frame);
      setError(undefined);
    } catch (cause) { fail(cause); }
  }, [compiled, fail]);
  useEffect(() => {
    renderer.current?.dispose(); renderer.current = null;
    if (lastFrame.current) draw(lastFrame.current);
    return () => { renderer.current?.dispose(); renderer.current = null; };
  }, [draw]);
  return <>
    {kind === "video" ? <OffthreadVideo {...media} style={{...media.style, opacity: 0}} onVideoFrame={(frame) => draw(frame as TexImageSource)} /> : <Img src={media.src} crossOrigin="anonymous" style={{...media.style, opacity: 0}} onLoad={(event) => draw(event.currentTarget)} />}
    <canvas ref={canvas} style={{...media.style, objectFit: "cover", pointerEvents: "none"}} />
    {(error || compiled.error) && <div role="alert" style={{position: "absolute", inset: 20, background: "#340919", color: "white", padding: 20}}>COLOR RENDER ERROR: {error || compiled.error}</div>}
  </>;
};
