import React, {useMemo, useRef, useState} from "react";
import {
  ArchiveRestore,
  Clapperboard,
  Clock3,
  Copy,
  FileInput,
  Film,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {EditorApp} from "./App";
import {formatFrameRate} from "./frame-rate";
import {
  createBlankProject,
  createStoredProject,
  deleteStoredProject,
  duplicateStoredProject,
  importProjectValue,
  loadProjectLibrary,
  renameStoredProject,
  restoreRecoveryVersion,
  type NewProjectSettings,
  type StoredProject,
} from "./project-storage";

const DEFAULT_SETTINGS: NewProjectSettings = {
  name: "Untitled Project",
  width: 1920,
  height: 1080,
  fps: 30,
};

const formatUpdatedAt = (value: number) => new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(value);

const projectDuration = (record: StoredProject) => {
  const seconds = Math.round(record.project.durationInFrames / record.project.fps);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

export const ProjectHome: React.FC = () => {
  const [library, setLibrary] = useState(loadProjectLibrary);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newSettings, setNewSettings] = useState<NewProjectSettings>(DEFAULT_SETTINGS);
  const [recoveryProjectId, setRecoveryProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setLibrary(loadProjectLibrary());
  const activeRecord = activeProjectId ? library.projects.find((record) => record.id === activeProjectId) ?? null : null;
  const recoveryRecord = recoveryProjectId ? library.projects.find((record) => record.id === recoveryProjectId) ?? null : null;
  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...library.projects]
      .filter((record) => !normalized || record.project.name.toLowerCase().includes(normalized))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [library.projects, query]);

  const createProject = () => {
    try {
      const settings = {
        ...newSettings,
        name: newSettings.name.trim() || "Untitled Project",
        width: Math.max(320, Math.round(newSettings.width)),
        height: Math.max(240, Math.round(newSettings.height)),
        fps: Math.max(1, Math.round(newSettings.fps)),
      };
      const record = createStoredProject(createBlankProject(settings));
      refresh();
      setNewProjectOpen(false);
      setNewSettings(DEFAULT_SETTINGS);
      setActiveProjectId(record.id);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project could not be created");
    }
  };

  const importProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const project = importProjectValue(JSON.parse(await file.text()));
      const record = createStoredProject(project);
      refresh();
      setActiveProjectId(record.id);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That project file could not be opened");
    }
  };

  const renameProject = (record: StoredProject) => {
    const name = window.prompt("Rename project", record.project.name)?.trim();
    if (!name || name === record.project.name) return;
    try {
      renameStoredProject(record.id, name);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project could not be renamed");
    }
  };

  const duplicateProject = (record: StoredProject) => {
    try {
      const duplicate = duplicateStoredProject(record.id);
      refresh();
      setActiveProjectId(duplicate.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project could not be duplicated");
    }
  };

  const deleteProject = (record: StoredProject) => {
    if (!window.confirm(`Delete “${record.project.name}” from this browser? Imported media and exported videos are not deleted.`)) return;
    deleteStoredProject(record.id);
    refresh();
  };

  const recoverProject = (record: StoredProject, versionId: string) => {
    try {
      restoreRecoveryVersion(record.id, versionId);
      refresh();
      setRecoveryProjectId(null);
      setActiveProjectId(record.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recovery version could not be restored");
    }
  };

  if (activeRecord) {
    return (
      <EditorApp
        key={activeRecord.id}
        projectId={activeRecord.id}
        initialProject={activeRecord.project}
        onBackToProjects={() => {
          setActiveProjectId(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="project-home-shell">
      <header className="project-home-topbar">
        <div className="brand-lockup"><div className="brand-mark"><Clapperboard size={16} /></div><span>DIRECTORS <b>CUT PRO</b></span></div>
        <div className="project-home-actions">
          <input ref={importInputRef} className="hidden-input" type="file" accept=".json,.directors-cut.json,.infinity.json,application/json" onChange={(event) => void importProject(event)} />
          <button className="home-secondary-button" onClick={() => importInputRef.current?.click()}><FileInput size={15} /> Open project file</button>
          <button className="home-primary-button" onClick={() => setNewProjectOpen(true)}><Plus size={16} /> New project</button>
        </div>
      </header>

      <main className="project-home-main">
        <section className="project-home-hero">
          <div><span>PROJECT HOME</span><h1>Pick up where you left off.</h1><p>Create a clean sequence, reopen a recent edit, or import a Directors Cut Pro project file.</p></div>
          <div className="project-home-stat"><Film size={22} /><strong>{library.projects.length}</strong><span>{library.projects.length === 1 ? "local project" : "local projects"}</span></div>
        </section>

        {error && <div className="project-home-error"><span>{error}</span><button onClick={() => setError(null)}><X size={14} /></button></div>}

        <section className="recent-projects-section">
          <header>
            <div><h2>Recent projects</h2><span>Saved in this browser</span></div>
            <label className="project-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" /></label>
          </header>

          {visibleProjects.length ? (
            <div className="project-card-grid">
              {visibleProjects.map((record) => (
                <article className="project-card" key={record.id}>
                  <button className="project-card-preview" onClick={() => setActiveProjectId(record.id)}>
                    <div className="project-card-frame"><Film size={28} /><span>{record.project.width} × {record.project.height}</span></div>
                    <div className="project-card-copy"><strong>{record.project.name}</strong><span><Clock3 size={11} /> Edited {formatUpdatedAt(record.updatedAt)}</span></div>
                  </button>
                  <div className="project-card-meta"><span>{formatFrameRate(record.project.fps)} fps</span><span>{record.project.clips.length} clips</span><span>{projectDuration(record)}</span></div>
                  <div className="project-card-actions">
                    <button onClick={() => setActiveProjectId(record.id)}><FolderOpen size={13} /> Open</button>
                    <button onClick={() => duplicateProject(record)} title="Duplicate project"><Copy size={13} /></button>
                    {record.recoveryVersions.length ? <button onClick={() => setRecoveryProjectId(record.id)} title="Recovery versions"><ArchiveRestore size={13} /></button> : null}
                    <button onClick={() => renameProject(record)} title="Rename project"><MoreHorizontal size={14} /></button>
                    <button className="danger" onClick={() => deleteProject(record)} title="Delete project"><Trash2 size={13} /></button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="project-home-empty"><Film size={34} /><strong>{query ? "No matching projects" : "Create your first project"}</strong><span>{query ? "Try another project name." : "Choose a format and start with an empty timeline."}</span>{!query && <button onClick={() => setNewProjectOpen(true)}><Plus size={15} /> New project</button>}</div>
          )}
        </section>
      </main>

      {newProjectOpen && (
        <div className="project-home-overlay" onPointerDown={(event) => event.target === event.currentTarget && setNewProjectOpen(false)}>
          <section className="new-project-dialog" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
            <header><div><strong id="new-project-title">Create new project</strong><small>Start with a blank 5-minute sequence and a standard 3V / 2A track layout.</small></div><button onClick={() => setNewProjectOpen(false)}><X size={16} /></button></header>
            <div className="new-project-fields">
              <label className="wide"><span>Project name</span><input autoFocus value={newSettings.name} onChange={(event) => setNewSettings((current) => ({...current, name: event.target.value}))} onKeyDown={(event) => event.key === "Enter" && createProject()} /></label>
              <label className="wide"><span>Sequence preset</span><select value={`${newSettings.width}x${newSettings.height}`} onChange={(event) => {
                const [width, height] = event.target.value.split("x").map(Number);
                setNewSettings((current) => ({...current, width, height}));
              }}><option value="1920x1080">HD 1080p</option><option value="3840x2160">UHD 4K</option><option value="1080x1920">Vertical 1080 × 1920</option><option value="1080x1080">Square 1080 × 1080</option></select></label>
              <label><span>Width</span><input type="number" min={320} value={newSettings.width} onChange={(event) => setNewSettings((current) => ({...current, width: Number(event.target.value)}))} /></label>
              <label><span>Height</span><input type="number" min={240} value={newSettings.height} onChange={(event) => setNewSettings((current) => ({...current, height: Number(event.target.value)}))} /></label>
              <label className="wide"><span>Frame rate</span><select value={newSettings.fps} onChange={(event) => setNewSettings((current) => ({...current, fps: Number(event.target.value)}))}><option value={24}>24 fps</option><option value={25}>25 fps</option><option value={30}>30 fps</option><option value={50}>50 fps</option><option value={60}>60 fps</option></select></label>
            </div>
            <footer><button className="home-secondary-button" onClick={() => setNewProjectOpen(false)}>Cancel</button><button className="home-primary-button" onClick={createProject}><Plus size={15} /> Create project</button></footer>
          </section>
        </div>
      )}

      {recoveryRecord && (
        <div className="project-home-overlay" onPointerDown={(event) => event.target === event.currentTarget && setRecoveryProjectId(null)}>
          <section className="recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
            <header><div><strong id="recovery-title">Recovery versions</strong><small>{recoveryRecord.project.name}</small></div><button onClick={() => setRecoveryProjectId(null)}><X size={16} /></button></header>
            <div className="recovery-list">
              {recoveryRecord.recoveryVersions.map((version) => <button key={version.id} onClick={() => recoverProject(recoveryRecord, version.id)}><ArchiveRestore size={15} /><span><strong>{formatUpdatedAt(version.savedAt)}</strong><small>{version.project.clips.length} clips · {version.project.width} × {version.project.height}</small></span><b>Restore</b></button>)}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
