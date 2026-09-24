import {defineConfig} from "vite";
import {infinityCutRenderPlugin} from "./render-server";

export default defineConfig({
  plugins: [infinityCutRenderPlugin(), {
    name: "director-cut-entry",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === "/") request.url = "/editor.html";
        next();
      });
    },
  }],
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
