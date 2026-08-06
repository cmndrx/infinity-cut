import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("editor video playback", () => {
  it("uses the native preview path without pausing the sequence clock for decoder buffering", () => {
    const source = readFileSync("src/editor/EditorComposition.tsx", "utf8");

    expect(source).toContain("OffthreadVideo");
    expect(source).toContain("pauseWhenBuffering={false}");
    expect(source).not.toContain('import {Audio, Video} from "@remotion/media"');
  });

  it("keeps Player input props stable while the transport timecode updates", () => {
    const source = readFileSync("src/editor/App.tsx", "utf8");

    expect(source).toContain("const playerInputProps = useMemo(() => ({project}), [project]);");
    expect(source).toContain("inputProps={playerInputProps}");
    expect(source).not.toContain("inputProps={{project}}");
  });
});
