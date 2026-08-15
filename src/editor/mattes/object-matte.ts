export type ObjectMatteFrame = {frame: number; src: string};
export type ImportedMatteFile = {name: string; src: string};

export type ObjectMatteReference = {
  id: string;
  name: string;
  enabled: boolean;
  inverted: boolean;
  opacity: number;
  source: "imported" | "provider";
  providerId?: string;
  frames: ObjectMatteFrame[];
};

export type ObjectMaskRequest = {
  clipId: string;
  source: string;
  startFrame: number;
  endFrame: number;
  fps: number;
  prompt?: string;
};

export type ObjectMaskProvider = {
  id: string;
  label: string;
  createMatte(request: ObjectMaskRequest): Promise<ObjectMatteReference>;
};

const isSafeMatteSource = (source: string) => /^(?:data:image\/(?:png|webp);base64,|blob:|https?:\/\/|\/)/i.test(source);

export const normalizeObjectMatte = (value: Partial<ObjectMatteReference>): ObjectMatteReference => {
  if (!value.id?.trim()) throw new Error("A matte id is required");
  const frames = [...(value.frames ?? [])]
    .filter((item) => Number.isInteger(item.frame) && item.frame >= 0 && isSafeMatteSource(item.src))
    .sort((left, right) => left.frame - right.frame)
    .filter((item, index, items) => !index || item.frame !== items[index - 1].frame);
  if (!frames.length) throw new Error("A matte requires at least one PNG or WebP frame");
  return {
    id: value.id,
    name: value.name?.trim() || "Object Matte",
    enabled: value.enabled !== false,
    inverted: value.inverted === true,
    opacity: Math.max(0, Math.min(1, Number.isFinite(value.opacity) ? value.opacity! : 1)),
    source: value.source === "provider" ? "provider" : "imported",
    providerId: value.providerId,
    frames,
  };
};

const frameFromFileName = (name: string, fallback: number) => {
  const match = name.replace(/\.[^.]+$/, "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : fallback;
};

/** Turns a local PNG/WebP image sequence into a stable frame-addressed matte. */
export const importObjectMatteSequence = (input: {id: string; name: string; files: ImportedMatteFile[]}): ObjectMatteReference => normalizeObjectMatte({
  id: input.id,
  name: input.name,
  source: "imported",
  enabled: true,
  inverted: false,
  opacity: 1,
  frames: [...input.files]
    .sort((left, right) => left.name.localeCompare(right.name, undefined, {numeric: true}))
    .map((file, index) => ({frame: frameFromFileName(file.name, index), src: file.src})),
});

/** Holds imported/provider matte metadata. Pixel payloads stay in their URLs or IndexedDB owner. */
export class ObjectMatteCache {
  private readonly mattes = new Map<string, ObjectMatteReference>();
  put(value: ObjectMatteReference) { const matte = normalizeObjectMatte(value); this.mattes.set(matte.id, matte); return matte; }
  get(id: string) { return this.mattes.get(id); }
  remove(id: string) { return this.mattes.delete(id); }
  list() { return [...this.mattes.values()]; }
}

export class ObjectMaskProviderRegistry {
  private readonly providers = new Map<string, ObjectMaskProvider>();
  register(provider: ObjectMaskProvider) {
    if (!provider.id.trim() || this.providers.has(provider.id)) throw new Error(`Object-mask provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }
  get(id: string) { return this.providers.get(id); }
  list() { return [...this.providers.values()].map(({id, label}) => ({id, label})); }
  async create(id: string, request: ObjectMaskRequest) {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Object-mask provider unavailable: ${id}`);
    return normalizeObjectMatte(await provider.createMatte(request));
  }
}

export const matteFrameAt = (matte: ObjectMatteReference, frame: number) => {
  const frames = matte.frames;
  if (!frames.length) return undefined;
  let match = frames[0];
  for (const candidate of frames) {
    if (candidate.frame > frame) break;
    match = candidate;
  }
  return match;
};

export const objectMatteCss = (matte: ObjectMatteReference, frame: number) => {
  const image = matteFrameAt(matte, frame);
  if (!matte.enabled || !image) return {};
  const urlMask = `url("${image.src.replace(/"/g, "%22")}")`;
  const mask = matte.inverted ? `linear-gradient(#000 0 0), ${urlMask}` : urlMask;
  return {
    WebkitMaskImage: mask,
    maskImage: mask,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskComposite: matte.inverted ? "xor" : undefined,
    maskComposite: matte.inverted ? "exclude" : undefined,
    opacity: matte.opacity,
  } as const;
};
