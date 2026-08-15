import type {EditorProject} from "../types";
import type {ExportCapabilities, ExportFormat, ExportJob, ExportQuality, ExportResolution} from "./types";

const json = async <T>(response: Response): Promise<T> => {
  const body = await response.json() as T & {error?: string};
  if (!response.ok) throw new Error(body.error || `Export service returned ${response.status}`);
  return body;
};

export const exportClient = {
  capabilities: () => fetch("/api/export/capabilities").then((response) => json<ExportCapabilities>(response)),
  list: () => fetch("/api/render").then((response) => json<ExportJob[]>(response)),
  create: (request: {project: EditorProject; format?: ExportFormat; quality?: ExportQuality; resolution?: ExportResolution; frameRange?: [number, number] | null}) => fetch("/api/render", {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request),
  }).then((response) => json<ExportJob>(response)),
  get: (id: string) => fetch(`/api/render/${encodeURIComponent(id)}`).then((response) => json<ExportJob>(response)),
  cancel: (id: string) => fetch(`/api/render/${encodeURIComponent(id)}/cancel`, {method: "POST"}).then((response) => json<ExportJob>(response)),
  retry: (id: string) => fetch(`/api/render/${encodeURIComponent(id)}/retry`, {method: "POST"}).then((response) => json<ExportJob>(response)),
  remove: async (id: string) => {
    const response = await fetch(`/api/render/${encodeURIComponent(id)}`, {method: "DELETE"});
    if (!response.ok) await json(response);
  },
};
