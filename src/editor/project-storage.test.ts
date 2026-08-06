import {describe, expect, it} from "vitest";
import {
  LEGACY_PROJECT_KEY,
  PROJECT_LIBRARY_KEY,
  createBlankProject,
  createProjectFile,
  createStoredProject,
  getStoredProject,
  importProjectValue,
  loadProjectLibrary,
  restoreRecoveryVersion,
  saveStoredProject,
} from "./project-storage";
import {sampleProject} from "./project";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const blankProject = (name = "Blank") => createBlankProject({name, width: 1920, height: 1080, fps: 30});

describe("project storage", () => {
  it("creates a blank project with standard tracks and no media", () => {
    const project = blankProject();
    expect(project.name).toBe("Blank");
    expect(project.clips).toEqual([]);
    expect(project.media).toEqual([]);
    expect(project.tracks.map((track) => track.id)).toEqual(["c1", "v3", "v2", "v1", "a1", "a2"]);
    expect(project.durationInFrames).toBe(9000);
  });

  it("migrates the legacy single-project save exactly once", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_PROJECT_KEY, JSON.stringify({...sampleProject, name: "Legacy Cut"}));

    const library = loadProjectLibrary(storage);

    expect(library.projects).toHaveLength(1);
    expect(library.projects[0].project.name).toBe("Legacy Cut");
    expect(storage.getItem(LEGACY_PROJECT_KEY)).toBeNull();
    expect(storage.getItem(PROJECT_LIBRARY_KEY)).not.toBeNull();
    expect(loadProjectLibrary(storage).projects).toHaveLength(1);
  });

  it("keeps edits isolated between multiple projects", () => {
    const storage = new MemoryStorage();
    loadProjectLibrary(storage);
    const first = createStoredProject(blankProject("First"), storage);
    const second = createStoredProject(blankProject("Second"), storage);
    const editedFirst = first.project;
    editedFirst.markers.push({id: "marker-1", frame: 30, label: "Only first", color: "#ffffff"});

    saveStoredProject(first.id, editedFirst, {manual: true}, storage);

    expect(getStoredProject(first.id, storage)?.project.markers).toHaveLength(1);
    expect(getStoredProject(second.id, storage)?.project.markers).toHaveLength(0);
  });

  it("creates and restores autosave recovery versions", () => {
    const storage = new MemoryStorage();
    loadProjectLibrary(storage);
    const record = createStoredProject(blankProject("Recoverable"), storage);
    const changed = record.project;
    changed.markers.push({id: "marker-1", frame: 45, label: "New marker", color: "#ffffff"});

    const saved = saveStoredProject(record.id, changed, {now: record.updatedAt + 31_000}, storage);
    expect(saved.recoveryVersions).toHaveLength(1);
    expect(saved.project.markers).toHaveLength(1);

    const restored = restoreRecoveryVersion(record.id, saved.recoveryVersions[0].id, storage);
    expect(restored.project.markers).toHaveLength(0);
    expect(restored.recoveryVersions[0].project.markers).toHaveLength(1);
  });

  it("imports current envelopes and legacy raw project JSON", () => {
    const project = blankProject("Portable");
    expect(importProjectValue(createProjectFile(project)).name).toBe("Portable");
    expect(importProjectValue(project).name).toBe("Portable");
  });
});
