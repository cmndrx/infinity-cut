import {useCallback, useEffect, useRef, useState} from "react";
import {createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User} from "firebase/auth";
import {Clapperboard, Film, FolderOpen, Plus, Search} from "lucide-react";
import {auth} from "./firebase";
import {createProject, deleteProject, openProject, saveCloudProject, watchProjects, type SavedProject} from "./cloud";
import {createEmptyProject} from "./project";
import {EditorApp} from "./App";
import type {EditorProject} from "./types";
import "./accounts.css";

const message = (error: unknown) => error instanceof Error ? error.message.replace(/^Firebase: /, "") : "Something went wrong. Please try again.";
const Brand = () => <div className="dcp-brand"><Clapperboard size={23} /><span>DIRECTOR CUT <b>PRO</b></span></div>;

function SignIn() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(""); setNotice("");
    try {await action();} catch (e) {setError(message(e));} finally {setBusy(false);}
  };
  return <main className="dcp-auth dcp-shell"><section className="dcp-story"><Brand /><div><p className="dcp-eyebrow">YOUR NEXT GREAT CUT STARTS HERE</p><h1>Every idea.<br />Its own project.</h1><p>Your footage, timelines, and creative work.<br />Together in one workspace.</p><div className="dcp-timeline-art" aria-hidden="true"><span /><span /><span /><span /></div></div><small>PART OF THE InfiNFT SUITE</small></section><section className="dcp-auth-panel"><form onSubmit={event => {event.preventDefault(); void run(async () => {
    if (mode === "reset") {await sendPasswordResetEmail(auth, email); setNotice("If an account exists for this email, a reset link is on its way.");}
    else if (mode === "signup") await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  });}}><p className="dcp-eyebrow">DIRECTOR CUT PRO</p><h2>{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back"}</h2><p>Use your InfiNFT account to keep your projects together.</p>
    <label>Email<input autoComplete="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    {mode !== "reset" && <label>Password<input autoComplete={mode === "signup" ? "new-password" : "current-password"} type="password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
    {error && <p role="alert" className="dcp-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button className="dcp-primary" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
    <div className="dcp-auth-links"><button disabled={busy} type="button" onClick={() => {setMode(mode === "login" ? "signup" : "login"); setError(""); setNotice("");}}>{mode === "login" ? "Create an account" : "Back to sign in"}</button>{mode === "login" && <button disabled={busy} type="button" onClick={() => setMode("reset")}>Forgot password?</button>}</div>
  </form></section></main>;
}

function Workspace({user, id, initial, onHome}: {user: User; id: string; initial: {project: EditorProject; revision: number}; onHome: () => void}) {
  const latest = useRef(initial.project);
  const saved = useRef(JSON.stringify(initial.project));
  const revision = useRef(initial.revision);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState("All changes saved");
  const [error, setError] = useState("");
  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) {if (!await inFlight.current) return false;}
    if (saved.current === JSON.stringify(latest.current)) return true;
    const work = async () => {
      setError(""); setStatus("Saving…");
      try {
        while (saved.current !== JSON.stringify(latest.current)) {
          const snapshot = latest.current;
          revision.current = await saveCloudProject(user.uid, id, snapshot, revision.current);
          saved.current = JSON.stringify(snapshot);
        }
        setStatus("All changes saved"); return true;
      } catch (e) {setError(message(e)); setStatus("Changes not saved"); return false;}
    };
    inFlight.current = work();
    const result = await inFlight.current; inFlight.current = null; return result;
  }, [id, user.uid]);
  const changed = useCallback((project: EditorProject) => {
    latest.current = project;
    clearTimeout(timer.current);
    if (saved.current !== JSON.stringify(project)) {setStatus("Unsaved changes"); timer.current = setTimeout(() => void flush(), 1200);}
  }, [flush]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {if (saved.current !== JSON.stringify(latest.current)) {event.preventDefault(); event.returnValue = "";}};
    window.addEventListener("beforeunload", warn);
    return () => {clearTimeout(timer.current); window.removeEventListener("beforeunload", warn);};
  }, []);
  return <>{error && <div className="dcp-save-error" role="alert">{error} <button onClick={() => void flush()}>Retry save</button><button onClick={() => {if (window.confirm("Leave without saving these edits? Export a project file first to keep a copy.")) onHome();}}>Leave without saving</button></div>}<EditorApp initialProject={initial.project} onProjectChange={changed} onSave={() => void flush()} onHome={() => {void flush().then(ok => {if (ok) onHome();});}} saveStatus={status} accountName={user.displayName || user.email || "Account"} /></>;
}

function Projects({user}: {user: User}) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<{id: string; initial: {project: EditorProject; revision: number}} | null>(null);
  const [dialog, setDialog] = useState<{kind: "create" | "rename" | "duplicate" | "delete"; project?: SavedProject} | null>(null);
  const [name, setName] = useState("");
  useEffect(() => watchProjects(user.uid, items => {setProjects(items); setLoading(false);}, e => {setError(message(e)); setLoading(false);}), [user.uid]);
  const run = async (action: () => Promise<void>) => {setBusy(true); setError(""); try {await action();} catch (e) {setError(message(e));} finally {setBusy(false);}};
  const open = async (id: string) => {const initial = await openProject(user.uid, id); setActive({id, initial});};
  if (active) return <Workspace key={active.id} user={user} id={active.id} initial={active.initial} onHome={() => setActive(null)} />;
  const filtered = projects.filter(project => project.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="dcp-shell dcp-dashboard"><header><Brand /><div><span>{user.displayName || user.email}</span><button disabled={busy} onClick={() => void run(async () => {await signOut(auth);})}>Sign out</button></div></header><aside><p className="dcp-eyebrow">WORKSPACE</p><button className="dcp-nav-active"><FolderOpen size={17} /> Your projects <span>{projects.length}</span></button><p className="dcp-aside-note">Room for every idea.<br />Your projects save as you work.</p></aside><main><div className="dcp-heading"><div><p className="dcp-eyebrow">LET’S MAKE SOMETHING</p><h1>Your projects</h1><p>Pick up where you left off, or start a new story.</p></div><button className="dcp-primary" disabled={busy || loading} onClick={() => {setName("Untitled project"); setDialog({kind: "create"});}}><Plus size={18} /> New project</button></div><label className="dcp-search"><Search size={17} /><input aria-label="Search projects" placeholder="Search your projects" value={search} onChange={e => setSearch(e.target.value)} /></label>{error && <p className="dcp-error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading your projects…</p> : filtered.length ? <div className="dcp-project-grid">{filtered.map(project => <article key={project.id}><button className="dcp-project-preview" disabled={busy} onClick={() => void run(() => open(project.id))}><Film size={38} /><span>OPEN PROJECT ↗</span></button><div className="dcp-project-details"><button className="dcp-project-name" disabled={busy} onClick={() => void run(() => open(project.id))}>{project.name}</button><p>{project.updatedAt ? new Date(project.updatedAt.toMillis()).toLocaleString() : "Just created"}</p><div className="dcp-project-actions">{(["rename", "duplicate", "delete"] as const).map(kind => <button key={kind} disabled={busy} onClick={() => {setName(kind === "duplicate" ? `${project.name.slice(0, 110)} copy` : project.name); setDialog({kind, project});}}>{kind}</button>)}</div></div></article>)}</div> : <div className="dcp-empty"><FolderOpen size={40} /><h2>{search ? "No matching projects" : "Your first cut is waiting"}</h2><p>{search ? "Try another project name." : "Create a project, import your media, and make it yours."}</p></div>}
  </main>{dialog && <div className="dcp-modal-backdrop"><form className="dcp-modal" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" onSubmit={e => {e.preventDefault(); void run(async () => {
    const title = name.trim(); if (dialog.kind !== "delete" && !title) throw new Error("Enter a project name.");
    if (dialog.kind === "create") {const id = await createProject(user.uid, createEmptyProject(title)); await open(id);}
    else if (dialog.project && dialog.kind === "delete") await deleteProject(user.uid, dialog.project.id);
    else if (dialog.project) {const current = await openProject(user.uid, dialog.project.id); current.project.name = title; if (dialog.kind === "duplicate") await createProject(user.uid, current.project); else await saveCloudProject(user.uid, dialog.project.id, current.project, current.revision);}
    setDialog(null);
  });}}><h2 id="project-dialog-title">{dialog.kind === "delete" ? "Delete this project?" : dialog.kind === "create" ? "New project" : dialog.kind === "rename" ? "Rename project" : "Duplicate project"}</h2>{dialog.kind === "delete" ? <p>“{dialog.project?.name}” will be permanently deleted. Uploaded source files stay in your account so other projects can keep using them.</p> : <label>Project name<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>}{error && <p role="alert" className="dcp-error">{error}</p>}<div><button type="button" disabled={busy} onClick={() => {setDialog(null); setError("");}}>Cancel</button><button className="dcp-primary" disabled={busy}>{busy ? "Please wait…" : dialog.kind === "delete" ? "Delete project" : "Save project"}</button></div></form></div>}</div>;
}

export function AccountApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => onAuthStateChanged(auth, setUser, e => setError(message(e))), []);
  if (error) return <main className="dcp-shell dcp-loading" role="alert">{error}</main>;
  if (user === undefined) return <main className="dcp-shell dcp-loading"><Brand /><p>Opening your workspace…</p></main>;
  return user ? <Projects key={user.uid} user={user} /> : <SignIn />;
}
