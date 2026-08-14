import {describe, expect, it} from "vitest";
import {createBlankProject} from "./project-storage";
import {canNestSequence, createSequence, switchActiveSequence, syncActiveSequence} from "./sequences";
import {DEFAULT_EFFECTS, DEFAULT_TRANSFORM} from "./types";

describe("multiple and nested sequences", () => {
  it("preserves edits when switching between independent sequences", () => {
    const first = createBlankProject({name: "Film", width: 1920, height: 1080, fps: 30});
    first.markers.push({id: "first-marker", frame: 30, label: "First", color: "#fff"});
    const second = createSequence(first, "B Roll");
    const combined = syncActiveSequence({...first, sequences: [...first.sequences, second]});

    const onSecond = switchActiveSequence(combined, second.id);
    onSecond.markers.push({id: "second-marker", frame: 60, label: "Second", color: "#fff"});
    const backOnFirst = switchActiveSequence(onSecond, first.activeSequenceId);

    expect(backOnFirst.markers.map((marker) => marker.id)).toEqual(["first-marker"]);
    expect(backOnFirst.sequences.find((sequence) => sequence.id === second.id)?.markers.map((marker) => marker.id)).toEqual(["second-marker"]);
  });

  it("rejects direct and transitive nesting cycles", () => {
    const project = createBlankProject({name: "Film", width: 1920, height: 1080, fps: 30});
    const second = createSequence(project, "B Roll");
    project.sequences.push(second);
    expect(canNestSequence(project, project.activeSequenceId)).toBe(false);
    expect(canNestSequence(project, second.id)).toBe(true);
    second.clips.push({
      id: "nested-a", name: "Sequence 01", kind: "sequence", nestedSequenceId: project.activeSequenceId,
      trackId: "v1", start: 0, duration: 30, sourceStart: 0, color: "#7f68d9", volume: 1,
      fadeIn: 0, fadeOut: 0, audioMuted: false, transform: {...DEFAULT_TRANSFORM}, effects: {...DEFAULT_EFFECTS}, keyframes: [],
    });
    expect(canNestSequence(project, second.id)).toBe(false);
  });
});
