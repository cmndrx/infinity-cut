import {defineConfig} from "vite";
import {infinityCutRenderPlugin} from "./render-server";

export default defineConfig({
  plugins: [infinityCutRenderPlugin()],
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
