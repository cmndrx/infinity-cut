import React, {useRef, useState} from "react";
import {Circle, Download, Plus, Square, Upload, X} from "lucide-react";
import {exportCubeLut, parseCubeLut} from "./cube-lut";
import {createDefaultMask} from "./masks";
import type {ColorCurveChannel, ColorGrade, EditorEffectMask, HslSecondary, ProjectLut} from "./types";

type Props = {
  grade: ColorGrade;
  luts: ProjectLut[];
  masks: EditorEffectMask[];
  selectedMaskId: string | null;
  showOverlay: boolean;
  tracking: {running: boolean; progress: number; confidence?: number};
  onGrade: (grade: ColorGrade, message?: string) => void;
  onLuts: (luts: ProjectLut[], message?: string) => void;
  onMasks: (masks: EditorEffectMask[], message?: string) => void;
  onSelectMask: (id: string) => void;
  onToggleOverlay: () => void;
  onTrack: (mode: "back" | "forward" | "range" | "cancel") => void;
};

const channels: ColorCurveChannel[] = ["master", "red", "green", "blue"];
const downloadText = (filename: string, content: string) => {
  const url = URL.createObjectURL(new Blob([content], {type: "text/plain"}));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const secondary = (id: string): HslSecondary => ({
  id, name: "HSL Secondary", enabled: true, hueStart: 330, hueEnd: 30, hueSoftness: 12,
  saturationMin: 0.15, saturationMax: 1, saturationSoftness: 0.1,
  luminanceMin: 0.08, luminanceMax: 1, luminanceSoftness: 0.1,
  correctionX: 0, correctionY: 0, exposure: 0, saturation: 0,
});

export const ProfessionalColorControls: React.FC<Props> = ({grade, luts, masks, selectedMaskId, showOverlay, tracking, onGrade, onLuts, onMasks, onSelectMask, onToggleOverlay, onTrack}) => {
  const [channel, setChannel] = useState<ColorCurveChannel>("master");
  const inputRef = useRef<HTMLInputElement>(null);
  const points = grade.curves[channel];
  const updateWheel = (name: keyof ColorGrade["wheels"], property: "x" | "y" | "luma", value: number) => onGrade({...grade, wheels: {...grade.wheels, [name]: {...grade.wheels[name], [property]: value}}});
  const updateSecondary = (id: string, updates: Partial<HslSecondary>) => onGrade({...grade, hslSecondaries: grade.hslSecondaries.map((item) => item.id === id ? {...item, ...updates} : item)});
  const addPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(.01, Math.min(.99, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    onGrade({...grade, curves: {...grade.curves, [channel]: [...points, {id: `${channel}-${Date.now()}`, x, y}].sort((a, b) => a.x - b.x)}}, "Added curve point");
  };
  const movePoint = (id: string, event: React.PointerEvent<SVGCircleElement>) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const existing = points.find((point) => point.id === id);
    const x = existing?.x === 0 || existing?.x === 1 ? existing.x : Math.max(.01, Math.min(.99, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    onGrade({...grade, curves: {...grade.curves, [channel]: points.map((point) => point.id === id ? {...point, x, y} : point).sort((a, b) => a.x - b.x)}}, "Adjusted curve point");
  };
  const moveWheel = (name: keyof ColorGrade["wheels"], event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, -(((event.clientY - rect.top) / rect.height) * 2 - 1)));
    onGrade({...grade, wheels: {...grade.wheels, [name]: {...grade.wheels[name], x, y}}}, `Adjusted ${name} wheel`);
  };
  const path = points.slice().sort((a, b) => a.x - b.x).map((point, index) => `${index ? "L" : "M"}${point.x * 180},${(1 - point.y) * 100}`).join(" ");
  return <>
    <section className="color-module pro-color-module">
      <header><span>Curves</span><small>Master + RGB</small></header>
      <div className="curve-tabs">{channels.map((item) => <button key={item} className={channel === item ? `active ${item}` : item} onClick={() => setChannel(item)}>{item === "master" ? "Y" : item[0].toUpperCase()}</button>)}</div>
      <svg className={`curve-editor ${channel}`} viewBox="0 0 180 100" onPointerDown={addPoint} role="img" aria-label={`${channel} curve editor`}>
        {[25, 50, 75].map((value) => <React.Fragment key={value}><line x1={value * 1.8} x2={value * 1.8} y1="0" y2="100" /><line x1="0" x2="180" y1={value} y2={value} /></React.Fragment>)}
        <path d="M0,100 L180,0" className="curve-reference" /><path d={path} className="curve-line" />
        {points.map((point) => <circle key={point.id} cx={point.x * 180} cy={(1 - point.y) * 100} r="3.5" onPointerDown={(event) => {event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={(event) => {if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect(); if (rect) {if (point.x !== 0 && point.x !== 1) event.currentTarget.setAttribute("cx", String(((event.clientX - rect.left) / rect.width) * 180)); event.currentTarget.setAttribute("cy", String(((event.clientY - rect.top) / rect.height) * 100));}}} onPointerUp={(event) => {event.stopPropagation(); movePoint(point.id, event);}} />)}
      </svg>
      <div className="curve-point-list">{points.filter((point) => point.x > 0 && point.x < 1).map((point) => <button key={point.id} onClick={() => onGrade({...grade, curves: {...grade.curves, [channel]: points.filter((item) => item.id !== point.id)}}, "Removed curve point")}>X {Math.round(point.x * 100)} · Y {Math.round(point.y * 100)} <X size={9} /></button>)}</div>
    </section>
    <section className="color-module pro-color-module">
      <header><span>Color wheels</span><small>Shadows · Midtones · Highlights</small></header>
      <div className="color-wheel-grid">{(["shadows", "midtones", "highlights"] as const).map((name) => <div key={name}><span>{name}</span><i style={{"--wheel-x": `${grade.wheels[name].x * 18}px`, "--wheel-y": `${grade.wheels[name].y * -18}px`} as React.CSSProperties} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => {if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty("--wheel-x", `${Math.max(-18, Math.min(18, event.clientX - rect.left - rect.width / 2))}px`); event.currentTarget.style.setProperty("--wheel-y", `${Math.max(-18, Math.min(18, event.clientY - rect.top - rect.height / 2))}px`);}} onPointerUp={(event) => moveWheel(name, event)} title={`Drag ${name} color balance`} /><label>X<input type="range" min={-1} max={1} step={.01} value={grade.wheels[name].x} onChange={(event) => updateWheel(name, "x", Number(event.target.value))} /></label><label>Y<input type="range" min={-1} max={1} step={.01} value={grade.wheels[name].y} onChange={(event) => updateWheel(name, "y", Number(event.target.value))} /></label><label>L<input type="range" min={-1} max={1} step={.01} value={grade.wheels[name].luma} onChange={(event) => updateWheel(name, "luma", Number(event.target.value))} /></label></div>)}</div>
    </section>
    <section className="color-module pro-color-module">
      <header><span>HSL Secondary</span><button onClick={() => onGrade({...grade, hslSecondaries: [...grade.hslSecondaries, secondary(`secondary-${Date.now()}`)]}, "Added HSL secondary")}><Plus size={11} /></button></header>
      {grade.hslSecondaries.map((item) => <div className="hsl-secondary" key={item.id}><div><button className={item.enabled ? "active" : ""} onClick={() => updateSecondary(item.id, {enabled: !item.enabled})}>{item.enabled ? "On" : "Off"}</button><strong>{item.name}</strong><button onClick={() => onGrade({...grade, hslSecondaries: grade.hslSecondaries.filter((candidate) => candidate.id !== item.id)})}><X size={10} /></button></div><label>Hue <input type="number" min={0} max={360} value={item.hueStart} onChange={(event) => updateSecondary(item.id, {hueStart: Number(event.target.value)})} />–<input type="number" min={0} max={360} value={item.hueEnd} onChange={(event) => updateSecondary(item.id, {hueEnd: Number(event.target.value)})} /></label><label>Exposure <input type="range" min={-3} max={3} step={.05} value={item.exposure} onChange={(event) => updateSecondary(item.id, {exposure: Number(event.target.value)})} /></label><label>Saturation <input type="range" min={-100} max={100} value={item.saturation} onChange={(event) => updateSecondary(item.id, {saturation: Number(event.target.value)})} /></label></div>)}
      {!grade.hslSecondaries.length && <p className="pro-empty">Qualify a hue range, then correct only those colors.</p>}
    </section>
    <section className="color-module pro-color-module">
      <header><span>Creative LUT</span><small>{luts.length} loaded</small></header>
      <input ref={inputRef} hidden type="file" accept=".cube,text/plain" onChange={async (event) => {const file = event.target.files?.[0]; if (!file) return; try {const lut = parseCubeLut(await file.text(), {name: file.name.replace(/\.cube$/i, "")}); onLuts([...luts.filter((item) => item.id !== lut.id), lut], `Imported ${lut.name}`); onGrade({...grade, lutId: lut.id});} finally {event.target.value = "";}}} />
      <div className="lut-row"><select aria-label="Creative LUT" value={grade.lutId ?? ""} onChange={(event) => onGrade({...grade, lutId: event.target.value || undefined})}><option value="">None</option>{luts.map((lut) => <option key={lut.id} value={lut.id}>{lut.name} · {lut.kind.toUpperCase()}</option>)}</select><button onClick={() => inputRef.current?.click()} title="Import .cube LUT"><Upload size={11} /></button>{grade.lutId && <button onClick={() => {const lut = luts.find((item) => item.id === grade.lutId); if (lut) downloadText(`${lut.name}.cube`, exportCubeLut(lut));}} title="Export selected LUT"><Download size={11} /></button>}</div>
      <label className="pro-slider">Intensity <input type="range" min={0} max={100} value={grade.lutIntensity} onChange={(event) => onGrade({...grade, lutIntensity: Number(event.target.value)})} /><b>{Math.round(grade.lutIntensity)}%</b></label>
    </section>
    <section className="color-module pro-color-module mask-stack-module">
      <header><span>Effect masks</span><div><button className={showOverlay ? "active" : ""} onClick={onToggleOverlay} title="Show mask overlays">{showOverlay ? "Hide" : "Show"}</button><button onClick={() => {const mask = createDefaultMask(`mask-${Date.now()}`, "ellipse"); onMasks([...masks, mask], "Added ellipse mask"); onSelectMask(mask.id);}} title="Add ellipse"><Circle size={11} /></button><button onClick={() => {const mask = createDefaultMask(`mask-${Date.now()}`, "rectangle"); onMasks([...masks, mask], "Added rectangle mask"); onSelectMask(mask.id);}} title="Add rectangle"><Square size={11} /></button></div></header>
      {masks.map((mask, index) => <div className={`pro-mask-card ${selectedMaskId === mask.id ? "selected" : ""}`} key={mask.id} onClick={() => onSelectMask(mask.id)}><div><button className={mask.enabled ? "active" : ""} onClick={(event) => {event.stopPropagation(); onMasks(masks.map((item) => item.id === mask.id ? {...item, enabled: !item.enabled} : item));}}>{mask.enabled ? "On" : "Off"}</button><strong>{mask.name}</strong><button onClick={(event) => {event.stopPropagation(); onMasks(masks.filter((item) => item.id !== mask.id), "Removed mask");}}><X size={10} /></button></div><div className="pro-mask-selects"><select value={mask.target} onChange={(event) => onMasks(masks.map((item) => item.id === mask.id ? {...item, target: event.target.value as EditorEffectMask["target"]} : item))}>{["color", "blur", "vignette", "grain", "glow"].map((item) => <option key={item}>{item}</option>)}</select><select value={mask.combineMode} disabled={index === 0} onChange={(event) => onMasks(masks.map((item) => item.id === mask.id ? {...item, combineMode: event.target.value as EditorEffectMask["combineMode"]} : item))}>{["add", "subtract", "intersect"].map((item) => <option key={item}>{item}</option>)}</select><button className={mask.inverted ? "active" : ""} onClick={() => onMasks(masks.map((item) => item.id === mask.id ? {...item, inverted: !item.inverted} : item))}>Invert</button></div><div className="pro-mask-fields">{(["x", "y", "width", "height", "feather", "opacity"] as const).map((property) => <label key={property}>{property}<input type="number" min={property === "x" || property === "y" ? -200 : 0} max={property === "width" || property === "height" ? 400 : 100} value={Math.round(mask[property] * 10) / 10} onChange={(event) => onMasks(masks.map((item) => item.id === mask.id ? {...item, [property]: Number(event.target.value)} : item))} /></label>)}</div>{selectedMaskId === mask.id ? <div className="mask-tracker-controls"><span>Motion tracker</span>{tracking.running ? <><progress max={1} value={tracking.progress} /><b>{Math.round(tracking.progress * 100)}%</b><button onClick={() => onTrack("cancel")}>Cancel</button></> : <><button onClick={() => onTrack("back")} title="Track one frame backward">◀ 1</button><button onClick={() => onTrack("forward")} title="Track one frame forward">1 ▶</button><button onClick={() => onTrack("range")} title="Track from playhead to clip end">Track to end</button>{tracking.confidence !== undefined ? <b>{Math.round(tracking.confidence * 100)}% confidence</b> : null}</>}</div> : null}</div>)}
      {!masks.length && <p className="pro-empty">Add multiple masks and combine them per effect.</p>}
    </section>
  </>;
};
