import {useState} from "react";
import type {AudioProcessor, EqBand} from "./model";

const id = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;

export const createAudioProcessor = (type: AudioProcessor["type"]): AudioProcessor => {
  if (type === "eq") return {id: id("eq"), type, enabled: true, bands: [
    {id: id("low"), enabled: true, type: "high-pass", frequency: 80, gainDb: 0, q: 0.7},
    {id: id("presence"), enabled: true, type: "bell", frequency: 3_200, gainDb: 0, q: 1},
  ]};
  if (type === "compressor") return {id: id("compressor"), type, enabled: true, thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, kneeDb: 6, makeupDb: 0};
  if (type === "limiter") return {id: id("limiter"), type, enabled: true, ceilingDb: -1, attackMs: 5, releaseMs: 80};
  return {id: id("gate"), type, enabled: true, thresholdDb: -50, rangeDb: -60, attackMs: 5, releaseMs: 150};
};

type NumberFieldProps = {label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void};
const NumberField = ({label, value, min, max, step = 1, onChange}: NumberFieldProps) => <label>
  <span>{label}</span>
  <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.currentTarget.value))} />
</label>;

const EqBandEditor = ({band, onChange}: {band: EqBand; onChange: (band: EqBand) => void}) => <div className="dc-audio-eq-band">
  <label><input type="checkbox" checked={band.enabled} onChange={(event) => onChange({...band, enabled: event.currentTarget.checked})} /> Band</label>
  <select value={band.type} onChange={(event) => onChange({...band, type: event.currentTarget.value as EqBand["type"]})}>
    <option value="high-pass">High pass</option><option value="low-shelf">Low shelf</option><option value="bell">Bell</option>
    <option value="high-shelf">High shelf</option><option value="low-pass">Low pass</option>
  </select>
  <NumberField label="Hz" value={band.frequency} min={20} max={20_000} onChange={(frequency) => onChange({...band, frequency})} />
  <NumberField label="Gain" value={band.gainDb} min={-24} max={24} step={0.1} onChange={(gainDb) => onChange({...band, gainDb})} />
  <NumberField label="Q" value={band.q} min={0.1} max={20} step={0.1} onChange={(q) => onChange({...band, q})} />
</div>;

export type AudioProcessorRackProps = {processors: AudioProcessor[]; onChange: (processors: AudioProcessor[]) => void; disabled?: boolean};

export const AudioProcessorRack = ({processors, onChange, disabled}: AudioProcessorRackProps) => {
  const [newType, setNewType] = useState<AudioProcessor["type"]>("eq");
  const update = (index: number, processor: AudioProcessor) => onChange(processors.map((item, itemIndex) => itemIndex === index ? processor : item));
  return <section className="dc-audio-rack" aria-label="Audio processor rack">
    <header><strong>Processor rack</strong><span>{processors.filter((item) => item.enabled).length} active</span></header>
    {processors.map((processor, index) => <article key={processor.id} className="dc-audio-processor">
      <header>
        <label><input disabled={disabled} type="checkbox" checked={processor.enabled} onChange={(event) => update(index, {...processor, enabled: event.currentTarget.checked})} /> {processor.type.replace("-", " ")}</label>
        <button disabled={disabled} type="button" onClick={() => onChange(processors.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
      </header>
      {processor.type === "eq" ? processor.bands.map((band, bandIndex) => <EqBandEditor key={band.id} band={band} onChange={(next) => update(index, {...processor, bands: processor.bands.map((item, itemIndex) => itemIndex === bandIndex ? next : item)})} />) : null}
      {processor.type === "compressor" ? <div className="dc-audio-processor-grid">
        <NumberField label="Threshold dB" value={processor.thresholdDb} min={-80} max={0} step={0.1} onChange={(thresholdDb) => update(index, {...processor, thresholdDb})} />
        <NumberField label="Ratio" value={processor.ratio} min={1} max={30} step={0.1} onChange={(ratio) => update(index, {...processor, ratio})} />
        <NumberField label="Attack ms" value={processor.attackMs} min={0.1} max={2000} step={0.1} onChange={(attackMs) => update(index, {...processor, attackMs})} />
        <NumberField label="Release ms" value={processor.releaseMs} min={1} max={10000} onChange={(releaseMs) => update(index, {...processor, releaseMs})} />
        <NumberField label="Knee dB" value={processor.kneeDb} min={0} max={40} step={0.1} onChange={(kneeDb) => update(index, {...processor, kneeDb})} />
        <NumberField label="Makeup dB" value={processor.makeupDb} min={-24} max={24} step={0.1} onChange={(makeupDb) => update(index, {...processor, makeupDb})} />
      </div> : null}
      {processor.type === "limiter" ? <div className="dc-audio-processor-grid">
        <NumberField label="Ceiling dB" value={processor.ceilingDb} min={-24} max={0} step={0.1} onChange={(ceilingDb) => update(index, {...processor, ceilingDb})} />
        <NumberField label="Attack ms" value={processor.attackMs} min={0.1} max={100} step={0.1} onChange={(attackMs) => update(index, {...processor, attackMs})} />
        <NumberField label="Release ms" value={processor.releaseMs} min={1} max={5000} onChange={(releaseMs) => update(index, {...processor, releaseMs})} />
      </div> : null}
      {processor.type === "noise-gate" ? <div className="dc-audio-processor-grid">
        <NumberField label="Threshold dB" value={processor.thresholdDb} min={-100} max={0} step={0.1} onChange={(thresholdDb) => update(index, {...processor, thresholdDb})} />
        <NumberField label="Range dB" value={processor.rangeDb} min={-100} max={0} step={0.1} onChange={(rangeDb) => update(index, {...processor, rangeDb})} />
        <NumberField label="Attack ms" value={processor.attackMs} min={0.1} max={2000} step={0.1} onChange={(attackMs) => update(index, {...processor, attackMs})} />
        <NumberField label="Release ms" value={processor.releaseMs} min={1} max={10000} onChange={(releaseMs) => update(index, {...processor, releaseMs})} />
      </div> : null}
    </article>)}
    <footer>
      <select disabled={disabled} value={newType} onChange={(event) => setNewType(event.currentTarget.value as AudioProcessor["type"])}>
        <option value="eq">Parametric EQ</option><option value="compressor">Compressor</option><option value="limiter">Limiter</option><option value="noise-gate">Noise gate</option>
      </select>
      <button disabled={disabled || processors.length >= 32} type="button" onClick={() => onChange([...processors, createAudioProcessor(newType)])}>Add processor</button>
    </footer>
  </section>;
};
