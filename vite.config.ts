import {defineConfig} from "vite";
import {directorsCutProRenderPlugin} from "./render-server";

export default defineConfig({
  plugins: [directorsCutProRenderPlugin()],
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
