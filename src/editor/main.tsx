import React from "react";
import {createRoot} from "react-dom/client";
import {ProjectHome} from "./ProjectHome";
import "./editor.css";

const root = document.getElementById("editor-root");

if (!root) {
  throw new Error("Editor root element not found");
}

createRoot(root).render(
  <React.StrictMode>
    <ProjectHome />
  </React.StrictMode>,
);
