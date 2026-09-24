import {collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, deleteDoc} from "firebase/firestore";
import {getDownloadURL, ref, uploadBytesResumable} from "firebase/storage";
import {auth, db, storage} from "./firebase";
import type {EditorProject} from "./types";

export type SavedProject = {id: string; name: string; payload: string; revision: number; updatedAt?: {toMillis: () => number}};
export const projectCollection = (uid: string) => collection(db, "users", uid, "dcpProjects");
const projectRef = (uid: string, id: string) => doc(projectCollection(uid), id);
export const watchProjects = (uid: string, next: (projects: SavedProject[]) => void, error: (error: Error) => void) =>
  onSnapshot(projectCollection(uid), snapshot => next(snapshot.docs.map(item => ({...item.data(), id: item.id}) as SavedProject)
    .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0))), error);

function encode(project: EditorProject) {
  const payload = JSON.stringify(project);
  if (new TextEncoder().encode(payload).length > 800000) throw new Error("This project exceeds the cloud save limit. Export a project file to keep a backup, then split the sequence into smaller projects.");
  return payload;
}
export async function createProject(uid: string, project: EditorProject) {
  const target = doc(projectCollection(uid));
  await setDoc(target, {name: project.name, payload: encode(project), revision: 1, schemaVersion: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp()});
  return target.id;
}
export async function openProject(uid: string, id: string) {
  const snapshot = await getDoc(projectRef(uid, id));
  if (!snapshot.exists()) throw new Error("This project no longer exists.");
  return {project: JSON.parse(snapshot.data().payload) as EditorProject, revision: snapshot.data().revision as number};
}
export async function saveCloudProject(uid: string, id: string, project: EditorProject, revision: number) {
  const payload = encode(project);
  await runTransaction(db, async tx => {
    const target = projectRef(uid, id);
    const snapshot = await tx.get(target);
    if (!snapshot.exists() || snapshot.data().revision !== revision) throw new Error("This project changed in another tab or device. Export your project file to preserve these edits, then reopen it from Projects.");
    tx.update(target, {payload, name: project.name, revision: revision + 1, updatedAt: serverTimestamp()});
  });
  return revision + 1;
}
export const deleteProject = (uid: string, id: string) => deleteDoc(projectRef(uid, id));

export async function uploadCloudMedia(file: File, progress: (percent: number) => void) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in before importing media.");
  const category = file.type.startsWith("image/") ? "img" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : null;
  if (!category) throw new Error("Choose a video, audio, or image file.");
  if (file.size > 2 * 1024 ** 3) throw new Error("Files must be smaller than 2 GB.");
  const storagePath = `DCP/${uid}/${category}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const task = uploadBytesResumable(ref(storage, storagePath), file, {contentType: file.type});
  await new Promise<void>((resolve, reject) => task.on("state_changed", snapshot => progress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, resolve));
  return {src: await getDownloadURL(task.snapshot.ref), storagePath, renderReady: true};
}
