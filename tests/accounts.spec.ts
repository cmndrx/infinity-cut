// Explicit opt-in: creates temporary accounts in the shared project and removes them in afterAll.
import {test, expect} from "@playwright/test";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {initializeApp, deleteApp, type FirebaseApp} from "firebase/app";
import {getAuth, createUserWithEmailAndPassword, deleteUser} from "firebase/auth";
import {collection, deleteDoc, doc, getDocs, getDoc, getFirestore, serverTimestamp, setDoc, updateDoc} from "firebase/firestore";
import {getStorage, ref, listAll, deleteObject, getMetadata, uploadBytes} from "firebase/storage";

test.skip(process.env.DCP_LIVE_TEST !== "1", "Set DCP_LIVE_TEST=1 to run temporary-account integration tests.");
const config = {apiKey: "AIzaSyCNnzfrapK2srzVNlf5YidX8546Wbpzy9Y", projectId: "infinft-card-game", storageBucket: "infinft-card-game.firebasestorage.app", appId: "1:176088601846:web:cdb264e83a4f825a5448d7"};
const password = `Dcp-qa-${crypto.randomUUID()}!`;
const email = `dcp-qa-${crypto.randomUUID()}@example.com`;
const apps: FirebaseApp[] = [];
let owner: FirebaseApp;
let other: FirebaseApp;
let uid: string;
test.beforeAll(async () => {
  owner = initializeApp(config, "dcp-test-owner"); apps.push(owner);
  uid = (await createUserWithEmailAndPassword(getAuth(owner), email, password)).user.uid;
  other = initializeApp(config, "dcp-test-other"); apps.push(other);
  await createUserWithEmailAndPassword(getAuth(other), `dcp-qa-${crypto.randomUUID()}@example.com`, password);
});
test.afterAll(async () => {
  for (const app of apps) {
    const user = getAuth(app).currentUser;
    if (user) {
      const db = getFirestore(app);
      for (const item of (await getDocs(collection(db, "users", user.uid, "dcpProjects"))).docs) await deleteDoc(item.ref);
      for (const folder of ["img", "audio", "video"]) {
        const files = await listAll(ref(getStorage(app), `DCP/${user.uid}/${folder}`));
        for (const item of files.items) await deleteObject(item);
      }
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(user);
    }
    await deleteApp(app);
  }
});

test("accounts, project lifecycle, autosave, media and ownership", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", {name: "Welcome back"})).toBeVisible();
  await page.screenshot({path: join(tmpdir(), "dcp-qa-signin.png"), fullPage: true});
  await page.getByLabel("Email", {exact: true}).fill(email);
  await page.getByLabel("Password", {exact: true}).fill(password);
  await page.getByRole("button", {name: "Sign in", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Your projects"})).toBeVisible();
  await page.getByRole("button", {name: "New project", exact: true}).click();
  await page.getByLabel("Project name").fill("QA first project");
  await page.getByRole("button", {name: "Save project", exact: true}).click();
  await expect(page.locator(".project-title")).toContainText("QA first project");
  await expect(page.locator(".timeline-clip")).toHaveCount(0);
  await page.locator('input[type="file"][multiple]').setInputFiles({name: "qa-image.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4WQAAAAASUVORK5CYII=", "base64")});
  await expect(page.locator(".project-title")).toContainText("Imported 1", {timeout: 30000});
  await expect(page.locator(".project-title")).toContainText("All changes saved", {timeout: 30000});
  await page.getByRole("button", {name: "Projects", exact: true}).click();
  await page.screenshot({path: join(tmpdir(), "dcp-qa-projects.png"), fullPage: true});
  await page.getByRole("button", {name: "duplicate", exact: true}).click();
  await page.getByLabel("Project name").fill("QA second project");
  await page.getByRole("button", {name: "Save project", exact: true}).click();
  await expect(page.locator(".dcp-project-grid article")).toHaveCount(2);
  await page.getByRole("button", {name: "QA first project", exact: true}).click();
  await page.getByRole("button", {name: "Text", exact: true}).click();
  await page.getByRole("button", {name: /^Add title/}).click();
  await expect(page.locator(".timeline-clip")).toHaveCount(1);
  await expect(page.locator(".project-title")).toContainText("All changes saved", {timeout: 30000});
  await page.reload();
  await expect(page.getByRole("heading", {name: "Your projects"})).toBeVisible();
  await page.getByRole("button", {name: "QA first project", exact: true}).click();
  await expect(page.locator(".timeline-clip")).toHaveCount(1);
  await page.getByRole("button", {name: "Projects", exact: true}).click();
  await page.getByRole("button", {name: "QA second project", exact: true}).click();
  await expect(page.locator(".timeline-clip")).toHaveCount(0);
  await page.getByRole("button", {name: "Projects", exact: true}).click();
  const second = page.locator("article").filter({has: page.getByRole("button", {name: "QA second project", exact: true})});
  await second.getByRole("button", {name: "rename", exact: true}).click();
  await page.getByLabel("Project name").fill("QA renamed project");
  await page.getByRole("button", {name: "Save project", exact: true}).click();
  await expect(page.getByRole("button", {name: "QA renamed project", exact: true})).toBeVisible();
  const renamed = page.locator("article").filter({has: page.getByRole("button", {name: "QA renamed project", exact: true})});
  await renamed.getByRole("button", {name: "delete", exact: true}).click();
  await page.getByRole("button", {name: "Delete project", exact: true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".dcp-project-grid article")).toHaveCount(1);

  const database = getFirestore(owner);
  const records = (await getDocs(collection(database, "users", uid, "dcpProjects"))).docs;
  expect(records).toHaveLength(1);
  const record = records[0];
  expect(JSON.parse(record.data().payload).clips).toHaveLength(1);
  const foreign = doc(getFirestore(other), "users", uid, "dcpProjects", record.id);
  await expect(getDoc(foreign)).rejects.toMatchObject({code: "permission-denied"});
  await expect(updateDoc(foreign, {name: "attack"})).rejects.toMatchObject({code: "permission-denied"});
  await expect(deleteDoc(foreign)).rejects.toMatchObject({code: "permission-denied"});
  await expect(getDocs(collection(getFirestore(other), "users", uid, "dcpProjects"))).rejects.toMatchObject({code: "permission-denied"});
  await expect(updateDoc(record.ref, {name: "invalid revision"})).rejects.toMatchObject({code: "permission-denied"});
  await expect(setDoc(doc(database, "users", uid, "dcpProjects", "invalid"), {name: "x", payload: "{}", revision: 1, schemaVersion: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), role: "admin"})).rejects.toMatchObject({code: "permission-denied"});
  const uploaded = (await listAll(ref(getStorage(owner), `DCP/${uid}/img`))).items[0];
  expect(uploaded.fullPath).toMatch(new RegExp(`^DCP/${uid}/img/`));
  await expect(getMetadata(ref(getStorage(other), uploaded.fullPath))).rejects.toMatchObject({code: "storage/unauthorized"});
  await expect(uploadBytes(ref(getStorage(other), `DCP/${uid}/img/attack.png`), new Uint8Array([1]), {contentType: "image/png"})).rejects.toMatchObject({code: "storage/unauthorized"});
  await expect(uploadBytes(ref(getStorage(owner), `DCP/${uid}/img/invalid.txt`), new Uint8Array([1]), {contentType: "text/plain"})).rejects.toMatchObject({code: "storage/unauthorized"});
  const anonymous = initializeApp(config, "dcp-test-signed-out"); apps.push(anonymous);
  await expect(getDoc(doc(getFirestore(anonymous), "users", uid, "dcpProjects", record.id))).rejects.toMatchObject({code: "permission-denied"});
  await expect(getMetadata(ref(getStorage(anonymous), uploaded.fullPath))).rejects.toMatchObject({code: "storage/unauthorized"});
  // A competing device wins a revision; the stale editor must keep its edits and report a conflict.
  await page.getByRole("button", {name: "QA first project", exact: true}).click();
  await expect(page.locator(".project-title")).toContainText("QA first project");
  await updateDoc(record.ref, {revision: record.data().revision + 1, updatedAt: serverTimestamp()});
  await page.getByRole("button", {name: "Text", exact: true}).click();
  await page.getByRole("button", {name: /^Add title/}).click();
  await expect(page.locator(".dcp-save-error")).toContainText("another tab or device", {timeout: 30000});
  expect(JSON.parse((await getDoc(record.ref)).data()!.payload).clips).toHaveLength(1);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", {name: "Leave without saving", exact: true}).click();
  await page.getByRole("button", {name: "Sign out", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Welcome back"})).toBeVisible();
  expect(errors).toEqual([]);
});
