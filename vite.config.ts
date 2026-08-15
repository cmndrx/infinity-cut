import {defineConfig} from "vite";
import {directorsCutProRenderPlugin} from "./render-server";
import {directorsCutProCollaborationPlugin} from "./collaboration-server";

export default defineConfig({
  plugins: [directorsCutProRenderPlugin(), directorsCutProCollaborationPlugin()],
  publicDir: "public",
  resolve: {
    dedupe: ["react", "react-dom", "remotion"],
  },
  build: {
    outDir: "editor-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "editor.html",
    },
  },
});
