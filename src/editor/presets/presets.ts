import {validateAudioProcessorChain, type AudioProcessor} from "../audio/model";
import {createVisualEffectInstance, validateVisualEffectInstance, type VisualEffectInstance} from "../effects/registry";

export type EffectPresetTemplate = {templateId: string; descriptorId: string; parameters: Record<string, number | boolean | string>};
export type EffectPresetAutomation = {templateId: string; parameter: string; frame: number; value: number; interpolation: "hold" | "linear" | "bezier"};
export type EffectPreset = {
  schemaVersion: 1;
  kind: "visual-effects";
  id: string;
  name: string;
  effects: EffectPresetTemplate[];
  automation: EffectPresetAutomation[];
};
export type AudioPreset = {schemaVersion: 1; kind: "audio-processors"; id: string; name: string; processors: AudioProcessor[]};
export type EditorPreset = EffectPreset | AudioPreset;
export type AppliedEffectAutomation = Omit<EffectPresetAutomation, "templateId"> & {effectInstanceId: string};

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor", "entrypoint", "script", "code", "module", "eval"]);

const containsForbiddenKey = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  return Object.entries(value).some(([key, item]) => forbiddenKeys.has(key) || containsForbiddenKey(item));
};

const plainRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const safeName = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 120;

export const validateEditorPreset = (value: unknown): value is EditorPreset => {
  if (!plainRecord(value) || containsForbiddenKey(value) || value.schemaVersion !== 1 || !idPattern.test(String(value.id ?? "")) || !safeName(value.name)) return false;
  if (value.kind === "audio-processors") {
    if (!Array.isArray(value.processors) || value.processors.length > 32) return false;
    return validateAudioProcessorChain(value.processors as AudioProcessor[]).valid;
  }
  if (value.kind !== "visual-effects" || !Array.isArray(value.effects) || !Array.isArray(value.automation) || value.effects.length > 64 || value.automation.length > 2_000) return false;
  const templateIds = new Set<string>();
  for (const raw of value.effects) {
    if (!plainRecord(raw) || !idPattern.test(String(raw.templateId ?? "")) || templateIds.has(String(raw.templateId)) || typeof raw.descriptorId !== "string" || !plainRecord(raw.parameters)) return false;
    templateIds.add(String(raw.templateId));
    try {
      const instance = createVisualEffectInstance(raw.descriptorId, String(raw.templateId), raw.parameters as Record<string, number | boolean | string>);
      if (!validateVisualEffectInstance(instance)) return false;
    } catch {
      return false;
    }
  }
  return value.automation.every((raw) => plainRecord(raw) && templateIds.has(String(raw.templateId)) && typeof raw.parameter === "string" && raw.parameter.length <= 128
    && Number.isInteger(raw.frame) && Number(raw.frame) >= 0 && Number.isFinite(raw.value) && ["hold", "linear", "bezier"].includes(String(raw.interpolation)));
};

export const importEditorPreset = (source: string | unknown): EditorPreset => {
  if (typeof source === "string" && source.length > 1_000_000) throw new Error("Preset exceeds the 1 MB limit");
  let parsed: unknown;
  try {
    parsed = typeof source === "string" ? JSON.parse(source) : source;
  } catch {
    throw new Error("Preset is not valid JSON");
  }
  if (!validateEditorPreset(parsed)) throw new Error("Preset is invalid or contains unsupported data");
  return JSON.parse(JSON.stringify(parsed)) as EditorPreset;
};

export const applyEffectPreset = (preset: EffectPreset, createId: (templateId: string) => string): {effects: VisualEffectInstance[]; automation: AppliedEffectAutomation[]} => {
  if (!validateEditorPreset(preset) || preset.kind !== "visual-effects") throw new Error("Cannot apply an invalid visual effect preset");
  const idMap = new Map<string, string>();
  const ids = new Set<string>();
  const effects = preset.effects.map((template) => {
    const id = createId(template.templateId);
    if (!idPattern.test(id) || ids.has(id)) throw new Error("Preset generated an invalid or duplicate effect id");
    ids.add(id);
    idMap.set(template.templateId, id);
    return createVisualEffectInstance(template.descriptorId, id, template.parameters);
  });
  const automation = preset.automation.map(({templateId, ...keyframe}) => ({...keyframe, effectInstanceId: idMap.get(templateId)!}));
  return {effects, automation};
};

export const applyAudioPreset = (preset: AudioPreset, createId: (processorId: string) => string): AudioProcessor[] => {
  if (!validateEditorPreset(preset) || preset.kind !== "audio-processors") throw new Error("Cannot apply an invalid audio preset");
  const ids = new Set<string>();
  return preset.processors.map((processor) => {
    const id = createId(processor.id);
    if (!idPattern.test(id) || ids.has(id)) throw new Error("Preset generated an invalid or duplicate processor id");
    ids.add(id);
    return {...JSON.parse(JSON.stringify(processor)), id} as AudioProcessor;
  });
};
