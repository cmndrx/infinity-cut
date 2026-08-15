import {useMemo, useState} from "react";
import type {EditorTrack, ProjectAudioSettings} from "../types";
import {normalizeProjectAudioSettings, normalizeTrackAudio} from "./project-audio";
import {AudioProcessorRack} from "./AudioProcessorRack";

export type AudioMixerPanelProps = {
  tracks: EditorTrack[];
  settings: ProjectAudioSettings | undefined;
  onTracksChange: (tracks: EditorTrack[]) => void;
  onSettingsChange: (settings: ProjectAudioSettings) => void;
};

const dbToLinear = (db: number) => db <= -100 ? 0 : 10 ** (db / 20);
const linearToDb = (gain: number) => gain <= 0 ? -100 : Math.max(-100, Math.min(24, 20 * Math.log10(gain)));

export const AudioMixerPanel = ({tracks, settings: rawSettings, onTracksChange, onSettingsChange}: AudioMixerPanelProps) => {
  const settings = useMemo(() => normalizeProjectAudioSettings(rawSettings), [rawSettings]);
  const audioTracks = tracks.filter((track) => track.kind === "audio").map((track) => normalizeTrackAudio(track, settings));
  const [selection, setSelection] = useState(() => audioTracks[0] ? `track:${audioTracks[0].id}` : `bus:${settings.masterBusId}`);
  const [kind, selectedId] = selection.split(":", 2);
  const selectedTrack = kind === "track" ? audioTracks.find((track) => track.id === selectedId) : undefined;
  const selectedBus = kind === "bus" ? settings.buses.find((bus) => bus.id === selectedId) : undefined;
  const patchTrack = (patch: Partial<EditorTrack>) => onTracksChange(tracks.map((track) => track.id === selectedTrack?.id ? {...track, ...patch} : track));
  const patchBus = (patch: Partial<NonNullable<typeof selectedBus>>) => onSettingsChange({...settings, buses: settings.buses.map((bus) => bus.id === selectedBus?.id ? {...bus, ...patch} : bus)});

  return <section className="dc-audio-mixer" aria-label="Professional audio mixer">
    <header><div><strong>Audio Track Mixer</strong><span>{(settings.sampleRate / 1000).toFixed(settings.sampleRate % 1000 ? 1 : 0)} kHz · live processor preview</span></div></header>
    <nav aria-label="Mixer channels">
      {audioTracks.map((track) => <button type="button" aria-pressed={selection === `track:${track.id}`} key={track.id} onClick={() => setSelection(`track:${track.id}`)}>{track.name}</button>)}
      {settings.buses.map((bus) => <button type="button" aria-pressed={selection === `bus:${bus.id}`} key={bus.id} onClick={() => setSelection(`bus:${bus.id}`)}>{bus.name}</button>)}
    </nav>
    {selectedTrack ? <div className="dc-audio-channel-editor">
      <h3>{selectedTrack.name}</h3>
      <label>Output <select value={selectedTrack.audioBusId} onChange={(event) => patchTrack({audioBusId: event.currentTarget.value})}>{settings.buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}</select></label>
      <label>Level <input aria-label="Track level" type="range" min={-100} max={24} step={0.1} value={linearToDb(selectedTrack.volume)} onChange={(event) => patchTrack({volume: dbToLinear(Number(event.currentTarget.value))})} /><output>{linearToDb(selectedTrack.volume).toFixed(1)} dB</output></label>
      <label>Pan <input aria-label="Track pan" type="range" min={-1} max={1} step={0.01} value={selectedTrack.audioPan} onChange={(event) => patchTrack({audioPan: Number(event.currentTarget.value)})} /><output>{Math.round((selectedTrack.audioPan ?? 0) * 100)}</output></label>
      <AudioProcessorRack processors={selectedTrack.audioProcessors ?? []} onChange={(audioProcessors) => patchTrack({audioProcessors})} />
    </div> : null}
    {selectedBus ? <div className="dc-audio-channel-editor">
      <h3>{selectedBus.name}</h3>
      {selectedBus.id !== settings.masterBusId ? <label>Output <select value={selectedBus.outputBusId ?? settings.masterBusId} onChange={(event) => patchBus({outputBusId: event.currentTarget.value})}>{settings.buses.filter((bus) => bus.id !== selectedBus.id).map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}</select></label> : null}
      <label>Level <input aria-label="Bus level" type="range" min={-100} max={24} step={0.1} value={selectedBus.gainDb} onChange={(event) => patchBus({gainDb: Number(event.currentTarget.value)})} /><output>{selectedBus.gainDb.toFixed(1)} dB</output></label>
      <label>Pan <input aria-label="Bus pan" type="range" min={-1} max={1} step={0.01} value={selectedBus.pan} onChange={(event) => patchBus({pan: Number(event.currentTarget.value)})} /><output>{Math.round(selectedBus.pan * 100)}</output></label>
      <AudioProcessorRack processors={selectedBus.processors} onChange={(processors) => patchBus({processors})} />
    </div> : null}
  </section>;
};
