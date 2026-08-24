/* eslint-disable @remotion/non-pure-animation, @remotion/warn-native-media-tag -- Editor UI state and native source monitor media are interactive and are not rendered as a Remotion composition. */
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Player, type PlayerRef} from "@remotion/player";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AudioWaveform,
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Copy,
  Download,
  Diamond,
  Eye,
  EyeOff,
  FileVideo2,
  Film,
  FolderPlus,
  FolderOpen,
  Gauge,
  Grid2X2,
  HardDrive,
  Image as ImageIcon,
  Info,
  Layers3,
  Link2,
  List,
  LoaderCircle,
  Lock,
  Magnet,
  Maximize2,
  Menu,
  MessageSquare,
  MousePointer2,
  Palette,
  Pause,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  StepBack,
  StepForward,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {EditorComposition} from "./EditorComposition";
import {ProfessionalColorControls} from "./ProfessionalColorControls";
import {maskAtFrame, upsertMaskKeyframe} from "./masks";
import {sourceTimeForTimelineFrame, trackTemplateTranslation, trackingRegionForMask} from "./tracking";
import {getAnimatedPropertyValue, hasKeyframeAt, hasPropertyKeyframes} from "./animation";
import {getClipPlaybackRate, getClipSourceSpan, MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, playbackRateForDuration} from "./clip-speed";
import {cloneClips, editTimelineRange, moveClips, placeMedia, retimeClip, rippleDelete, splitClip, trimClip, type CommandResult} from "./core";
import {conformMediaToFrameRate, formatFrameRate, frameRatesMatch, normalizeFrameRate, retimeProjectForFrameRate} from "./frame-rate";
import {createProjectFile, normalizeProject, saveStoredProject} from "./project-storage";
import {canNestSequence, createSequence, switchActiveSequence, syncActiveSequence} from "./sequences";
import {appendSharedComment, createReviewComment, createVersionSnapshot, diffProjects, fetchSharedProject, publishSharedProject, setReviewCommentResolved, updateSharedComments, updateSharedProject, type ProjectVersionSnapshot, type ReviewComment, type SharedProjectPayload, type SharedProjectSession} from "./collaboration";
import {exportCmx3600Edl, exportFcp7Xml} from "./interchange";
import type {EditorClip, EditorProject, EditorTrack, EditorTransition, KeyframeProperty, MediaKind, ProjectMedia, TextStyle, TransitionType} from "./types";
import {DEFAULT_CAPTION_STYLE, DEFAULT_COLOR_GRADE, DEFAULT_EFFECTS, DEFAULT_TITLE_STYLE, DEFAULT_TRANSFORM} from "./types";
import {AudioMixerPanel, observeLiveAudioPreview, VoiceoverRecorder, type VoiceoverRecording, type VoiceoverUpload} from "./audio";
import {createVisualEffectInstance, getVisualEffectDescriptor, listVisualEffects, type VisualEffectInstance} from "./effects/registry";
import {importObjectMatteSequence} from "./mattes/object-matte";
import {resolveMediaPreviewSource, type ProxyApiStatus} from "./proxy";
import {waveformForClip, type MediaAnalysisApiStatus} from "./media-analysis";
import {frameRangeIntersects, timelineFrameWindow, visibleRulerSeconds} from "./timeline-virtualization";
import {projectRenderFingerprint, usableRenderCache} from "./render-cache";

type MediaItem = ProjectMedia;
type MediaView = "grid" | "list";
type MediaSort = "name" | "duration" | "type" | "date";
type MediaFileAction = "relink" | "replace";
type ScopeMode = "waveform" | "rgb";
type ScopeData = {waveform: number[]; red: number[]; green: number[]; blue: number[]};
type ExportFormat = "mp4" | "webm" | "hevc" | "prores" | "png-sequence" | "jpeg-sequence" | "wav" | "audio-stems";
type ExportQuality = "draft" | "standard" | "high";
type ExportResolution = "source" | "720p";
type ExportRange = "sequence" | "selected";
type FrameRateChoice = "change" | "keep";
type FrameRateMismatch = {
  mediaName: string;
  mediaFps: number;
  projectFps: number;
  width?: number;
  height?: number;
};
type SpeedDialogState = {
  clipId: string;
  sourceSpan: number;
  speedPercent: number;
  durationFrames: number;
  ripple: boolean;
  preservePitch: boolean;
};
type RenderJobStatus = {
  id: string;
  stage: "queued" | "bundling" | "rendering" | "packaging" | "complete" | "cancelled" | "error";
  progress: number;
  message: string;
  filename: string;
  sizeBytes?: number;
  error?: string;
  downloadUrl?: string;
  createdAt?: number;
  attempts?: number;
};
type PropertyGroup = "transform" | "effects" | "audio";
type TimelineTool = "select" | "razor" | "ripple" | "roll" | "slip" | "slide";
type EditMode = "insert" | "overwrite";
type TimelineRange = {inFrame: number; outFrame: number};
type DragMode = "move" | "trim-start" | "trim-end" | "ripple-start" | "ripple-end" | "roll-end" | "slip" | "slide" | "fade-in" | "fade-out";
type DragState = {
  clipId: string;
  mode: DragMode;
  originX: number;
  originY: number;
  initialStart: number;
  initialDuration: number;
  initialSourceStart: number;
  initialFadeIn: number;
  initialFadeOut: number;
  selected: Array<{id: string; start: number; trackId: string; duration: number; sourceStart: number}>;
};
type DropTarget = {
  trackId: string;
  frame: number;
  duration: number;
  allowed: boolean;
};
type BinPointerDrag = {
  item: MediaItem;
  originX: number;
  originY: number;
  x: number;
  y: number;
  active: boolean;
};
type ClipboardPackage = {clips: EditorClip[]; transitions: EditorTransition[]};
type MarqueeState = {
  startX: number;
  startY: number;
  x: number;
  y: number;
  additive: boolean;
};
type ClipContextMenu = {
  clipId: string;
  x: number;
  y: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const linearToDb = (value: number) => value <= 0.001 ? -60 : Math.max(-60, 20 * Math.log10(value));
const dbToLinear = (value: number) => value <= -60 ? 0 : 10 ** (value / 20);
const clipTrackKind = (kind: MediaKind): EditorTrack["kind"] => kind === "audio" ? "audio" : kind === "caption" ? "caption" : "video";
const isTransitionClip = (clip: EditorClip | null | undefined): clip is EditorClip => Boolean(clip && clip.kind !== "audio" && clip.kind !== "caption");
const C1_TRACK: EditorTrack = {id: "c1", name: "C1", kind: "caption", muted: false, solo: false, volume: 1, hidden: false, locked: false};

const parseSubtitleTime = (value: string) => {
  const match = value.trim().match(/(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return null;
  return ((Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000) + Number(match[4]);
};

const parseSubtitleFile = (source: string, fps: number) => source
  .replace(/^\uFEFF/, "")
  .replace(/^WEBVTT[^\n]*\n+/i, "")
  .split(/\r?\n\s*\r?\n/)
  .map((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trimEnd());
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) return null;
    const [from, to] = lines[timingIndex].split("-->");
    const startMs = parseSubtitleTime(from);
    const endMs = parseSubtitleTime(to.trim().split(/\s+/)[0]);
    const text = lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (startMs === null || endMs === null || endMs <= startMs || !text) return null;
    const start = Math.max(0, Math.round((startMs / 1000) * fps));
    return {start, duration: Math.max(2, Math.round(((endMs - startMs) / 1000) * fps)), text};
  })
  .filter((item): item is {start: number; duration: number; text: string} => Boolean(item));

const formatSrtTime = (frame: number, fps: number) => {
  const milliseconds = Math.max(0, Math.round((frame / fps) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const formatBytes = (bytes: number) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const EXPORT_FORMAT_LABELS: Record<ExportFormat, {name: string; summary: string; download: string}> = {
  mp4: {name: "MP4 (H.264)", summary: "H.264 + AAC", download: "MP4"},
  hevc: {name: "MP4 (HEVC / H.265)", summary: "HEVC + AAC", download: "HEVC"},
  prores: {name: "QuickTime (Apple ProRes 422)", summary: "ProRes 422 + PCM", download: "MOV"},
  webm: {name: "WebM (VP9)", summary: "VP9 + Opus", download: "WEBM"},
  "png-sequence": {name: "PNG image sequence", summary: "Lossless PNG frames · ZIP", download: "ZIP"},
  "jpeg-sequence": {name: "JPEG image sequence", summary: "JPEG frames · ZIP", download: "ZIP"},
  wav: {name: "WAV master mix", summary: "Lossless PCM audio", download: "WAV"},
  "audio-stems": {name: "WAV track stems", summary: "One WAV per audio track · ZIP", download: "ZIP"},
};

const formatTimecode = (frame: number, fps: number) => {
  const safe = Math.max(0, Math.round(frame));
  const nominalFps = Math.max(1, Math.round(fps));
  const totalSeconds = Math.floor(safe / fps);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const seconds = totalSeconds % 60;
  const frames = Math.min(nominalFps - 1, Math.max(0, Math.round(safe - totalSeconds * fps)));
  return [hours, minutes, seconds, frames].map((part) => String(part).padStart(2, "0")).join(":");
};

const formatPropertyName = (property: string) => ({
  x: "Position X",
  y: "Position Y",
  scale: "Scale",
  rotation: "Rotation",
  opacity: "Opacity",
  brightness: "Brightness",
  contrast: "Contrast",
  saturation: "Saturation",
  blur: "Gaussian blur",
  volume: "Clip gain",
}[property] ?? property.replace(/([A-Z])/g, " $1"));

const TRANSITION_NAMES: Record<TransitionType, string> = {
  "cross-dissolve": "Cross Dissolve",
  "dip-to-black": "Dip to Black",
  "wipe-left": "Wipe Left",
  "slide-left": "Slide Left",
};

const COLOR_PRESETS: Array<{name: string; colors: string[]; values: Partial<EditorClip["effects"]>}> = [
  {name: "Clean", colors: ["#22252b", "#7d8795"], values: {...DEFAULT_EFFECTS, look: "Clean"}},
  {name: "Cinema", colors: ["#0f2d3b", "#d99755"], values: {temperature: -12, tint: 8, exposure: -0.15, contrast: 116, saturation: 86, highlights: -24, shadows: 14, fade: 8, vignette: 28, look: "Cinema"}},
  {name: "Sunset", colors: ["#7d2638", "#f4a94d"], values: {temperature: 34, tint: 8, exposure: 0.1, contrast: 108, saturation: 116, highlights: -8, shadows: 12, vibrance: 20, look: "Sunset"}},
  {name: "Neon", colors: ["#2638a0", "#e026b9"], values: {temperature: -18, tint: 22, contrast: 126, saturation: 134, vibrance: 36, glow: 22, look: "Neon"}},
  {name: "Mono", colors: ["#181818", "#dedede"], values: {saturation: 0, contrast: 118, grain: 16, look: "Mono"}},
  {name: "Vintage", colors: ["#5f4938", "#c4a26c"], values: {temperature: 22, tint: -8, saturation: 72, fade: 20, grain: 28, vignette: 22, look: "Vintage"}},
];

const transitionIsValid = (project: EditorProject, transition: EditorTransition) => {
  const from = project.clips.find((clip) => clip.id === transition.fromClipId);
  const to = project.clips.find((clip) => clip.id === transition.toClipId);
  if (!from || !to || !isTransitionClip(from) || !isTransitionClip(to)) return false;
  return from.trackId === to.trackId && from.start + from.duration === to.start;
};

const pruneTransitions = (project: EditorProject) => {
  project.transitions = (project.transitions ?? []).filter((transition) => transitionIsValid(project, transition));
};

const clipIcon = (kind: MediaKind, size = 13) => {
  if (kind === "audio") return <AudioWaveform size={size} />;
  if (kind === "image") return <ImageIcon size={size} />;
  if (kind === "title") return <Type size={size} />;
  if (kind === "caption") return <Captions size={size} />;
  return <Film size={size} />;
};

const cloneProject = (project: EditorProject): EditorProject => JSON.parse(JSON.stringify(project)) as EditorProject;
const cloneClip = (clip: EditorClip): EditorClip => JSON.parse(JSON.stringify(clip)) as EditorClip;

type EditorAppProps = {
  projectId: string;
  initialProject: EditorProject;
  onBackToProjects: () => void;
};

export const EditorApp: React.FC<EditorAppProps> = ({projectId, initialProject, onBackToProjects}) => {
  const [project, setProject] = useState<EditorProject>(() => normalizeProject(initialProject));
  const projectRef = useRef(project);
  projectRef.current = project;
  const [past, setPast] = useState<EditorProject[]>([]);
  const [future, setFuture] = useState<EditorProject[]>([]);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>(() => initialProject.clips[0] ? [initialProject.clips[0].id] : []);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<TimelineTool>("select");
  const [linkedSelection, setLinkedSelection] = useState(true);
  const [editMode, setEditMode] = useState<EditMode>("overwrite");
  const [destinationRoutes, setDestinationRoutes] = useState<Record<EditorTrack["kind"], string>>(() => ({
    video: initialProject.tracks.find((track) => track.id === "v2")?.id ?? initialProject.tracks.find((track) => track.kind === "video")?.id ?? "",
    audio: initialProject.tracks.find((track) => track.id === "a1")?.id ?? initialProject.tracks.find((track) => track.kind === "audio")?.id ?? "",
    caption: initialProject.tracks.find((track) => track.kind === "caption")?.id ?? "",
  }));
  const [targetedTrackIds, setTargetedTrackIds] = useState<string[]>(() => initialProject.tracks.filter((track) => !track.locked).map((track) => track.id));
  const [monitorMode, setMonitorMode] = useState<"source" | "program">("program");
  const [sourceFrame, setSourceFrame] = useState(0);
  const [sourcePlaying, setSourcePlaying] = useState(false);
  const [sourceRanges, setSourceRanges] = useState<Record<string, {inFrame: number; outFrame: number}>>({});
  const [useProxies, setUseProxies] = useState(() => window.localStorage.getItem("directors-use-proxies") !== "false");
  const [useRenderCache, setUseRenderCache] = useState(() => window.localStorage.getItem("directors-use-render-cache") !== "false");
  const [timelineRange, setTimelineRange] = useState<TimelineRange | null>(null);
  const [shuttleRate, setShuttleRate] = useState(0);
  const [frame, setFrame] = useState(105);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1.45);
  const [snap, setSnap] = useState(true);
  const [search, setSearch] = useState("");
  const [activeLeftTab, setActiveLeftTab] = useState<"project" | "color" | "effects" | "text" | "audio">("project");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("waveform");
  const [scopeData, setScopeData] = useState<ScopeData>({waveform: Array(48).fill(0.5), red: Array(32).fill(0), green: Array(32).fill(0), blue: Array(32).fill(0)});
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  const [showMaskOverlay, setShowMaskOverlay] = useState(true);
  const [maskTracking, setMaskTracking] = useState<{running: boolean; progress: number; confidence?: number}>({running: false, progress: 0});
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [activeBinId, setActiveBinId] = useState<"all" | string>("all");
  const [mediaView, setMediaView] = useState<MediaView>("grid");
  const [mediaSort, setMediaSort] = useState<MediaSort>("name");
  const [mediaKindFilter, setMediaKindFilter] = useState<"all" | ProjectMedia["kind"]>("all");
  const [editingMediaName, setEditingMediaName] = useState(false);
  const [editingBinId, setEditingBinId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [binPointerDrag, setBinPointerDrag] = useState<BinPointerDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [contextMenu, setContextMenu] = useState<ClipContextMenu | null>(null);
  const [dragTrackTarget, setDragTrackTarget] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [timelineViewport, setTimelineViewport] = useState({scrollLeft: 0, width: 940});
  const [toast, setToast] = useState("Autosaved just now");
  const [exportOpen, setExportOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewCommentText, setReviewCommentText] = useState("");
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(`directors-review-comments:${projectId}`) ?? "[]") as ReviewComment[]; } catch { return []; }
  });
  const [projectVersions, setProjectVersions] = useState<ProjectVersionSnapshot[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(`directors-project-versions:${projectId}`) ?? "[]") as ProjectVersionSnapshot[]; } catch { return []; }
  });
  const [sharedSession, setSharedSession] = useState<SharedProjectSession | null>(() => {
    try { return JSON.parse(window.localStorage.getItem(`directors-shared-session:${projectId}`) ?? "null") as SharedProjectSession | null; } catch { return null; }
  });
  const [sharedStatus, setSharedStatus] = useState<"local" | "syncing" | "synced" | "conflict" | "error">("local");
  const [remoteConflict, setRemoteConflict] = useState<SharedProjectPayload | null>(null);
  const [effectsSearch, setEffectsSearch] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
  const [exportQuality, setExportQuality] = useState<ExportQuality>("standard");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("source");
  const [exportRange, setExportRange] = useState<ExportRange>("sequence");
  const [renderJob, setRenderJob] = useState<RenderJobStatus | null>(null);
  const [exportJobs, setExportJobs] = useState<RenderJobStatus[]>([]);
  const [renderStarting, setRenderStarting] = useState(false);
  const [frameRateMismatch, setFrameRateMismatch] = useState<FrameRateMismatch | null>(null);
  const [speedDialog, setSpeedDialog] = useState<SpeedDialogState | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const sourceFrameRef = useRef(sourceFrame);
  sourceFrameRef.current = sourceFrame;
  const sourceMediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const initialFrameRef = useRef(frame);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaActionInputRef = useRef<HTMLInputElement>(null);
  const pendingMediaActionRef = useRef<{id: string; action: MediaFileAction} | null>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const timelineScrollerRef = useRef<HTMLDivElement>(null);
  const dragOriginProjectRef = useRef<EditorProject | null>(null);
  const dragPreviewProjectRef = useRef<EditorProject | null>(null);
  const clipIdCounterRef = useRef(0);
  const binPointerDragRef = useRef<BinPointerDrag | null>(null);
  const clipboardRef = useRef<ClipboardPackage>({clips: [], transitions: []});
  const colorClipboardRef = useRef<EditorClip["effects"] | null>(null);
  const marqueeRef = useRef<MarqueeState | null>(null);
  const analysisRequestsRef = useRef<Set<string>>(new Set());
  const frameRateChoiceResolverRef = useRef<((choice: FrameRateChoice) => void) | null>(null);
  const maskDragRef = useRef<{maskId: string; clientX: number; clientY: number; x: number; y: number; width: number; height: number; mode: "move" | "resize"; corner?: "nw" | "ne" | "sw" | "se"} | null>(null);
  const cancelMaskTrackingRef = useRef(false);

  useEffect(() => {
    if (drag) return;
    const timeout = window.setTimeout(() => {
      try {
        saveStoredProject(projectId, syncActiveSequence(project));
        setToast("Autosaved just now");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Autosave failed");
      }
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [drag, project, projectId]);

  useEffect(() => {
    const saveBeforeClose = () => {
      try {
        saveStoredProject(projectId, syncActiveSequence(dragOriginProjectRef.current ?? projectRef.current));
      } catch {
        // The visible autosave status reports storage failures during normal editing.
      }
    };
    window.addEventListener("beforeunload", saveBeforeClose);
    return () => window.removeEventListener("beforeunload", saveBeforeClose);
  }, [projectId]);

  useEffect(() => {
    window.localStorage.setItem(`directors-review-comments:${projectId}`, JSON.stringify(reviewComments));
  }, [projectId, reviewComments]);

  useEffect(() => {
    window.localStorage.setItem(`directors-project-versions:${projectId}`, JSON.stringify(projectVersions.slice(-20)));
  }, [projectId, projectVersions]);

  useEffect(() => {
    if (sharedSession) window.localStorage.setItem(`directors-shared-session:${projectId}`, JSON.stringify(sharedSession));
    else window.localStorage.removeItem(`directors-shared-session:${projectId}`);
  }, [projectId, sharedSession]);

  useEffect(() => {
    window.localStorage.setItem("directors-use-proxies", String(useProxies));
  }, [useProxies]);

  useEffect(() => {
    window.localStorage.setItem("directors-use-render-cache", String(useRenderCache));
  }, [useRenderCache]);

  const proxyPollKey = project.media
    .filter((item) => item.proxy && (item.proxy.status === "queued" || item.proxy.status === "processing"))
    .map((item) => `${item.id}:${item.proxy!.id}`)
    .sort()
    .join("|");
  useEffect(() => {
    if (!proxyPollKey) return;
    let disposed = false;
    const poll = async () => {
      const active = projectRef.current.media.filter((item) => item.proxy && (item.proxy.status === "queued" || item.proxy.status === "processing"));
      const updates = await Promise.all(active.map(async (item) => {
        try {
          const response = await fetch(`/api/proxies/${item.proxy!.id}`);
          if (response.status === 404) return {mediaId: item.id, proxy: {...item.proxy!, status: "error" as const, error: "Proxy job was interrupted; create it again"}};
          const proxy = await response.json() as ProxyApiStatus & {error?: string};
          if (!response.ok) throw new Error(proxy.error ?? "Proxy status failed");
          return {mediaId: item.id, proxy};
        } catch (error) {
          return {mediaId: item.id, proxy: {...item.proxy!, status: "error" as const, error: error instanceof Error ? error.message : "Proxy status failed"}};
        }
      }));
      if (disposed || !updates.length) return;
      setProject((current) => {
        let changed = false;
        const media = current.media.map((item) => {
          const update = updates.find((candidate) => candidate.mediaId === item.id);
          if (!update || JSON.stringify(item.proxy) === JSON.stringify(update.proxy)) return item;
          changed = true;
          return {...item, proxy: update.proxy};
        });
        return changed ? {...current, media} : current;
      });
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 750);
    return () => {disposed = true; window.clearInterval(interval);};
  }, [proxyPollKey]);

  useEffect(() => {
    for (const media of project.media) {
      if (media.analysis || media.offline || media.renderReady === false || analysisRequestsRef.current.has(media.id)) continue;
      analysisRequestsRef.current.add(media.id);
      void (async () => {
        try {
          const response = await fetch("/api/media-analysis", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({src: media.src, kind: media.kind})});
          const analysis = await response.json() as MediaAnalysisApiStatus & {error?: string};
          if (!response.ok) throw new Error(analysis.error ?? "Media preparation could not start");
          setProject((current) => ({...current, media: current.media.map((item) => item.id === media.id ? {...item, analysis} : item)}));
        } catch (error) {
          analysisRequestsRef.current.delete(media.id);
          setToast(error instanceof Error ? error.message : "Media preparation failed");
        }
      })();
    }
  }, [project.media]);

  const analysisPollKey = project.media
    .filter((item) => item.analysis && (item.analysis.status === "queued" || item.analysis.status === "processing"))
    .map((item) => `${item.id}:${item.analysis!.id}`)
    .sort()
    .join("|");
  useEffect(() => {
    if (!analysisPollKey) return;
    let disposed = false;
    const poll = async () => {
      const active = projectRef.current.media.filter((item) => item.analysis && (item.analysis.status === "queued" || item.analysis.status === "processing"));
      const updates = await Promise.all(active.map(async (item) => {
        try {
          const response = await fetch(`/api/media-analysis/${item.analysis!.id}`);
          if (response.status === 404) return {mediaId: item.id, analysis: {...item.analysis!, status: "error" as const, error: "Media preparation was interrupted"}};
          const analysis = await response.json() as MediaAnalysisApiStatus & {error?: string};
          if (!response.ok) throw new Error(analysis.error ?? "Media preparation status failed");
          return {mediaId: item.id, analysis};
        } catch (error) {
          return {mediaId: item.id, analysis: {...item.analysis!, status: "error" as const, error: error instanceof Error ? error.message : "Media preparation status failed"}};
        }
      }));
      if (disposed || !updates.length) return;
      setProject((current) => {
        let changed = false;
        const media = current.media.map((item) => {
          const update = updates.find((candidate) => candidate.mediaId === item.id);
          if (!update || JSON.stringify(item.analysis) === JSON.stringify(update.analysis)) return item;
          changed = true;
          return {...item, analysis: update.analysis};
        });
        return changed ? {...current, media} : current;
      });
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 750);
    return () => {disposed = true; window.clearInterval(interval);};
  }, [analysisPollKey]);

  const cachePollKey = project.renderCache && (project.renderCache.status === "queued" || project.renderCache.status === "rendering") ? project.renderCache.id : "";
  useEffect(() => {
    if (!cachePollKey) return;
    let disposed = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/render-cache/${cachePollKey}`);
        const renderCache = await response.json() as NonNullable<EditorProject["renderCache"]> & {error?: string};
        if (!response.ok) throw new Error(renderCache.error ?? "Timeline cache status failed");
        if (!disposed) setProject((current) => current.renderCache?.id === cachePollKey ? {...current, renderCache} : current);
      } catch (error) {
        if (!disposed) setProject((current) => current.renderCache?.id === cachePollKey ? {...current, renderCache: {...current.renderCache, status: "error", error: error instanceof Error ? error.message : "Timeline cache status failed"} as NonNullable<EditorProject["renderCache"]>} : current);
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 1000);
    return () => {disposed = true; window.clearInterval(interval);};
  }, [cachePollKey]);

  useEffect(() => {
    setDestinationRoutes((current) => {
      const next = {...current};
      let changed = false;
      for (const kind of ["video", "audio", "caption"] as const) {
        if (!project.tracks.some((track) => track.id === next[kind] && track.kind === kind)) {
          next[kind] = project.tracks.find((track) => track.kind === kind)?.id ?? "";
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [project.tracks]);

  useEffect(() => {
    setTargetedTrackIds((current) => current.filter((id) => project.tracks.some((track) => track.id === id)));
  }, [project.tracks]);

  const pixelsPerFrame = zoom * 1.35;
  const timelineWidth = Math.max(940, project.durationInFrames * pixelsPerFrame + 120);
  const virtualTimelineWindow = useMemo(() => timelineFrameWindow(timelineViewport, pixelsPerFrame, project.durationInFrames), [pixelsPerFrame, project.durationInFrames, timelineViewport]);
  const virtualRulerSeconds = useMemo(() => visibleRulerSeconds(virtualTimelineWindow, project.fps, project.durationInFrames), [project.durationInFrames, project.fps, virtualTimelineWindow]);
  const virtualClipsByTrack = useMemo(() => project.clips.reduce<Record<string, EditorClip[]>>((tracks, clip) => {
    if (!frameRangeIntersects(clip.start, clip.duration, virtualTimelineWindow)) return tracks;
    (tracks[clip.trackId] ??= []).push(clip);
    return tracks;
  }, {}), [project.clips, virtualTimelineWindow]);
  const virtualTransitionsByTrack = useMemo(() => {
    const clipsById = new Map(project.clips.map((clip) => [clip.id, clip]));
    return project.transitions.reduce<Record<string, EditorTransition[]>>((tracks, transition) => {
      const from = clipsById.get(transition.fromClipId);
      const to = clipsById.get(transition.toClipId);
      if (!from || !to || !isTransitionClip(from) || !isTransitionClip(to) || from.trackId !== to.trackId || from.start + from.duration !== to.start) return tracks;
      if (!frameRangeIntersects(to.start - transition.duration / 2, transition.duration, virtualTimelineWindow)) return tracks;
      (tracks[from.trackId] ??= []).push(transition);
      return tracks;
    }, {});
  }, [project.clips, project.transitions, virtualTimelineWindow]);
  const waveforms = useMemo(() => Object.fromEntries(project.clips.filter((clip) => clip.kind === "audio").map((clip) => {
    const media = project.media.find((item) => item.id === clip.sourceMediaId);
    return [clip.id, waveformForClip(clip, media, project.fps)];
  })), [project.clips, project.fps, project.media]);
  const selectedClipId = selectedClipIds[selectedClipIds.length - 1] ?? null;
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId) ?? null;
  const selectedTransition = project.transitions.find((transition) => transition.id === selectedTransitionId) ?? null;
  const playerInputProps = useMemo(() => ({project, useProxies, useRenderCache}), [project, useProxies, useRenderCache]);
  const binPointerDragId = binPointerDrag?.item.id;
  const marqueeActive = marquee !== null;

  useEffect(() => {
    const scroller = timelineScrollerRef.current;
    if (!scroller) return;
    let animationFrame = 0;
    const measure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => setTimelineViewport({scrollLeft: scroller.scrollLeft, width: scroller.clientWidth}));
    };
    measure();
    scroller.addEventListener("scroll", measure, {passive: true});
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      scroller.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  const commit = useCallback((updater: (draft: EditorProject) => void, message?: string) => {
    setProject((current) => {
      const next = cloneProject(current);
      updater(next);
      setPast((items) => [...items.slice(-49), cloneProject(current)]);
      setFuture([]);
      return next;
    });
    if (message) setToast(message);
  }, []);

  const applyKernelResult = useCallback((result: CommandResult, message: string, before = project) => {
    if (!result.ok) {
      setProject(cloneProject(before));
      setToast(result.error.message);
      return false;
    }
    if (!result.changed) {
      setProject(cloneProject(before));
      return false;
    }
    setProject(result.project);
    setPast((items) => [...items.slice(-49), cloneProject(before)]);
    setFuture([]);
    setToast(message);
    return true;
  }, [project]);

  const openSpeedDialog = useCallback((clipId?: string) => {
    const targetId = clipId ?? selectedClipId;
    const clip = project.clips.find((candidate) => candidate.id === targetId);
    const track = project.tracks.find((candidate) => candidate.id === clip?.trackId);
    if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) {
      setToast("Select a video or audio clip to adjust speed");
      return;
    }
    if (track?.locked) {
      setToast(`Unlock ${track.name} to adjust clip speed`);
      return;
    }
    const playbackRate = getClipPlaybackRate(clip);
    setSpeedDialog({
      clipId: clip.id,
      sourceSpan: getClipSourceSpan(clip),
      speedPercent: playbackRate * 100,
      durationFrames: clip.duration,
      ripple: true,
      preservePitch: clip.preservePitch ?? true,
    });
    setContextMenu(null);
  }, [project.clips, project.tracks, selectedClipId]);

  const updateSpeedPercent = (value: number) => setSpeedDialog((current) => {
    if (!current) return current;
    const playbackRate = clamp(value / 100, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
    return {...current, speedPercent: playbackRate * 100, durationFrames: Math.max(2, Math.round(current.sourceSpan / playbackRate))};
  });

  const updateSpeedDuration = (durationFrames: number) => setSpeedDialog((current) => {
    if (!current) return current;
    const clip = project.clips.find((candidate) => candidate.id === current.clipId);
    if (!clip) return current;
    const safeDuration = Math.max(2, Math.round(durationFrames));
    const playbackRate = playbackRateForDuration(clip, safeDuration);
    return {...current, speedPercent: playbackRate * 100, durationFrames: Math.max(2, Math.round(current.sourceSpan / playbackRate))};
  });

  const applySpeedDialog = () => {
    if (!speedDialog) return;
    const playbackRate = clamp(speedDialog.speedPercent / 100, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
    const result = retimeClip(project, {
      clipId: speedDialog.clipId,
      playbackRate,
      ripple: speedDialog.ripple,
      preservePitch: speedDialog.preservePitch,
      includeLinked: linkedSelection,
    });
    if (!result.ok) {
      setToast(result.error.message);
      return;
    }
    if (!result.changed) {
      setSpeedDialog(null);
      setToast("Clip speed is already set to that value");
      return;
    }
    commit((draft) => Object.assign(draft, result.project), `Changed clip speed to ${Math.round(playbackRate * 1000) / 10}%`);
    setSpeedDialog(null);
  };

  const requestFrameRateChoice = useCallback((mismatch: FrameRateMismatch) => new Promise<FrameRateChoice>((resolve) => {
    frameRateChoiceResolverRef.current = resolve;
    setFrameRateMismatch(mismatch);
  }), []);

  const resolveFrameRateChoice = useCallback((choice: FrameRateChoice) => {
    const resolve = frameRateChoiceResolverRef.current;
    frameRateChoiceResolverRef.current = null;
    setFrameRateMismatch(null);
    resolve?.(choice);
  }, []);

  useEffect(() => () => {
    frameRateChoiceResolverRef.current?.("keep");
    frameRateChoiceResolverRef.current = null;
  }, []);

  const undo = useCallback(() => {
    setPast((items) => {
      const previous = items[items.length - 1];
      if (!previous) return items;
      setProject((current) => {
        setFuture((nextItems) => [cloneProject(current), ...nextItems].slice(0, 50));
        setSelectedClipIds((selected) => selected.filter((id) => previous.clips.some((clip) => clip.id === id)));
        return cloneProject(previous);
      });
      setToast("Undo");
      return items.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((items) => {
      const next = items[0];
      if (!next) return items;
      setProject((current) => {
        setPast((previousItems) => [...previousItems.slice(-49), cloneProject(current)]);
        setSelectedClipIds((selected) => selected.filter((id) => next.clips.some((clip) => clip.id === id)));
        return cloneProject(next);
      });
      setToast("Redo");
      return items.slice(1);
    });
  }, []);

  const seek = useCallback((nextFrame: number) => {
    const bounded = clamp(Math.round(nextFrame), 0, project.durationInFrames - 1);
    playerRef.current?.seekTo(bounded);
    setFrame(bounded);
  }, [project.durationInFrames]);

  const togglePlayback = useCallback(() => {
    if (shuttleRate !== 0) {
      setShuttleRate(0);
      return;
    }
    playerRef.current?.toggle();
  }, [shuttleRate]);

  const changeShuttleRate = useCallback((direction: -1 | 0 | 1) => {
    setShuttleRate((current) => {
      if (direction === 0) return 0;
      if (Math.sign(current) !== direction) return direction;
      return direction * Math.min(4, Math.max(1, Math.abs(current) * 2));
    });
  }, []);

  const scrubToClientX = useCallback((clientX: number) => {
    const canvas = timelineScrollerRef.current?.querySelector<HTMLElement>(".timeline-canvas");
    const scroller = timelineScrollerRef.current;
    if (!canvas || !scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();
    if (clientX < scrollerRect.left + 24) scroller.scrollLeft = Math.max(0, scroller.scrollLeft - 18);
    if (clientX > scrollerRect.right - 24) scroller.scrollLeft += 18;
    const canvasRect = canvas.getBoundingClientRect();
    seek((clientX - canvasRect.left) / pixelsPerFrame);
  }, [pixelsPerFrame, seek]);

  const beginPlayheadScrub = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    playerRef.current?.pause();
    setScrubbing(true);
    scrubToClientX(event.clientX);
  }, [scrubToClientX]);

  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (event: PointerEvent) => {
      event.preventDefault();
      scrubToClientX(event.clientX);
    };
    const onUp = (event: PointerEvent) => {
      scrubToClientX(event.clientX);
      setScrubbing(false);
    };
    window.addEventListener("pointermove", onMove, {passive: false});
    window.addEventListener("pointerup", onUp, {once: true});
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubToClientX, scrubbing]);

  const expandLinkedIds = useCallback((ids: string[]) => {
    if (!linkedSelection) return Array.from(new Set(ids));
    const groups = new Set(project.clips.filter((clip) => ids.includes(clip.id) && clip.linkedGroupId).map((clip) => clip.linkedGroupId));
    return Array.from(new Set([...ids, ...project.clips.filter((clip) => clip.linkedGroupId && groups.has(clip.linkedGroupId)).map((clip) => clip.id)]));
  }, [linkedSelection, project.clips]);

  const selectClip = useCallback((clipId: string, additive = false) => {
    setSelectedTransitionId(null);
    setSelectedClipIds((current) => {
      if (additive) {
        const linkedIds = expandLinkedIds([clipId]);
        if (current.includes(clipId)) return current.filter((id) => !linkedIds.includes(id));
        return Array.from(new Set([...current, ...linkedIds]));
      }
      return expandLinkedIds([clipId]);
    });
  }, [expandLinkedIds]);

  const deleteSelected = useCallback(() => {
    const ids = expandLinkedIds(selectedClipIds).filter((id) => {
      const clip = project.clips.find((candidate) => candidate.id === id);
      return clip && !project.tracks.find((track) => track.id === clip.trackId)?.locked;
    });
    if (!ids.length) return;
    commit((draft) => {
      draft.clips = draft.clips.filter((candidate) => !ids.includes(candidate.id));
      draft.transitions = draft.transitions.filter((transition) => !ids.includes(transition.fromClipId) && !ids.includes(transition.toClipId));
    }, `Deleted ${ids.length} ${ids.length === 1 ? "clip" : "clips"}`);
    setSelectedClipIds([]);
  }, [commit, expandLinkedIds, project.clips, project.tracks, selectedClipIds]);

  const rippleDeleteSelected = useCallback(() => {
    if (!selectedClipIds.length) return;
    const result = rippleDelete(project, selectedClipIds, linkedSelection);
    if (!result.ok) {
      setToast(result.error.message);
      return;
    }
    const removedCount = result.removedClipIds.length;
    commit((draft) => Object.assign(draft, result.project), `Ripple deleted ${removedCount} ${removedCount === 1 ? "clip" : "clips"}`);
    setSelectedClipIds([]);
  }, [commit, linkedSelection, project, selectedClipIds]);

  const splitClipAt = useCallback((clipId: string, splitFrame: number) => {
    const clip = project.clips.find((candidate) => candidate.id === clipId);
    if (!clip) return null;
    const result = splitClip(project, clipId, splitFrame, linkedSelection);
    if (!result.ok) return null;
    commit((draft) => Object.assign(draft, result.project), `Split ${clip.name} at ${formatTimecode(splitFrame, project.fps)}`);
    setSelectedClipIds(result.createdClipIds);
    return result.project.clips.find((candidate) => result.createdClipIds.includes(candidate.id) && candidate.trackId === clip.trackId)?.id ?? result.createdClipIds[0] ?? null;
  }, [commit, linkedSelection, project]);

  const splitSelected = useCallback(() => {
    if (!selectedClipId || !splitClipAt(selectedClipId, frame)) {
      setToast("Move the playhead inside the selected clip to split");
    }
  }, [frame, selectedClipId, splitClipAt]);

  const duplicateSelected = useCallback(() => {
    const selected = project.clips.filter((clip) => selectedClipIds.includes(clip.id));
    if (!selected.length) return;
    const maxEnd = Math.max(...selected.map((clip) => clip.start + clip.duration));
    const transitions = project.transitions.filter((transition) => selectedClipIds.includes(transition.fromClipId) && selectedClipIds.includes(transition.toClipId));
    const result = cloneClips(project, {clips: selected, transitions, atFrame: maxEnd, idBase: "duplicate"});
    if (applyKernelResult(result, `Duplicated ${selected.length} ${selected.length === 1 ? "clip" : "clips"}`) && result.ok) setSelectedClipIds(result.createdClipIds);
  }, [applyKernelResult, project, selectedClipIds]);

  const copySelected = useCallback(() => {
    const clips = project.clips.filter((clip) => selectedClipIds.includes(clip.id)).map(cloneClip);
    clipboardRef.current = {
      clips,
      transitions: project.transitions.filter((transition) => selectedClipIds.includes(transition.fromClipId) && selectedClipIds.includes(transition.toClipId)).map((transition) => ({...transition})),
    };
    if (clips.length) setToast(`Copied ${clips.length} ${clips.length === 1 ? "clip" : "clips"}`);
  }, [project.clips, project.transitions, selectedClipIds]);

  const pasteClips = useCallback(() => {
    const {clips, transitions} = clipboardRef.current;
    if (!clips.length) return;
    const trackMap: Record<string, string> = {};
    for (const kind of ["video", "audio", "caption"] as const) {
      const kindTracks = project.tracks.filter((track) => track.kind === kind);
      const sourceTrackIds = Array.from(new Set(clips.map((clip) => clip.trackId).filter((trackId) => kindTracks.some((track) => track.id === trackId))));
      if (!sourceTrackIds.length) continue;
      const targetIndex = kindTracks.findIndex((track) => track.id === destinationRoutes[kind]);
      const anchorIndex = Math.min(...sourceTrackIds.map((trackId) => kindTracks.findIndex((track) => track.id === trackId)));
      for (const sourceTrackId of sourceTrackIds) {
        const relativeIndex = kindTracks.findIndex((track) => track.id === sourceTrackId) - anchorIndex;
        trackMap[sourceTrackId] = kindTracks[targetIndex + relativeIndex]?.id ?? "__invalid-track-target__";
      }
    }
    const result = cloneClips(project, {clips, transitions, atFrame: frame, trackMap, idBase: "paste"});
    if (applyKernelResult(result, `Pasted ${clips.length} ${clips.length === 1 ? "clip" : "clips"}`) && result.ok) setSelectedClipIds(result.createdClipIds);
  }, [applyKernelResult, destinationRoutes, frame, project]);

  const linkSelectedClips = useCallback(() => {
    if (selectedClipIds.length < 2) {
      setToast("Select at least two clips to link");
      return;
    }
    const groupId = `link-${Date.now()}`;
    commit((draft) => {
      for (const clip of draft.clips) if (selectedClipIds.includes(clip.id)) clip.linkedGroupId = groupId;
    }, `Linked ${selectedClipIds.length} clips`);
  }, [commit, selectedClipIds]);

  const unlinkSelectedClips = useCallback(() => {
    commit((draft) => {
      for (const clip of draft.clips) if (selectedClipIds.includes(clip.id)) clip.linkedGroupId = undefined;
    }, "Unlinked selected clips");
  }, [commit, selectedClipIds]);

  const addMarker = useCallback(() => {
    const id = `marker-${Date.now()}-${clipIdCounterRef.current++}`;
    commit((draft) => draft.markers.push({id, frame, label: `Marker ${draft.markers.length + 1}`, color: "#f6c85f"}), `Added marker at ${formatTimecode(frame, project.fps)}`);
  }, [commit, frame, project.fps]);

  const addTransition = useCallback((type: TransitionType, anchorClipId?: string) => {
    const anchor = anchorClipId ? project.clips.find((clip) => clip.id === anchorClipId) : selectedClip;
    if (!isTransitionClip(anchor)) {
      setToast("Select a video, image, or title clip beside another clip");
      return;
    }
    const next = project.clips.find((clip) => clip.trackId === anchor.trackId && isTransitionClip(clip) && clip.start === anchor.start + anchor.duration);
    const previous = project.clips.find((clip) => clip.trackId === anchor.trackId && isTransitionClip(clip) && clip.start + clip.duration === anchor.start);
    const from = next ? anchor : previous;
    const to = next ?? anchor;
    if (!from || !to || from.id === to.id) {
      setToast("This clip needs an adjacent clip on the same video track");
      return;
    }
    const existing = project.transitions.find((transition) => transition.fromClipId === from.id && transition.toClipId === to.id);
    const transitionId = existing?.id ?? `transition-${Date.now()}-${clipIdCounterRef.current++}`;
    const duration = Math.max(2, Math.min(existing?.duration ?? Math.round(project.fps), from.duration, to.duration));
    commit((draft) => {
      const transition = draft.transitions.find((item) => item.id === transitionId);
      if (transition) {
        transition.type = type;
        transition.duration = duration;
      } else {
        draft.transitions.push({id: transitionId, fromClipId: from.id, toClipId: to.id, type, duration});
      }
    }, `${existing ? "Changed transition to" : "Added"} ${TRANSITION_NAMES[type]}`);
    setSelectedClipIds([]);
    setSelectedTransitionId(transitionId);
    seek(to.start);
  }, [commit, project.clips, project.fps, project.transitions, seek, selectedClip]);

  const deleteSelectedTransition = useCallback(() => {
    if (!selectedTransitionId) return;
    const transition = project.transitions.find((item) => item.id === selectedTransitionId);
    commit((draft) => {
      draft.transitions = draft.transitions.filter((item) => item.id !== selectedTransitionId);
    }, `Deleted ${transition ? TRANSITION_NAMES[transition.type] : "transition"}`);
    setSelectedTransitionId(null);
  }, [commit, project.transitions, selectedTransitionId]);

  const addMediaAt = useCallback((item: MediaItem, targetTrack: string, start: number, message = true) => {
    const track = project.tracks.find((candidate) => candidate.id === targetTrack);
    const compatible = track && clipTrackKind(item.kind) === track.kind;
    if (!compatible || track.locked) {
      setToast(track?.locked ? `${track.name} is locked` : `${item.name} is not compatible with ${track?.name ?? "that track"}`);
      return null;
    }
    const safeStart = Math.max(0, Math.round(start));
    const result = placeMedia(project, {mode: editMode, atFrame: safeStart, items: [{mediaId: item.id, trackId: targetTrack}], rippleTrackIds: editMode === "insert" ? targetedTrackIds : undefined, idBase: "media"});
    if (!applyKernelResult(result, message ? `${editMode === "insert" ? "Inserted" : "Overwrote with"} ${item.name} on ${track.name}` : "Media placement applied")) return null;
    if (!result.ok) return null;
    const id = result.createdClipIds.find((clipId) => result.project.clips.some((clip) => clip.id === clipId && clip.sourceMediaId === item.id)) ?? result.createdClipIds[0];
    if (id) setSelectedClipIds([id]);
    return id ?? null;
  }, [applyKernelResult, editMode, project, targetedTrackIds]);

  const addMediaToTimeline = useCallback((item: MediaItem) => {
    const kind = clipTrackKind(item.kind);
    const targetTrack = destinationRoutes[kind] || project.tracks.find((track) => track.kind === kind && !track.locked)?.id || "";
    addMediaAt(item, targetTrack, frame);
  }, [addMediaAt, destinationRoutes, frame, project.tracks]);

  const addTextClip = useCallback((kind: "title" | "caption") => {
    const targetTrack = kind === "caption" ? project.tracks.find((track) => track.kind === "caption") : project.tracks.find((track) => track.id === "v3") ?? project.tracks.find((track) => track.kind === "video");
    if (!targetTrack || targetTrack.locked) {
      setToast(targetTrack?.locked ? `${targetTrack.name} is locked` : `No ${kind === "caption" ? "caption" : "video"} track is available`);
      return;
    }
    const id = `${kind}-${Date.now()}-${clipIdCounterRef.current++}`;
    const duration = kind === "caption" ? Math.max(60, Math.round(project.fps * 3)) : Math.max(75, Math.round(project.fps * 3));
    const clip: EditorClip = {
      id,
      name: kind === "caption" ? "New caption" : "New title",
      kind,
      trackId: targetTrack.id,
      start: frame,
      duration,
      sourceStart: 0,
      color: kind === "caption" ? "#32b8c6" : "#9b7cff",
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      audioMuted: false,
      transform: {...DEFAULT_TRANSFORM},
      effects: {...DEFAULT_EFFECTS},
      keyframes: [],
      text: kind === "caption" ? "Add caption text" : "Your title",
      textStyle: {...(kind === "caption" ? DEFAULT_CAPTION_STYLE : DEFAULT_TITLE_STYLE)},
    };
    commit((draft) => {
      draft.clips.push(clip);
      draft.durationInFrames = Math.max(draft.durationInFrames, clip.start + clip.duration);
    }, `Added ${kind} at ${formatTimecode(frame, project.fps)}`);
    setSelectedTransitionId(null);
    setSelectedClipIds([id]);
  }, [commit, frame, project.fps, project.tracks]);

  const updateSelectedText = useCallback((updates: {text?: string; textStyle?: Partial<TextStyle>}) => {
    if (!selectedClipId || !selectedClip || (selectedClip.kind !== "title" && selectedClip.kind !== "caption")) return;
    commit((draft) => {
      const clip = draft.clips.find((candidate) => candidate.id === selectedClipId);
      if (!clip || (clip.kind !== "title" && clip.kind !== "caption")) return;
      if (updates.text !== undefined) {
        clip.text = updates.text;
        clip.name = updates.text.trim().split(/\s+/).slice(0, 5).join(" ") || (clip.kind === "caption" ? "Untitled caption" : "Untitled title");
      }
      if (updates.textStyle) {
        const defaults = clip.kind === "caption" ? DEFAULT_CAPTION_STYLE : DEFAULT_TITLE_STYLE;
        clip.textStyle = {...defaults, ...(clip.textStyle ?? {}), ...updates.textStyle};
      }
    });
  }, [commit, selectedClip, selectedClipId]);

  const importSubtitles = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const entries = parseSubtitleFile(await file.text(), project.fps);
    if (!entries.length) {
      setToast("No valid SRT or VTT captions were found");
      return;
    }
    const ids: string[] = [];
    commit((draft) => {
      if (!draft.tracks.some((track) => track.kind === "caption")) draft.tracks.unshift({...C1_TRACK});
      const captionTrackId = draft.tracks.find((track) => track.kind === "caption")?.id ?? C1_TRACK.id;
      for (const [index, entry] of entries.entries()) {
        const id = `caption-import-${Date.now()}-${index}-${clipIdCounterRef.current++}`;
        ids.push(id);
        draft.clips.push({
          id,
          name: entry.text.split(/\s+/).slice(0, 5).join(" "),
          kind: "caption",
          trackId: captionTrackId,
          start: entry.start,
          duration: entry.duration,
          sourceStart: 0,
          color: "#32b8c6",
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          audioMuted: false,
          transform: {...DEFAULT_TRANSFORM},
          effects: {...DEFAULT_EFFECTS},
          keyframes: [],
          text: entry.text,
          textStyle: {...DEFAULT_CAPTION_STYLE},
        });
      }
      draft.durationInFrames = Math.max(draft.durationInFrames, ...entries.map((entry) => entry.start + entry.duration));
    }, `Imported ${entries.length} ${entries.length === 1 ? "caption" : "captions"} from ${file.name}`);
    setSelectedTransitionId(null);
    setSelectedClipIds(ids.slice(-1));
  }, [commit, project.fps]);

  const exportSubtitles = useCallback(() => {
    const captions = project.clips.filter((clip) => clip.kind === "caption").sort((a, b) => a.start - b.start);
    if (!captions.length) {
      setToast("Add or import captions before exporting SRT");
      return;
    }
    const source = captions.map((clip, index) => `${index + 1}\n${formatSrtTime(clip.start, project.fps)} --> ${formatSrtTime(clip.start + clip.duration, project.fps)}\n${clip.text ?? ""}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([source], {type: "application/x-subrip;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name.toLowerCase().replace(/\s+/g, "-")}-captions.srt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast(`Exported ${captions.length} ${captions.length === 1 ? "caption" : "captions"} as SRT`);
  }, [project.clips, project.fps, project.name]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (event: {detail: {frame: number}}) => setFrame(event.detail.frame);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const root = document.querySelector<HTMLElement>(".program-panel");
    if (!root) return;
    return observeLiveAudioPreview(root, project, () => setToast("Some live audio processors could not connect; final export settings are preserved"));
  }, [isPlaying, project]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (command && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelected();
      } else if (command && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteClips();
      } else if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (command && event.key.toLowerCase() === "r") {
        event.preventDefault();
        openSpeedDialog();
      } else if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (monitorMode === "source" && sourceMediaRef.current) {
          setShuttleRate(0);
          if (sourceMediaRef.current.paused) void sourceMediaRef.current.play(); else sourceMediaRef.current.pause();
        } else togglePlayback();
      } else if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        changeShuttleRate(-1);
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        changeShuttleRate(0);
      } else if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        changeShuttleRate(1);
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        splitSelected();
      } else if ((event.key === "Backspace" || event.key === "Delete") && event.shiftKey) {
        event.preventDefault();
        if (selectedTransitionId) deleteSelectedTransition(); else rippleDeleteSelected();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        if (selectedTransitionId) deleteSelectedTransition(); else deleteSelected();
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        addMarker();
      } else if (event.key.toLowerCase() === "v") {
        setActiveTool("select");
      } else if (event.key.toLowerCase() === "c") {
        setActiveTool("razor");
      } else if (event.key.toLowerCase() === "b") {
        setActiveTool("ripple");
      } else if (event.key.toLowerCase() === "n") {
        setActiveTool("roll");
      } else if (event.key.toLowerCase() === "y") {
        setActiveTool("slip");
      } else if (event.key.toLowerCase() === "u") {
        setActiveTool("slide");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seek(frame - (event.shiftKey ? project.fps : 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seek(frame + (event.shiftKey ? project.fps : 1));
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [addMarker, changeShuttleRate, copySelected, deleteSelected, deleteSelectedTransition, duplicateSelected, frame, monitorMode, openSpeedDialog, pasteClips, project.fps, redo, rippleDeleteSelected, seek, selectedTransitionId, splitSelected, togglePlayback, undo]);

  useEffect(() => {
    const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const preventBrowserFileDrop = (event: DragEvent) => {
      if (isFileDrag(event)) event.preventDefault();
    };
    const handleMissedFileDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      setDropTarget(null);
      setToast("Drop video on V1, V2, or V3; audio on A1 or A2. Add captions from the Text panel.");
    };
    window.addEventListener("dragover", preventBrowserFileDrop);
    window.addEventListener("drop", handleMissedFileDrop);
    return () => {
      window.removeEventListener("dragover", preventBrowserFileDrop);
      window.removeEventListener("drop", handleMissedFileDrop);
    };
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const rawDelta = Math.round((event.clientX - drag.originX) / pixelsPerFrame);
      const originProject = dragOriginProjectRef.current;
      if (!originProject) return;
      const movingIds = new Set(drag.selected.map((item) => item.id));
      const snapCandidates = [0, frame, ...originProject.markers.map((marker) => marker.frame), ...originProject.clips.filter((clip) => !movingIds.has(clip.id)).flatMap((clip) => [clip.start, clip.start + clip.duration])];
      const snapValue = (value: number) => {
        if (!snap) return value;
        const threshold = Math.max(2, Math.round(8 / pixelsPerFrame));
        const closest = snapCandidates.reduce<{value: number; distance: number} | null>((best, candidate) => {
          const distance = Math.abs(candidate - value);
          return distance <= threshold && (!best || distance < best.distance) ? {value: candidate, distance} : best;
        }, null);
        return closest?.value ?? value;
      };
      let deltaFrames = rawDelta;
      if (drag.mode === "move" || drag.mode === "slide") {
        const snappedStart = snapValue(drag.initialStart + rawDelta);
        const snappedEnd = snapValue(drag.initialStart + drag.initialDuration + rawDelta);
        deltaFrames = Math.abs(snappedStart - (drag.initialStart + rawDelta)) <= Math.abs(snappedEnd - (drag.initialStart + drag.initialDuration + rawDelta)) ? snappedStart - drag.initialStart : snappedEnd - drag.initialStart - drag.initialDuration;
      }

      const hoveredLane = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>(".track-lane");
      setDragTrackTarget(hoveredLane?.dataset.trackId ?? null);
      setProject((current) => {
        const next = cloneProject(originProject);
        const clip = next.clips.find((candidate) => candidate.id === drag.clipId);
        if (!clip) return current;
        if (drag.mode === "move") {
          const minStart = Math.min(...drag.selected.map((item) => item.start));
          const applied = Math.max(deltaFrames, -minStart);
          for (const initial of drag.selected) {
            const candidate = next.clips.find((item) => item.id === initial.id);
            if (candidate) candidate.start = initial.start + applied;
          }
        } else if (drag.mode === "trim-start" || drag.mode === "ripple-start") {
          const playbackRate = getClipPlaybackRate(clip);
          const maxDelta = drag.initialDuration - 2;
          const desiredStart = snapValue(drag.initialStart + rawDelta);
          const applied = clamp(desiredStart - drag.initialStart, Math.ceil(-drag.initialSourceStart / playbackRate), maxDelta);
          clip.start = drag.mode === "trim-start" ? drag.initialStart + applied : drag.initialStart;
          clip.duration = drag.initialDuration - applied;
          clip.sourceStart = drag.initialSourceStart + applied * playbackRate;
          clip.fadeIn = Math.min(clip.fadeIn, clip.duration);
          clip.fadeOut = Math.min(clip.fadeOut, Math.max(0, clip.duration - clip.fadeIn));
          clip.keyframes = (clip.keyframes ?? [])
            .map((keyframe) => ({...keyframe, frame: keyframe.frame - applied}))
            .filter((keyframe) => keyframe.frame >= 0 && keyframe.frame < clip.duration);
          if (drag.mode === "ripple-start") {
            const originalEnd = drag.initialStart + drag.initialDuration;
            for (const other of next.clips) if (other.trackId === clip.trackId && other.id !== clip.id && other.start >= originalEnd) other.start -= applied;
          }
        } else if (drag.mode === "trim-end" || drag.mode === "ripple-end") {
          const desiredEnd = snapValue(drag.initialStart + drag.initialDuration + rawDelta);
          const applied = Math.max(2 - drag.initialDuration, desiredEnd - drag.initialStart - drag.initialDuration);
          clip.duration = drag.initialDuration + applied;
          clip.fadeIn = Math.min(clip.fadeIn, clip.duration);
          clip.fadeOut = Math.min(clip.fadeOut, Math.max(0, clip.duration - clip.fadeIn));
          clip.keyframes = (clip.keyframes ?? []).filter((keyframe) => keyframe.frame < clip.duration);
          if (drag.mode === "ripple-end") {
            const originalEnd = drag.initialStart + drag.initialDuration;
            for (const other of next.clips) if (other.trackId === clip.trackId && other.id !== clip.id && other.start >= originalEnd) other.start += applied;
          }
        } else if (drag.mode === "roll-end") {
          const neighbor = next.clips.find((item) => item.trackId === clip.trackId && item.start === drag.initialStart + drag.initialDuration && item.id !== clip.id);
          if (neighbor) {
            const applied = clamp(rawDelta, 2 - drag.initialDuration, neighbor.duration - 2);
            clip.duration = drag.initialDuration + applied;
            neighbor.start += applied;
            neighbor.duration -= applied;
            neighbor.sourceStart += applied * getClipPlaybackRate(neighbor);
          }
        } else if (drag.mode === "slip") {
          clip.sourceStart = Math.max(0, drag.initialSourceStart + rawDelta * getClipPlaybackRate(clip));
        } else if (drag.mode === "slide") {
          const applied = Math.max(rawDelta, -drag.initialStart);
          const originalEnd = drag.initialStart + drag.initialDuration;
          const previous = next.clips.find((item) => item.trackId === clip.trackId && item.start + item.duration === drag.initialStart && item.id !== clip.id);
          const following = next.clips.find((item) => item.trackId === clip.trackId && item.start === originalEnd && item.id !== clip.id);
          const minimum = previous ? 2 - previous.duration : -drag.initialStart;
          const maximum = following ? following.duration - 2 : Math.max(applied, next.durationInFrames - originalEnd);
          const bounded = clamp(applied, minimum, maximum);
          clip.start = drag.initialStart + bounded;
          if (previous) previous.duration += bounded;
          if (following) {
            following.start += bounded;
            following.duration -= bounded;
            following.sourceStart += bounded * getClipPlaybackRate(following);
          }
        } else if (drag.mode === "fade-in") {
          clip.fadeIn = clamp(drag.initialFadeIn + rawDelta, 0, Math.max(0, clip.duration - drag.initialFadeOut));
        } else if (drag.mode === "fade-out") {
          clip.fadeOut = clamp(drag.initialFadeOut - rawDelta, 0, Math.max(0, clip.duration - drag.initialFadeIn));
        }
        next.durationInFrames = Math.max(next.durationInFrames, ...next.clips.map((item) => item.start + item.duration));
        dragPreviewProjectRef.current = next;
        return next;
      });
    };
    const onUp = (event: PointerEvent) => {
      const origin = dragOriginProjectRef.current;
      const preview = dragPreviewProjectRef.current;
      const hoveredLane = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>(".track-lane");
      const targetTrackId = hoveredLane?.dataset.trackId;
      if (origin && preview && drag.mode === "move") {
        const originClip = origin.clips.find((clip) => clip.id === drag.clipId);
        const previewClip = preview.clips.find((clip) => clip.id === drag.clipId);
        const trackAssignments: Record<string, string> = {};
        if (originClip && targetTrackId) {
          const originTrack = origin.tracks.find((track) => track.id === originClip.trackId);
          const targetTrack = origin.tracks.find((track) => track.id === targetTrackId);
          if (originTrack && targetTrack && originTrack.kind === targetTrack.kind) {
            const sameKindTracks = origin.tracks.filter((track) => track.kind === originTrack.kind);
            const trackDelta = sameKindTracks.findIndex((track) => track.id === targetTrack.id) - sameKindTracks.findIndex((track) => track.id === originTrack.id);
            for (const selected of drag.selected) {
              const selectedClip = origin.clips.find((clip) => clip.id === selected.id);
              const selectedTrack = origin.tracks.find((track) => track.id === selectedClip?.trackId);
              if (!selectedClip || selectedTrack?.kind !== originTrack.kind) continue;
              const sourceIndex = sameKindTracks.findIndex((track) => track.id === selectedTrack.id);
              trackAssignments[selected.id] = sameKindTracks[sourceIndex + trackDelta]?.id ?? "__invalid-track-target__";
            }
          } else if (targetTrackId !== originClip.trackId) {
            trackAssignments[originClip.id] = targetTrackId;
          }
        }
        const result = moveClips(origin, {
          clipIds: drag.selected.map((item) => item.id),
          deltaFrames: (previewClip?.start ?? originClip?.start ?? 0) - (originClip?.start ?? 0),
          trackAssignments,
          includeLinked: linkedSelection,
        });
        applyKernelResult(result, "Move edit applied", origin);
      } else if (origin && preview && ["trim-start", "trim-end", "ripple-start", "ripple-end"].includes(drag.mode)) {
        const previewClip = preview.clips.find((clip) => clip.id === drag.clipId);
        const deltaFrames = drag.mode.endsWith("start")
          ? drag.initialDuration - (previewClip?.duration ?? drag.initialDuration)
          : (previewClip?.duration ?? drag.initialDuration) - drag.initialDuration;
        const result = trimClip(origin, {
          clipId: drag.clipId,
          edge: drag.mode.endsWith("start") ? "start" : "end",
          deltaFrames,
          ripple: drag.mode.startsWith("ripple"),
          includeLinked: linkedSelection,
        });
        applyKernelResult(result, `${drag.mode.replace(/-/g, " ")} edit applied`, origin);
      } else if (origin && preview) {
        const next = cloneProject(preview);
        pruneTransitions(next);
        if (JSON.stringify(next) === JSON.stringify(origin)) setProject(origin);
        else {
          setProject(next);
          setPast((items) => [...items.slice(-49), cloneProject(origin)]);
          setFuture([]);
          setToast(`${drag.mode.replace(/-/g, " ")} edit applied`);
        }
      }
      dragOriginProjectRef.current = null;
      dragPreviewProjectRef.current = null;
      setDragTrackTarget(null);
      setDrag(null);
    };
    const cancelDrag = () => {
      const origin = dragOriginProjectRef.current;
      if (origin) setProject(cloneProject(origin));
      dragOriginProjectRef.current = null;
      dragPreviewProjectRef.current = null;
      setDragTrackTarget(null);
      setDrag(null);
      setToast("Edit cancelled");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, {once: true});
    window.addEventListener("pointercancel", cancelDrag, {once: true});
    window.addEventListener("lostpointercapture", cancelDrag, {once: true});
    window.addEventListener("blur", cancelDrag, {once: true});
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancelDrag);
      window.removeEventListener("lostpointercapture", cancelDrag);
      window.removeEventListener("blur", cancelDrag);
    };
  }, [applyKernelResult, drag, frame, linkedSelection, pixelsPerFrame, snap]);

  useEffect(() => {
    if (!marqueeActive) return;
    const onMove = (event: PointerEvent) => {
      const current = marqueeRef.current;
      const canvas = timelineScrollerRef.current?.querySelector<HTMLElement>(".timeline-canvas");
      if (!current || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const next = {...current, x: event.clientX - rect.left, y: event.clientY - rect.top};
      marqueeRef.current = next;
      setMarquee(next);
    };
    const onUp = () => {
      const current = marqueeRef.current;
      const canvas = timelineScrollerRef.current?.querySelector<HTMLElement>(".timeline-canvas");
      if (current && canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        const selectionRect = {
          left: canvasRect.left + Math.min(current.startX, current.x),
          right: canvasRect.left + Math.max(current.startX, current.x),
          top: canvasRect.top + Math.min(current.startY, current.y),
          bottom: canvasRect.top + Math.max(current.startY, current.y),
        };
        const ids = Array.from(canvas.querySelectorAll<HTMLElement>(".timeline-clip[data-clip-id]")).filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.right >= selectionRect.left && rect.left <= selectionRect.right && rect.bottom >= selectionRect.top && rect.top <= selectionRect.bottom;
        }).map((element) => element.dataset.clipId).filter((id): id is string => Boolean(id));
        setSelectedClipIds((existing) => current.additive ? Array.from(new Set([...existing, ...ids])) : ids);
      }
      marqueeRef.current = null;
      setMarquee(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, {once: true});
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [marqueeActive]);

  useEffect(() => {
    if (!binPointerDragId) return;

    const getPointerDrop = (x: number, y: number, item: MediaItem) => {
      const element = document.elementFromPoint(x, y) as HTMLElement | null;
      const lane = element?.closest<HTMLElement>(".track-lane");
      const trackId = lane?.dataset.trackId;
      const track = project.tracks.find((candidate) => candidate.id === trackId);
      if (!lane || !track) return null;
      const rect = lane.getBoundingClientRect();
      const rawFrame = (x - rect.left) / pixelsPerFrame;
      const dropFrame = Math.max(0, snap ? Math.round(rawFrame / 5) * 5 : Math.round(rawFrame));
      const compatible = clipTrackKind(item.kind) === track.kind;
      return {track, frame: dropFrame, allowed: compatible && !track.locked};
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = binPointerDragRef.current;
      if (!current) return;
      const distance = Math.hypot(event.clientX - current.originX, event.clientY - current.originY);
      const next = {...current, x: event.clientX, y: event.clientY, active: current.active || distance > 5};
      binPointerDragRef.current = next;
      setBinPointerDrag(next);
      if (!next.active) return;
      event.preventDefault();
      const target = getPointerDrop(event.clientX, event.clientY, current.item);
      setDropTarget(target ? {trackId: target.track.id, frame: target.frame, duration: current.item.duration, allowed: target.allowed} : null);
    };

    const onPointerUp = (event: PointerEvent) => {
      const current = binPointerDragRef.current;
      if (current?.active) {
        const target = getPointerDrop(event.clientX, event.clientY, current.item);
        if (target?.allowed) addMediaAt(current.item, target.track.id, target.frame);
        else if (target) setToast(target.track.locked ? `${target.track.name} is locked` : `${current.item.name} is not compatible with ${target.track.name}`);
      }
      binPointerDragRef.current = null;
      setBinPointerDrag(null);
      setDropTarget(null);
    };

    window.addEventListener("pointermove", onPointerMove, {passive: false});
    window.addEventListener("pointerup", onPointerUp, {once: true});
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [addMediaAt, binPointerDragId, pixelsPerFrame, project.tracks, snap]);

  const mediaUseCounts = useMemo(() => project.clips.reduce<Record<string, number>>((counts, clip) => {
    if (clip.sourceMediaId) counts[clip.sourceMediaId] = (counts[clip.sourceMediaId] ?? 0) + 1;
    return counts;
  }, {}), [project.clips]);
  const selectedMedia = project.media.find((item) => item.id === selectedMediaId) ?? null;
  const readyProxyCount = project.media.filter((item) => item.proxy?.status === "ready").length;
  const workingProxyCount = project.media.filter((item) => item.proxy?.status === "queued" || item.proxy?.status === "processing").length;
  const preparedMediaCount = project.media.filter((item) => item.analysis?.status === "ready").length;
  const preparingMediaCount = project.media.filter((item) => item.analysis?.status === "queued" || item.analysis?.status === "processing").length;
  const renderCacheUsable = usableRenderCache(project);
  const renderCacheWorking = project.renderCache?.status === "queued" || project.renderCache?.status === "rendering";
  const selectedMediaPreviewSrc = selectedMedia ? resolveMediaPreviewSource(selectedMedia, useProxies) : undefined;
  const activeSequence = project.sequences.find((sequence) => sequence.id === project.activeSequenceId);
  const sourceRange = useMemo(() => selectedMedia ? (sourceRanges[selectedMedia.id] ?? {inFrame: 0, outFrame: selectedMedia.duration}) : null, [selectedMedia, sourceRanges]);
  const openInSourceMonitor = useCallback((item: ProjectMedia) => {
    setSelectedMediaId(item.id);
    setSourceFrame(sourceRanges[item.id]?.inFrame ?? 0);
    setSourcePlaying(false);
    setMonitorMode("source");
  }, [sourceRanges]);
  const seekSource = useCallback((nextFrame: number) => {
    if (!selectedMedia) return;
    const bounded = clamp(Math.round(nextFrame), 0, Math.max(0, selectedMedia.duration - 1));
    setSourceFrame(bounded);
    if (sourceMediaRef.current) sourceMediaRef.current.currentTime = bounded / project.fps;
  }, [project.fps, selectedMedia]);
  useEffect(() => {
    const source = sourceMediaRef.current;
    if (shuttleRate === 0) {
      if (monitorMode === "source") source?.pause();
      else playerRef.current?.pause();
      return;
    }
    if (shuttleRate > 0) {
      if (monitorMode === "source") {
        if (!source || selectedMedia?.kind === "image") return;
        source.playbackRate = shuttleRate;
        void source.play().catch(() => setShuttleRate(0));
        return () => source.pause();
      }
      const player = playerRef.current;
      player?.play();
      return () => player?.pause();
    }
    if (monitorMode === "source") source?.pause(); else playerRef.current?.pause();
    let animationFrame = 0;
    let previousTime = performance.now();
    let accumulator = 0;
    const reverse = (time: number) => {
      accumulator += ((time - previousTime) / 1000) * project.fps * Math.abs(shuttleRate);
      previousTime = time;
      const wholeFrames = Math.floor(accumulator);
      if (wholeFrames > 0) {
        accumulator -= wholeFrames;
        if (monitorMode === "source") {
          const next = Math.max(sourceRange?.inFrame ?? 0, sourceFrameRef.current - wholeFrames);
          seekSource(next);
          if (next <= (sourceRange?.inFrame ?? 0)) {setShuttleRate(0); return;}
        } else {
          const next = Math.max(timelineRange?.inFrame ?? 0, frameRef.current - wholeFrames);
          seek(next);
          if (next <= (timelineRange?.inFrame ?? 0)) {setShuttleRate(0); return;}
        }
      }
      animationFrame = requestAnimationFrame(reverse);
    };
    animationFrame = requestAnimationFrame(reverse);
    return () => cancelAnimationFrame(animationFrame);
  }, [monitorMode, project.fps, seek, seekSource, selectedMedia?.kind, shuttleRate, sourceRange?.inFrame, timelineRange?.inFrame]);
  useEffect(() => {
    if (monitorMode === "program" && shuttleRate > 0 && timelineRange && frame >= timelineRange.outFrame) {
      setShuttleRate(0);
      seek(timelineRange.outFrame - 1);
    }
  }, [frame, monitorMode, seek, shuttleRate, timelineRange]);
  const setSourcePoint = useCallback((edge: "inFrame" | "outFrame") => {
    if (!selectedMedia) return;
    setSourceRanges((current) => {
      const range = current[selectedMedia.id] ?? {inFrame: 0, outFrame: selectedMedia.duration};
      const next = edge === "inFrame"
        ? {...range, inFrame: Math.min(sourceFrame, range.outFrame - 2)}
        : {...range, outFrame: Math.max(sourceFrame + 1, range.inFrame + 2)};
      return {...current, [selectedMedia.id]: next};
    });
    setToast(`Marked source ${edge === "inFrame" ? "In" : "Out"}`);
  }, [selectedMedia, sourceFrame]);
  const performThreePointEdit = useCallback((mode: EditMode) => {
    if (!selectedMedia || !sourceRange) {
      setToast("Open a clip in the Source Monitor first");
      return;
    }
    const kind = clipTrackKind(selectedMedia.kind);
    const trackId = destinationRoutes[kind];
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    if (!track || track.locked) {
      setToast(track?.locked ? `${track.name} is locked` : `Patch the source to a ${kind} track`);
      return;
    }
    const duration = sourceRange.outFrame - sourceRange.inFrame;
    const result = placeMedia(project, {
      mode,
      atFrame: frame,
      items: [{mediaId: selectedMedia.id, trackId, duration, sourceStart: sourceRange.inFrame}],
      rippleTrackIds: mode === "insert" ? targetedTrackIds : undefined,
      idBase: `three-point-${Date.now()}`,
    });
    if (applyKernelResult(result, `${mode === "insert" ? "Inserted" : "Overwrote with"} ${selectedMedia.name} · ${formatTimecode(duration, project.fps)}`) && result.ok) {
      setSelectedClipIds(result.createdClipIds.slice(0, 1));
      setMonitorMode("program");
    }
  }, [applyKernelResult, destinationRoutes, frame, project, selectedMedia, sourceRange, targetedTrackIds]);
  const setTimelinePoint = useCallback((edge: "inFrame" | "outFrame") => {
    setTimelineRange((current) => edge === "inFrame"
      ? {inFrame: Math.min(frame, (current?.outFrame ?? project.durationInFrames) - 1), outFrame: current?.outFrame ?? project.durationInFrames}
      : {inFrame: current?.inFrame ?? 0, outFrame: Math.max(frame + 1, (current?.inFrame ?? 0) + 1)});
    setToast(`Marked timeline ${edge === "inFrame" ? "In" : "Out"}`);
  }, [frame, project.durationInFrames]);
  const performRangeEdit = useCallback((mode: "lift" | "extract") => {
    if (!timelineRange) {
      setToast("Mark timeline In and Out before using Lift or Extract");
      return;
    }
    const result = editTimelineRange(project, {
      mode,
      inFrame: timelineRange.inFrame,
      outFrame: timelineRange.outFrame,
      trackIds: targetedTrackIds,
      includeLinked: linkedSelection,
      idBase: `${mode}-${Date.now()}`,
    });
    if (applyKernelResult(result, `${mode === "lift" ? "Lifted" : "Extracted"} ${formatTimecode(timelineRange.outFrame - timelineRange.inFrame, project.fps)} from targeted tracks`) && result.ok) {
      setSelectedClipIds([]);
      seek(timelineRange.inFrame);
      setTimelineRange(null);
    }
  }, [applyKernelResult, linkedSelection, project, seek, targetedTrackIds, timelineRange]);
  useEffect(() => {
    const onProgramRangeShortcut = (event: KeyboardEvent) => {
      if (monitorMode !== "program" || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) return;
      if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        setTimelinePoint("inFrame");
      } else if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        setTimelinePoint("outFrame");
      } else if (event.key === ";") {
        event.preventDefault();
        performRangeEdit("lift");
      } else if (event.key === "'") {
        event.preventDefault();
        performRangeEdit("extract");
      }
    };
    window.addEventListener("keydown", onProgramRangeShortcut);
    return () => window.removeEventListener("keydown", onProgramRangeShortcut);
  }, [monitorMode, performRangeEdit, setTimelinePoint]);
  const changeSequence = useCallback((sequenceId: string) => {
    try {
      const next = switchActiveSequence(project, sequenceId);
      setPast((items) => [...items.slice(-49), cloneProject(project)]);
      setFuture([]);
      setProject(next);
      setSelectedClipIds([]);
      setSelectedTransitionId(null);
      setFrame(0);
      setTimelineRange(null);
      setToast(`Opened ${next.sequences.find((sequence) => sequence.id === sequenceId)?.name ?? "sequence"}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Sequence could not be opened");
    }
  }, [project]);
  const addSequence = useCallback(() => {
    const nextSequence = createSequence(project);
    const withSequence = syncActiveSequence({...project, sequences: [...project.sequences, nextSequence]});
    setPast((items) => [...items.slice(-49), cloneProject(project)]);
    setFuture([]);
    setProject(switchActiveSequence(withSequence, nextSequence.id));
    setSelectedClipIds([]);
    setFrame(0);
    setTimelineRange(null);
    setToast(`Created ${nextSequence.name}`);
  }, [project]);
  const duplicateSequence = useCallback(() => {
    const synced = syncActiveSequence(project);
    const source = synced.sequences.find((sequence) => sequence.id === synced.activeSequenceId);
    if (!source) return;
    const duplicate = structuredClone(source);
    duplicate.id = `sequence-${Date.now()}-copy`;
    duplicate.name = `${source.name} Copy`;
    const next = switchActiveSequence({...synced, sequences: [...synced.sequences, duplicate]}, duplicate.id);
    setPast((items) => [...items.slice(-49), cloneProject(project)]);
    setFuture([]);
    setProject(next);
    setSelectedClipIds([]);
    setFrame(0);
    setTimelineRange(null);
    setToast(`Duplicated ${source.name}`);
  }, [project]);
  const nestSequence = useCallback((sequenceId: string) => {
    const source = syncActiveSequence(project).sequences.find((sequence) => sequence.id === sequenceId);
    const trackId = destinationRoutes.video;
    const track = project.tracks.find((candidate) => candidate.id === trackId && candidate.kind === "video");
    if (!source || !canNestSequence(project, sequenceId)) {
      setToast("That sequence would create a nesting loop");
      return;
    }
    if (!track || track.locked) {
      setToast(track?.locked ? `${track.name} is locked` : "Patch a video destination before nesting");
      return;
    }
    const duration = Math.min(source.durationInFrames, project.durationInFrames - frame);
    if (project.clips.some((clip) => clip.trackId === track.id && clip.start < frame + duration && clip.start + clip.duration > frame)) {
      setToast(`${track.name} has media in the nested sequence range`);
      return;
    }
    const id = `nested-${Date.now()}`;
    commit((draft) => draft.clips.push({
      id, name: source.name, kind: "sequence", nestedSequenceId: source.id, trackId: track.id, start: frame, duration,
      sourceStart: 0, color: "#7f68d9", volume: 1, fadeIn: 0, fadeOut: 0, audioMuted: false,
      transform: {...DEFAULT_TRANSFORM}, effects: {...DEFAULT_EFFECTS}, keyframes: [],
    }), `Nested ${source.name} on ${track.name}`);
    setSelectedClipIds([id]);
  }, [commit, destinationRoutes.video, frame, project]);
  useEffect(() => {
    const onSourceShortcut = (event: KeyboardEvent) => {
      if (monitorMode !== "source" || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) return;
      if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        setSourcePoint("inFrame");
      } else if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        setSourcePoint("outFrame");
      } else if (event.key === ",") {
        event.preventDefault();
        performThreePointEdit("insert");
      } else if (event.key === ".") {
        event.preventDefault();
        performThreePointEdit("overwrite");
      }
    };
    window.addEventListener("keydown", onSourceShortcut);
    return () => window.removeEventListener("keydown", onSourceShortcut);
  }, [monitorMode, performThreePointEdit, setSourcePoint]);
  const filteredMedia = useMemo(() => project.media
    .filter((item) => activeBinId === "all" || item.binId === activeBinId)
    .filter((item) => mediaKindFilter === "all" || item.kind === mediaKindFilter)
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (mediaSort === "duration") return b.duration - a.duration;
      if (mediaSort === "type") return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
      if (mediaSort === "date") return (b.importedAt ?? 0) - (a.importedAt ?? 0);
      return a.name.localeCompare(b.name);
    }), [activeBinId, mediaKindFilter, mediaSort, project.media, search]);

  const selectedLocalFrame = selectedClip ? clamp(frame - selectedClip.start, 0, selectedClip.duration - 1) : 0;
  const selectedTextStyle = selectedClip?.kind === "caption" ? {...DEFAULT_CAPTION_STYLE, ...(selectedClip.textStyle ?? {})} : {...DEFAULT_TITLE_STYLE, ...(selectedClip?.textStyle ?? {})};
  const selectedEffects = selectedClip ? {...DEFAULT_EFFECTS, ...selectedClip.effects} : DEFAULT_EFFECTS;
  const selectedColorGrade = selectedClip?.colorGrade ?? DEFAULT_COLOR_GRADE;
  const selectedProgramMask = selectedClip?.effectMasks?.find((mask) => mask.id === selectedMaskId) ?? selectedClip?.effectMasks?.find((mask) => mask.enabled) ?? null;
  const waveformPoints = scopeData.waveform.map((value, index) => `${(index / Math.max(1, scopeData.waveform.length - 1)) * 210},${96 - value * 86}`).join(" ");

  const propertyPath = (key: PropertyGroup, property: string) => `${key}.${property}` as KeyframeProperty;

  const propertyValue = (key: PropertyGroup, property: string) => {
    if (!selectedClip) return 0;
    return getAnimatedPropertyValue(selectedClip, propertyPath(key, property), selectedLocalFrame);
  };

  const updateSelected = (key: PropertyGroup, property: string, value: number) => {
    if (!selectedClipId) return;
    const path = propertyPath(key, property);
    commit((draft) => {
      const clip = draft.clips.find((candidate) => candidate.id === selectedClipId);
      if (!clip) return;
      clip.keyframes = clip.keyframes ?? [];
      if (key === "effects") clip.effects.look = "Custom";
      if (hasPropertyKeyframes(clip, path) && frame >= clip.start && frame < clip.start + clip.duration) {
        const localFrame = frame - clip.start;
        const existing = clip.keyframes.find((keyframe) => keyframe.property === path && keyframe.frame === localFrame);
        if (existing) existing.value = value;
        else clip.keyframes.push({id: `keyframe-${Date.now()}-${clipIdCounterRef.current++}`, property: path, frame: localFrame, value, easing: "ease-in-out"});
      } else {
        if (key === "audio" && property === "volume") clip.volume = value;
        else {
          const group = clip[key as "transform" | "effects"] as unknown as Record<string, number>;
          group[property] = value;
        }
      }
    });
  };

  const updateSelectedEffects = useCallback((updates: Partial<EditorClip["effects"]>, message?: string) => {
    if (!selectedClipId) return;
    commit((draft) => {
      const clip = draft.clips.find((candidate) => candidate.id === selectedClipId);
      if (!clip || clip.kind === "audio") return;
      clip.effects = {...DEFAULT_EFFECTS, ...clip.effects, ...updates};
    }, message);
  }, [commit, selectedClipId]);

  const updateSelectedColorGrade = useCallback((colorGrade: EditorClip["colorGrade"], message?: string) => {
    if (!selectedClipId || !colorGrade) return;
    commit((draft) => {
      const clip = draft.clips.find((item) => item.id === selectedClipId);
      if (clip) clip.colorGrade = JSON.parse(JSON.stringify(colorGrade)) as NonNullable<EditorClip["colorGrade"]>;
    }, message);
  }, [commit, selectedClipId]);

  const updateSelectedMasks = useCallback((effectMasks: NonNullable<EditorClip["effectMasks"]>, message?: string) => {
    if (!selectedClipId) return;
    commit((draft) => {
      const clip = draft.clips.find((item) => item.id === selectedClipId);
      if (clip) clip.effectMasks = JSON.parse(JSON.stringify(effectMasks)) as NonNullable<EditorClip["effectMasks"]>;
    }, message);
  }, [commit, selectedClipId]);

  const updateProjectLuts = useCallback((luts: NonNullable<EditorProject["luts"]>, message?: string) => {
    commit((draft) => { draft.luts = JSON.parse(JSON.stringify(luts)) as NonNullable<EditorProject["luts"]>; }, message);
  }, [commit]);

  const trackSelectedMask = useCallback(async (mode: "back" | "forward" | "range") => {
    if (!selectedClip || selectedClip.kind !== "video" || !selectedClip.src || !selectedProgramMask || maskTracking.running) {
      setToast("Select a video clip and an enabled mask to track motion");
      return;
    }
    cancelMaskTrackingRef.current = false;
    setMaskTracking({running: true, progress: 0});
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = selectedClip.src;
    const loaded = new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), {once: true});
      video.addEventListener("error", () => reject(new Error("The clip could not be decoded for tracking")), {once: true});
    });
    try {
      await loaded;
      const width = 160;
      const height = Math.max(90, Math.round(width / Math.max(1, video.videoWidth / Math.max(1, video.videoHeight))));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", {willReadFrequently: true});
      if (!context) throw new Error("Mask tracker could not create its analysis surface");
      const capture = async (localFrame: number) => {
        const time = Math.min(Math.max(0, video.duration - .001), sourceTimeForTimelineFrame(localFrame, selectedClip.sourceStart, getClipPlaybackRate(selectedClip), project.fps));
        if (Math.abs(video.currentTime - time) > .0001) await new Promise<void>((resolve) => {video.addEventListener("seeked", () => resolve(), {once: true}); video.currentTime = time;});
        context.drawImage(video, 0, 0, width, height);
        const rgba = context.getImageData(0, 0, width, height).data;
        const data = new Uint8Array(width * height);
        for (let index = 0; index < data.length; index++) data[index] = Math.round(rgba[index * 4] * .2126 + rgba[index * 4 + 1] * .7152 + rgba[index * 4 + 2] * .0722);
        return {width, height, data};
      };
      const currentLocal = clamp(frame - selectedClip.start, 0, selectedClip.duration - 1);
      const targets = mode === "back" ? [Math.max(0, currentLocal - 1)] : mode === "forward" ? [Math.min(selectedClip.duration - 1, currentLocal + 1)] : Array.from({length: Math.max(0, selectedClip.duration - currentLocal - 1)}, (_, index) => currentLocal + index + 1);
      if (!targets.length || targets[0] === currentLocal) throw new Error("The playhead is already at the tracking boundary");
      let previousLocal = currentLocal;
      let previousFrame = await capture(previousLocal);
      let trackedMask = JSON.parse(JSON.stringify(selectedProgramMask)) as typeof selectedProgramMask;
      let lastConfidence = 0;
      for (let index = 0; index < targets.length; index++) {
        if (cancelMaskTrackingRef.current) break;
        const target = targets[index];
        const destination = await capture(target);
        const region = trackingRegionForMask(trackedMask, width, height, previousLocal);
        const result = trackTemplateTranslation(previousFrame, destination, region, {searchRadius: 10, sampleStep: 3});
        const base = maskAtFrame(trackedMask, previousLocal);
        const nextX = result.confidence >= .55 ? base.x + (result.dx / width) * 100 : base.x;
        const nextY = result.confidence >= .55 ? base.y + (result.dy / height) * 100 : base.y;
        trackedMask = upsertMaskKeyframe(upsertMaskKeyframe(trackedMask, "x", target, nextX, {confidence: result.confidence}), "y", target, nextY, {confidence: result.confidence});
        lastConfidence = result.confidence;
        previousFrame = destination;
        previousLocal = target;
        setMaskTracking({running: true, progress: (index + 1) / targets.length, confidence: result.confidence});
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      updateSelectedMasks((selectedClip.effectMasks ?? []).map((mask) => mask.id === trackedMask.id ? trackedMask : mask), cancelMaskTrackingRef.current ? "Mask tracking stopped" : `Tracked mask · ${Math.round(lastConfidence * 100)}% confidence`);
      setMaskTracking({running: false, progress: 1, confidence: lastConfidence});
    } catch (error) {
      setMaskTracking({running: false, progress: 0});
      setToast(error instanceof Error ? error.message : "Mask tracking failed");
    } finally {
      video.removeAttribute("src");
      video.load();
    }
  }, [frame, maskTracking.running, project.fps, selectedClip, selectedProgramMask, updateSelectedMasks]);

  const applyColorPreset = useCallback((preset: typeof COLOR_PRESETS[number]) => {
    updateSelectedEffects({...preset.values, enabled: true, colorEnabled: true}, `Applied ${preset.name} look`);
  }, [updateSelectedEffects]);

  const resetColor = useCallback(() => updateSelectedEffects({...DEFAULT_EFFECTS}, "Reset color and effects"), [updateSelectedEffects]);

  const copyColor = useCallback(() => {
    if (!selectedClip || selectedClip.kind === "audio") return;
    colorClipboardRef.current = {...selectedClip.effects};
    setToast(`Copied color from ${selectedClip.name}`);
  }, [selectedClip]);

  const pasteColor = useCallback(() => {
    if (!colorClipboardRef.current) {
      setToast("Copy color settings from another clip first");
      return;
    }
    updateSelectedEffects({...colorClipboardRef.current}, "Pasted color settings");
  }, [updateSelectedEffects]);

  const applyVideoEffect = useCallback((descriptorId: string) => {
    if (!selectedClip || selectedClip.kind === "audio" || selectedClip.kind === "caption") {
      setToast("Select a visual clip before adding an effect");
      return;
    }
    const descriptor = getVisualEffectDescriptor(descriptorId);
    if (!descriptor || !descriptor.supportedKinds.includes(selectedClip.kind as never)) {
      setToast("That effect is not compatible with the selected clip");
      return;
    }
    const instance = createVisualEffectInstance(descriptorId, `effect-${Date.now()}-${clipIdCounterRef.current++}`);
    commit((draft) => {
      const clip = draft.clips.find((item) => item.id === selectedClip.id);
      if (clip) clip.visualEffects = [...(clip.visualEffects ?? []), instance];
    }, `Added ${descriptor.name}`);
  }, [commit, selectedClip]);

  const updateVisualEffect = (effectId: string, updater: (effect: VisualEffectInstance) => VisualEffectInstance | null) => {
    if (!selectedClip) return;
    commit((draft) => {
      const clip = draft.clips.find((item) => item.id === selectedClip.id);
      if (!clip) return;
      clip.visualEffects = (clip.visualEffects ?? []).flatMap((effect) => {
        if (effect.id !== effectId) return [effect];
        const next = updater(effect);
        return next ? [next] : [];
      });
    }, "Updated effect stack");
  };

  const importObjectMatte = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!selectedClip || !files.length) return;
    if (selectedClip.kind === "audio" || selectedClip.kind === "caption") {
      setToast("Select a visual clip before importing an object matte");
      return;
    }
    setToast(`Uploading ${files.length} matte ${files.length === 1 ? "frame" : "frames"}…`);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const response = await fetch(`/api/media?name=${encodeURIComponent(file.name)}`, {method: "POST", headers: {"Content-Type": file.type || "image/png"}, body: file});
        const body = await response.json() as {url?: string; error?: string};
        if (!response.ok || !body.url) throw new Error(body.error ?? `Could not upload ${file.name}`);
        return {name: file.name, src: body.url};
      }));
      const matte = importObjectMatteSequence({id: `matte-${Date.now()}`, name: files.length > 1 ? "Object Matte Sequence" : files[0].name, files: uploaded});
      commit((draft) => {
        const clip = draft.clips.find((item) => item.id === selectedClip.id);
        if (clip) clip.objectMattes = [...(clip.objectMattes ?? []), matte];
      }, "Imported object matte");
      setToast(`Object matte added with ${matte.frames.length} frames`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Object matte import failed");
    }
  };

  useEffect(() => {
    if (activeLeftTab !== "color" || !selectedClip || selectedClip.kind === "audio" || selectedClip.kind === "caption") return;
    let disposed = false;
    const timeout = window.setTimeout(() => {
      const analyze = (media: CanvasImageSource) => {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 54;
        const context = canvas.getContext("2d", {willReadFrequently: true});
        if (!context) return;
        try {
          context.drawImage(media, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const red = Array(32).fill(0) as number[];
        const green = Array(32).fill(0) as number[];
        const blue = Array(32).fill(0) as number[];
        const waveform = Array(48).fill(0) as number[];
        const waveCounts = Array(48).fill(0) as number[];
        const effects = {...DEFAULT_EFFECTS, ...selectedClip.effects};
        const exposure = effects.enabled && effects.colorEnabled ? (2 ** effects.exposure) * (effects.brightness / 100) : 1;
        const contrast = effects.enabled && effects.colorEnabled ? effects.contrast / 100 : 1;
        for (let offset = 0; offset < pixels.length; offset += 16) {
          let r = pixels[offset] * exposure;
          let g = pixels[offset + 1] * exposure;
          let b = pixels[offset + 2] * exposure;
          if (effects.enabled && effects.colorEnabled) {
            r += effects.temperature * 0.42 + effects.tint * 0.18;
            g -= effects.tint * 0.28;
            b -= effects.temperature * 0.42 - effects.tint * 0.18;
            r = (r - 128) * contrast + 128;
            g = (g - 128) * contrast + 128;
            b = (b - 128) * contrast + 128;
          }
          r = clamp(r, 0, 255);
          g = clamp(g, 0, 255);
          b = clamp(b, 0, 255);
          red[Math.min(31, Math.floor(r / 8))] += 1;
          green[Math.min(31, Math.floor(g / 8))] += 1;
          blue[Math.min(31, Math.floor(b / 8))] += 1;
          const pixelIndex = offset / 4;
          const x = pixelIndex % canvas.width;
          const bucket = Math.min(47, Math.floor((x / canvas.width) * 48));
          waveform[bucket] += (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
          waveCounts[bucket] += 1;
        }
        const peak = Math.max(1, ...red, ...green, ...blue);
          if (!disposed) setScopeData({
            waveform: waveform.map((value, index) => value / Math.max(1, waveCounts[index])),
            red: red.map((value) => value / peak),
            green: green.map((value) => value / peak),
            blue: blue.map((value) => value / peak),
          });
        } catch {
          // The program frame can be unavailable while Remotion seeks. The current scope remains visible.
        }
      };
      const programMedia = document.querySelector<HTMLVideoElement | HTMLImageElement>(".program-stage video, .program-stage img");
      if (programMedia) {
        analyze(programMedia);
        return;
      }
      if (!selectedClip.src) return;
      const poster = new Image();
      poster.crossOrigin = "anonymous";
      poster.onload = () => analyze(poster);
      poster.src = selectedClip.kind === "image" ? selectedClip.src : selectedClip.src.replace(/\.[a-z0-9]+(?=$|[?#])/i, ".png");
    }, 180);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
    };
  }, [activeLeftTab, frame, selectedClip]);

  const togglePropertyKeyframe = (key: PropertyGroup, property: string) => {
    if (!selectedClip || !selectedClipId) return;
    if (frame < selectedClip.start || frame >= selectedClip.start + selectedClip.duration) {
      setToast("Move the playhead over the selected clip to add a keyframe");
      return;
    }
    const path = propertyPath(key, property);
    const localFrame = frame - selectedClip.start;
    const exists = hasKeyframeAt(selectedClip, path, localFrame);
    const value = getAnimatedPropertyValue(selectedClip, path, localFrame);
    commit((draft) => {
      const clip = draft.clips.find((candidate) => candidate.id === selectedClipId);
      if (!clip) return;
      clip.keyframes = clip.keyframes ?? [];
      if (exists) clip.keyframes = clip.keyframes.filter((keyframe) => !(keyframe.property === path && keyframe.frame === localFrame));
      else clip.keyframes.push({id: `keyframe-${Date.now()}-${clipIdCounterRef.current++}`, property: path, frame: localFrame, value, easing: "ease-in-out"});
    }, `${exists ? "Removed" : "Added"} ${formatPropertyName(property)} keyframe`);
  };

  const seekAdjacentKeyframe = (direction: -1 | 1) => {
    if (!selectedClip) return;
    const frames = Array.from(new Set((selectedClip.keyframes ?? []).map((keyframe) => selectedClip.start + keyframe.frame))).sort((a, b) => a - b);
    const target = direction < 0 ? [...frames].reverse().find((candidate) => candidate < frame) : frames.find((candidate) => candidate > frame);
    if (target === undefined) {
      setToast(direction < 0 ? "No previous keyframe" : "No next keyframe");
      return;
    }
    seek(target);
  };

  const keyframeState = (key: PropertyGroup, property: string) => {
    if (!selectedClip) return {animated: false, active: false};
    const path = propertyPath(key, property);
    return {
      animated: hasPropertyKeyframes(selectedClip, path),
      active: frame >= selectedClip.start && frame < selectedClip.start + selectedClip.duration && hasKeyframeAt(selectedClip, path, frame - selectedClip.start),
    };
  };

  const selectedTransitionFrom = selectedTransition ? project.clips.find((clip) => clip.id === selectedTransition.fromClipId) : null;
  const selectedTransitionTo = selectedTransition ? project.clips.find((clip) => clip.id === selectedTransition.toClipId) : null;

  const updateSelectedTransition = (updates: Partial<Pick<EditorTransition, "type" | "duration">>) => {
    if (!selectedTransition) return;
    const maxDuration = Math.max(2, Math.min(selectedTransitionFrom?.duration ?? 2, selectedTransitionTo?.duration ?? 2));
    commit((draft) => {
      const transition = draft.transitions.find((item) => item.id === selectedTransition.id);
      if (!transition) return;
      if (updates.type) transition.type = updates.type;
      if (updates.duration !== undefined) transition.duration = clamp(Math.round(updates.duration), 2, maxDuration);
    }, "Updated transition");
  };

  const updateClipAudio = (property: "fadeIn" | "fadeOut" | "audioMuted", value: number | boolean) => {
    if (!selectedClipId) return;
    commit((draft) => {
      const clip = draft.clips.find((candidate) => candidate.id === selectedClipId);
      if (!clip) return;
      if (property === "audioMuted") clip.audioMuted = Boolean(value);
      else if (property === "fadeIn") {
        clip.fadeIn = clamp(Math.round(Number(value)), 0, Math.max(0, clip.duration - clip.fadeOut));
      } else {
        clip.fadeOut = clamp(Math.round(Number(value)), 0, Math.max(0, clip.duration - clip.fadeIn));
      }
    }, "Updated clip audio");
  };

  const toggleTrack = (trackId: string, property: "muted" | "solo" | "hidden" | "locked") => {
    commit((draft) => {
      const track = draft.tracks.find((candidate) => candidate.id === trackId);
      if (track) track[property] = !track[property];
    });
  };

  const beginDrag = (event: React.PointerEvent, clip: EditorClip, mode: DragMode) => {
    event.stopPropagation();
    setContextMenu(null);
    if (activeTool === "razor") {
      const lane = event.currentTarget.closest<HTMLElement>(".track-lane");
      if (lane) splitClipAt(clip.id, Math.round((event.clientX - lane.getBoundingClientRect().left) / pixelsPerFrame));
      return;
    }
    if (event.shiftKey) {
      selectClip(clip.id, true);
      return;
    }
    setSelectedTransitionId(null);
    const ids = selectedClipIds.includes(clip.id) ? expandLinkedIds(selectedClipIds) : expandLinkedIds([clip.id]);
    setSelectedClipIds(ids);
    dragOriginProjectRef.current = cloneProject(project);
    dragPreviewProjectRef.current = cloneProject(project);
    setDrag({
      clipId: clip.id,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      initialStart: clip.start,
      initialDuration: clip.duration,
      initialSourceStart: clip.sourceStart,
      initialFadeIn: clip.fadeIn,
      initialFadeOut: clip.fadeOut,
      selected: project.clips.filter((item) => ids.includes(item.id)).map((item) => ({id: item.id, start: item.start, trackId: item.trackId, duration: item.duration, sourceStart: item.sourceStart})),
    });
  };

  const beginMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== "select" || event.button !== 0 || event.target !== event.currentTarget) return;
    const canvas = event.currentTarget.closest<HTMLElement>(".timeline-canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const next = {startX: event.clientX - rect.left, startY: event.clientY - rect.top, x: event.clientX - rect.left, y: event.clientY - rect.top, additive: event.shiftKey};
    marqueeRef.current = next;
    setMarquee(next);
    setSelectedTransitionId(null);
    if (!event.shiftKey) setSelectedClipIds([]);
  };

  const saveProject = () => {
    try {
      saveStoredProject(projectId, syncActiveSequence(project), {manual: true});
      setToast("Project saved locally");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Project could not be saved");
    }
  };

  const exportProjectFile = () => {
    const blob = new Blob([JSON.stringify(createProjectFile(syncActiveSequence(project)), null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name.toLowerCase().replace(/\s+/g, "-")}.directors-cut.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Editable project file exported");
  };

  const exportInterchange = (format: "edl" | "xml") => {
    const artifact = format === "edl" ? exportCmx3600Edl(syncActiveSequence(project)) : exportFcp7Xml(syncActiveSequence(project));
    const url = URL.createObjectURL(new Blob([artifact.content], {type: artifact.mimeType}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast(artifact.warnings.length ? `Exported ${format.toUpperCase()} with ${artifact.warnings.length} compatibility warnings` : `Exported ${format.toUpperCase()} interchange`);
  };

  const startVideoExport = async () => {
    const browserOnlyClips = project.clips.filter((clip) => clip.src?.startsWith("blob:"));
    if (browserOnlyClips.length) {
      setRenderJob({
        id: "unavailable-media",
        stage: "error",
        progress: 0,
        message: "Re-import media before exporting",
        filename: "",
        error: `${browserOnlyClips.length} ${browserOnlyClips.length === 1 ? "clip uses" : "clips use"} temporary browser media. Re-import the source file so Directors Cut Pro can make it available to the renderer.`,
      });
      return;
    }
    setRenderStarting(true);
    setRenderJob(null);
    try {
      const frameRange: [number, number] | null = exportRange === "selected" && selectedClip
        ? [selectedClip.start, selectedClip.start + selectedClip.duration - 1]
        : null;
      const response = await fetch("/api/render", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({project: syncActiveSequence(project), format: exportFormat, quality: exportQuality, resolution: exportResolution, frameRange}),
      });
      const result = await response.json() as RenderJobStatus & {error?: string};
      if (!response.ok) throw new Error(result.error ?? "The render service rejected the export");
      setRenderJob(result);
      setExportJobs((current) => [result, ...current.filter((job) => job.id !== result.id)]);
      setToast("Export queued");
    } catch (error) {
      setRenderJob({id: "start-error", stage: "error", progress: 0, message: "Export could not start", filename: "", error: error instanceof Error ? error.message : String(error)});
    } finally {
      setRenderStarting(false);
    }
  };

  const cancelVideoExport = async () => {
    if (!renderJob || ["complete", "cancelled", "error"].includes(renderJob.stage)) return;
    await fetch(`/api/render/${renderJob.id}`, {method: "DELETE"}).catch(() => undefined);
    setRenderJob((current) => current ? {...current, stage: "cancelled", message: "Export cancelled"} : current);
    setToast("Video export cancelled");
  };

  const addReviewComment = () => {
    if (!reviewCommentText.trim()) return;
    try {
      const comment = createReviewComment({sequenceId: project.activeSequenceId, frame, author: "You", body: reviewCommentText});
      setReviewComments((current) => [comment, ...current]);
      if (sharedSession?.role === "reviewer") void appendSharedComment(sharedSession, comment).then((remote) => setReviewComments(remote.comments)).catch((error) => setToast(error instanceof Error ? error.message : "Could not share review note"));
      setReviewCommentText("");
      setToast(`Review note added at ${formatTimecode(frame, project.fps)}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not add review note");
    }
  };

  const saveReviewVersion = () => {
    const revision = (projectVersions[projectVersions.length - 1]?.revision ?? 0) + 1;
    const snapshot = createVersionSnapshot(syncActiveSequence(project), {revision, parentRevision: revision > 1 ? revision - 1 : undefined, author: "You", label: `Review ${revision}`});
    setProjectVersions((current) => [...current.slice(-19), snapshot]);
    setToast(`Saved Review ${revision}`);
  };

  const restoreReviewVersion = (version: ProjectVersionSnapshot) => {
    setPast((current) => [...current.slice(-49), cloneProject(project)]);
    setFuture([]);
    setProject(normalizeProject(version.project));
    setToast(`Restored ${version.label ?? `revision ${version.revision}`}`);
  };

  const addVoiceoverToTimeline = (upload: VoiceoverUpload, recording: VoiceoverRecording) => {
    const audioTrack = project.tracks.find((track) => track.id === destinationRoutes.audio && track.kind === "audio" && !track.locked)
      ?? project.tracks.find((track) => track.kind === "audio" && !track.locked);
    if (!audioTrack) {
      setToast("Unlock or create an audio track before recording voiceover");
      return;
    }
    const stamp = Date.now();
    const mediaId = `voiceover-media-${stamp}`;
    const clipId = `voiceover-clip-${stamp}`;
    const duration = Math.max(1, Math.round(recording.durationMs / 1000 * project.fps));
    commit((draft) => {
      draft.media.push({id: mediaId, name: upload.fileName.replace(/\.[^.]+$/, ""), kind: "audio", src: upload.src, duration, durationInSeconds: recording.durationMs / 1000, color: "#43b984", binId: "bin-audio", fileName: upload.fileName, fileSize: upload.size, mimeType: upload.mimeType, importedAt: stamp, renderReady: true});
      draft.clips.push({id: clipId, name: "Voiceover", kind: "audio", trackId: audioTrack.id, start: frame, duration, sourceStart: 0, src: upload.src, color: "#43b984", volume: 1, fadeIn: 0, fadeOut: 0, audioMuted: false, audioPan: 0, audioProcessors: [], playbackRate: 1, preservePitch: true, transform: {...DEFAULT_TRANSFORM}, effects: {...DEFAULT_EFFECTS}, keyframes: [], sourceMediaId: mediaId});
      draft.durationInFrames = Math.max(draft.durationInFrames, frame + duration);
    }, "Recorded voiceover");
    setSelectedClipIds([clipId]);
    setToast(`Voiceover added to ${audioTrack.name} at ${formatTimecode(frame, project.fps)}`);
  };

  const publishForReview = async () => {
    setSharedStatus("syncing");
    try {
      const {session} = await publishSharedProject(syncActiveSequence(project));
      await updateSharedComments(session, reviewComments);
      setSharedSession(session);
      setSharedStatus("synced");
      setToast("Private shared project created");
    } catch (error) {
      setSharedStatus("error");
      setToast(error instanceof Error ? error.message : "Could not publish shared project");
    }
  };

  const syncSharedProject = async () => {
    if (!sharedSession) return publishForReview();
    if (sharedSession.role === "reviewer") return reloadSharedProject();
    setSharedStatus("syncing");
    try {
      const remote = await updateSharedProject(sharedSession, syncActiveSequence(project));
      await updateSharedComments({...sharedSession, revision: remote.revision}, reviewComments);
      setSharedSession({...sharedSession, revision: remote.revision});
      setRemoteConflict(null);
      setSharedStatus("synced");
      setToast(`Shared revision ${remote.revision} is current`);
    } catch (error) {
      const detail = error as Error & {status?: number; payload?: {current?: SharedProjectPayload}};
      if (detail.status === 409 && detail.payload?.current) {
        setRemoteConflict(detail.payload.current);
        setSharedStatus("conflict");
        setToast("Shared project has a newer revision — your edit was not overwritten");
      } else {
        setSharedStatus("error");
        setToast(detail.message || "Shared project sync failed");
      }
    }
  };

  const copyReviewerLink = async () => {
    if (!sharedSession?.reviewerToken) return;
    const link = `${window.location.origin}${window.location.pathname}#review=${sharedSession.id}.${sharedSession.reviewerToken}`;
    await navigator.clipboard.writeText(link);
    setToast("Reviewer link copied · comment-only access");
  };

  const reloadSharedProject = async () => {
    if (!sharedSession) return;
    setSharedStatus("syncing");
    try {
      const remote = remoteConflict ?? await fetchSharedProject(sharedSession);
      setPast((current) => [...current.slice(-49), cloneProject(project)]);
      setFuture([]);
      setProject(normalizeProject(remote.project));
      setReviewComments(remote.comments);
      setSharedSession({...sharedSession, revision: remote.revision});
      setRemoteConflict(null);
      setSharedStatus("synced");
      setToast(`Loaded shared revision ${remote.revision}`);
    } catch (error) {
      setSharedStatus("error");
      setToast(error instanceof Error ? error.message : "Could not load shared project");
    }
  };

  const renderJobId = renderJob?.id;
  const renderJobStage = renderJob?.stage;

  useEffect(() => {
    if (!exportOpen) return;
    let disposed = false;
    const refresh = () => void fetch("/api/render").then(async (response) => {
      if (!response.ok || disposed) return;
      const jobs = await response.json() as RenderJobStatus[];
      if (!disposed) setExportJobs(Array.isArray(jobs) ? jobs : []);
    }).catch(() => undefined);
    refresh();
    const interval = window.setInterval(refresh, 750);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [exportOpen]);

  useEffect(() => {
    if (!renderJobId || !renderJobStage || !["queued", "bundling", "rendering", "packaging"].includes(renderJobStage)) return;
    let disposed = false;
    let timeout: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/render/${renderJobId}`);
        const result = await response.json() as RenderJobStatus & {error?: string};
        if (!response.ok) throw new Error(result.error ?? "Unable to read export progress");
        if (disposed) return;
        setRenderJob(result);
        if (result.stage === "complete") setToast(`Video export ready · ${result.sizeBytes ? formatBytes(result.sizeBytes) : result.filename}`);
        else if (["queued", "bundling", "rendering", "packaging"].includes(result.stage)) timeout = window.setTimeout(poll, 500);
      } catch (error) {
        if (!disposed) setRenderJob((current) => current ? {...current, stage: "error", message: "Lost connection to renderer", error: error instanceof Error ? error.message : String(error)} : current);
      }
    };
    timeout = window.setTimeout(poll, 300);
    return () => {
      disposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [renderJobId, renderJobStage]);

  const defaultBinForKind = useCallback((kind: ProjectMedia["kind"]) => project.mediaBins.find((bin) => bin.id === `bin-${kind === "image" ? "graphics" : kind}`)?.id ?? project.mediaBins[0]?.id ?? "bin-video", [project.mediaBins]);

  const uploadMediaFile = async (file: File) => {
    try {
      const upload = await fetch(`/api/media?name=${encodeURIComponent(file.name)}`, {method: "POST", headers: {"Content-Type": file.type || "application/octet-stream"}, body: file});
      const result = await upload.json() as {url?: string; error?: string};
      if (!upload.ok || !result.url) throw new Error(result.error ?? "Media upload failed");
      return {src: new URL(result.url, window.location.origin).href, renderReady: true};
    } catch {
      return {src: URL.createObjectURL(file), renderReady: false};
    }
  };

  const readMediaMetadata = async (src: string, kind: ProjectMedia["kind"], file?: File) => {
    if (kind === "image") {
      return await new Promise<{duration: number; durationInSeconds: number; width?: number; height?: number; fps?: number}>((resolve) => {
        const image = new Image();
        let settled = false;
        const finish = (width?: number, height?: number) => {
          if (settled) return;
          settled = true;
          resolve({duration: Math.round(project.fps * 5), durationInSeconds: 5, width, height});
        };
        image.onload = () => finish(image.naturalWidth, image.naturalHeight);
        image.onerror = () => finish();
        image.src = src;
        window.setTimeout(() => finish(), 1800);
      });
    }

    let parsedFps: number | undefined;
    let parsedDuration: number | undefined;
    let parsedWidth: number | undefined;
    let parsedHeight: number | undefined;
    if (kind === "video" && file) {
      try {
        const {parseMedia} = await import("@remotion/media-parser");
        const parsed = await parseMedia({
          src: file,
          fields: {fps: true, durationInSeconds: true, dimensions: true},
          acknowledgeRemotionLicense: true,
        });
        parsedFps = normalizeFrameRate(parsed.fps);
        parsedDuration = parsed.durationInSeconds && Number.isFinite(parsed.durationInSeconds) ? parsed.durationInSeconds : undefined;
        parsedWidth = parsed.dimensions?.width;
        parsedHeight = parsed.dimensions?.height;
      } catch {
        // Browser metadata remains a useful fallback for containers the parser cannot inspect.
      }
    }

    return await new Promise<{duration: number; durationInSeconds?: number; width?: number; height?: number; fps?: number}>((resolve) => {
      const media = document.createElement(kind === "audio" ? "audio" : "video");
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        const durationInSeconds = parsedDuration ?? (Number.isFinite(media.duration) ? media.duration : undefined);
        const duration = durationInSeconds ? Math.max(2, Math.round(durationInSeconds * project.fps)) : Math.round(project.fps * 6);
        const dimensions = kind === "video" ? {
          width: parsedWidth ?? ((media as HTMLVideoElement).videoWidth || undefined),
          height: parsedHeight ?? ((media as HTMLVideoElement).videoHeight || undefined),
        } : {};
        media.removeAttribute("src");
        resolve({duration, durationInSeconds, fps: parsedFps, ...dimensions});
      };
      media.preload = "metadata";
      media.onloadedmetadata = finish;
      media.onerror = finish;
      media.src = src;
      window.setTimeout(finish, 1800);
    });
  };

  const fileToMediaItem = async (file: File, index: number, forcedBinId?: string): Promise<ProjectMedia> => {
    const kind: ProjectMedia["kind"] = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : "video";
    const previewSrc = URL.createObjectURL(file);
    const [uploaded, metadata] = await Promise.all([
      uploadMediaFile(file),
      readMediaMetadata(previewSrc, kind, file),
    ]).finally(() => URL.revokeObjectURL(previewSrc));
    return {
      id: `import-${Date.now()}-${index}-${clipIdCounterRef.current++}`,
      name: file.name,
      kind,
      src: uploaded.src,
      duration: metadata.duration,
      color: kind === "audio" ? "#42b97e" : kind === "image" ? "#b978e8" : "#578ce8",
      binId: forcedBinId ?? (activeBinId !== "all" ? activeBinId : defaultBinForKind(kind)),
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || undefined,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      durationInSeconds: metadata.durationInSeconds,
      importedAt: Date.now(),
      fingerprint: `${file.name.toLowerCase()}:${file.size}:${file.lastModified}`,
      renderReady: uploaded.renderReady,
      offline: false,
    };
  };

  const filesToMediaItems = async (files: File[], forcedBinId?: string) => Promise.all(files.map((file, index) => fileToMediaItem(file, index, forcedBinId)));

  const conformImportedFrameRate = async (items: ProjectMedia[]) => {
    const currentProject = projectRef.current;
    const mismatch = items.find((item) => item.kind === "video" && item.fps && !frameRatesMatch(item.fps, currentProject.fps));
    if (!mismatch?.fps) return {items};

    const choice = await requestFrameRateChoice({
      mediaName: mismatch.name,
      mediaFps: mismatch.fps,
      projectFps: currentProject.fps,
      width: mismatch.width,
      height: mismatch.height,
    });
    if (choice === "keep") return {items};

    const nextFps = mismatch.fps;
    return {items: items.map((item) => conformMediaToFrameRate(item, nextFps)), targetFps: nextFps};
  };

  const uniqueImportFiles = (files: File[]) => {
    const known = new Set(project.media.map((item) => item.fingerprint).filter(Boolean));
    const unique: File[] = [];
    let duplicates = 0;
    for (const file of files) {
      const fingerprint = `${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
      if (known.has(fingerprint)) duplicates += 1;
      else {
        known.add(fingerprint);
        unique.push(file);
      }
    }
    return {unique, duplicates};
  };

  const importMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const {unique, duplicates} = uniqueImportFiles(files);
    const conformed = await conformImportedFrameRate(await filesToMediaItems(unique));
    const additions = conformed.items;
    if (additions.length) {
      const previousFps = projectRef.current.fps;
      commit((draft) => {
        if (conformed.targetFps) Object.assign(draft, retimeProjectForFrameRate(draft, conformed.targetFps));
        draft.media.unshift(...additions);
      }, `Imported ${additions.length} media ${additions.length === 1 ? "file" : "files"}`);
      if (conformed.targetFps) setFrame((current) => Math.max(0, Math.round(current * conformed.targetFps! / previousFps)));
      setSelectedMediaId(additions[0].id);
    }
    const unavailable = additions.filter((item) => item.renderReady === false).length;
    const duplicateMessage = duplicates ? ` · skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}` : "";
    setToast(additions.length ? `Imported ${additions.length}${duplicateMessage}${unavailable ? " · preview only" : " · ready to export"}` : `Skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}`);
  };

  const createBin = () => {
    const id = `bin-${Date.now()}-${clipIdCounterRef.current++}`;
    const name = `Bin ${project.mediaBins.length + 1}`;
    commit((draft) => draft.mediaBins.push({id, name}), `Created ${name}`);
    setActiveBinId(id);
    setEditingBinId(id);
  };

  const renameBin = (binId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    commit((draft) => {
      const bin = draft.mediaBins.find((item) => item.id === binId);
      if (bin) bin.name = trimmed;
    }, `Renamed bin to ${trimmed}`);
  };

  const renameMedia = (mediaId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    commit((draft) => {
      const media = draft.media.find((item) => item.id === mediaId);
      if (media) media.name = trimmed;
      for (const clip of draft.clips) if (clip.sourceMediaId === mediaId) clip.name = trimmed;
    }, `Renamed media to ${trimmed}`);
  };

  const moveMediaToBin = (mediaId: string, binId: string) => commit((draft) => {
    const media = draft.media.find((item) => item.id === mediaId);
    if (media) media.binId = binId;
  }, `Moved media to ${project.mediaBins.find((bin) => bin.id === binId)?.name ?? "bin"}`);

  const createMediaProxy = async (mediaId: string) => {
    const media = projectRef.current.media.find((item) => item.id === mediaId);
    if (!media || media.kind !== "video") return setToast("Only video media needs a proxy");
    if (media.offline || media.renderReady === false) return setToast("Relink this media before creating a proxy");
    try {
      if (media.proxy?.status === "error") await fetch(`/api/proxies/${media.proxy.id}`, {method: "DELETE"});
      const response = await fetch("/api/proxies", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({src: media.src})});
      const proxy = await response.json() as ProxyApiStatus & {error?: string};
      if (!response.ok) throw new Error(proxy.error ?? "Proxy generation could not start");
      setProject((current) => ({...current, media: current.media.map((item) => item.id === mediaId ? {...item, proxy} : item)}));
      setToast(proxy.status === "ready" ? `${media.name} proxy is ready` : `Creating ${media.name} proxy in the background`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Proxy generation failed");
    }
  };

  const prepareMediaForEditing = async (mediaId: string) => {
    const media = projectRef.current.media.find((item) => item.id === mediaId);
    if (!media || media.offline || media.renderReady === false) return setToast("Relink this media before preparing it");
    try {
      if (media.analysis?.status === "error") await fetch(`/api/media-analysis/${media.analysis.id}`, {method: "DELETE"});
      const response = await fetch("/api/media-analysis", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({src: media.src, kind: media.kind})});
      const analysis = await response.json() as MediaAnalysisApiStatus & {error?: string};
      if (!response.ok) throw new Error(analysis.error ?? "Media preparation could not start");
      analysisRequestsRef.current.add(media.id);
      setProject((current) => ({...current, media: current.media.map((item) => item.id === mediaId ? {...item, analysis} : item)}));
      if (media.kind === "video" && media.proxy?.status !== "ready" && media.proxy?.status !== "queued" && media.proxy?.status !== "processing") void createMediaProxy(mediaId);
      setToast(analysis.status === "ready" ? `${media.name} is optimized for editing` : `Preparing ${media.name} in the background`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Media preparation failed");
    }
  };

  const removeMediaProxy = async (mediaId: string) => {
    const media = projectRef.current.media.find((item) => item.id === mediaId);
    if (!media?.proxy) return;
    try {
      const response = await fetch(`/api/proxies/${media.proxy.id}`, {method: "DELETE"});
      if (!response.ok && response.status !== 404) throw new Error("Proxy cache could not be removed");
      setProject((current) => ({...current, media: current.media.map((item) => item.id === mediaId ? {...item, proxy: undefined} : item)}));
      setToast(`Removed ${media.name} proxy · original media is unchanged`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Proxy removal failed");
    }
  };

  const createTimelineRenderCache = async () => {
    const current = projectRef.current;
    try {
      if (current.renderCache && (current.renderCache.status === "error" || current.renderCache.fingerprint !== projectRenderFingerprint(current))) await fetch(`/api/render-cache/${current.renderCache.id}`, {method: "DELETE"});
      const response = await fetch("/api/render-cache", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({project: {...current, renderCache: undefined}})});
      const renderCache = await response.json() as NonNullable<EditorProject["renderCache"]> & {error?: string};
      if (!response.ok) throw new Error(renderCache.error ?? "Timeline cache could not start");
      setProject((value) => ({...value, renderCache}));
      setUseRenderCache(true);
      setToast(renderCache.status === "ready" ? "Timeline render cache is ready" : "Rendering the timeline cache in the background");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Timeline cache failed");
    }
  };

  const removeTimelineRenderCache = async () => {
    const renderCache = projectRef.current.renderCache;
    if (!renderCache) return;
    const response = await fetch(`/api/render-cache/${renderCache.id}`, {method: "DELETE"});
    if (!response.ok && response.status !== 404) return setToast("Timeline cache could not be removed");
    setProject((current) => ({...current, renderCache: undefined}));
    setToast("Timeline render cache removed");
  };

  const toggleMediaOffline = (mediaId: string) => {
    const media = project.media.find((item) => item.id === mediaId);
    if (!media) return;
    commit((draft) => {
      const item = draft.media.find((candidate) => candidate.id === mediaId);
      if (item) item.offline = !item.offline;
    }, media.offline ? `${media.name} is online` : `${media.name} marked offline`);
  };

  const removeMedia = (mediaId: string) => {
    const media = project.media.find((item) => item.id === mediaId);
    const usage = mediaUseCounts[mediaId] ?? 0;
    if (!media) return;
    if (usage) {
      setToast(`${media.name} is used by ${usage} timeline clip${usage === 1 ? "" : "s"} · relink or remove those clips first`);
      return;
    }
    commit((draft) => {draft.media = draft.media.filter((item) => item.id !== mediaId);}, `Removed ${media.name} from project`);
    setSelectedMediaId(null);
  };

  const startMediaFileAction = (mediaId: string, action: MediaFileAction) => {
    pendingMediaActionRef.current = {id: mediaId, action};
    mediaActionInputRef.current?.click();
  };

  const handleMediaFileAction = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const pending = pendingMediaActionRef.current;
    const file = event.target.files?.[0];
    event.target.value = "";
    pendingMediaActionRef.current = null;
    if (!pending || !file) return;
    const current = project.media.find((item) => item.id === pending.id);
    if (!current) return;
    const fileKind: ProjectMedia["kind"] = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : "video";
    if (fileKind !== current.kind) {
      setToast(`Choose a ${current.kind} file to ${pending.action} ${current.name}`);
      return;
    }
    const replacement = await fileToMediaItem(file, 0, current.binId);
    analysisRequestsRef.current.delete(pending.id);
    commit((draft) => {
      const item = draft.media.find((candidate) => candidate.id === pending.id);
      if (!item) return;
      const nextName = pending.action === "replace" ? replacement.name : item.name;
      Object.assign(item, replacement, {id: pending.id, name: nextName, binId: current.binId, color: current.color, offline: false, proxy: undefined, analysis: undefined});
      for (const clip of draft.clips) {
        if (clip.sourceMediaId !== pending.id) continue;
        clip.src = replacement.src;
        if (pending.action === "replace") clip.name = nextName;
      }
    }, `${pending.action === "replace" ? "Replaced" : "Relinked"} ${current.name}`);
  };

  const getDropFrame = (event: React.DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rawFrame = (event.clientX - rect.left) / pixelsPerFrame;
    return Math.max(0, snap ? Math.round(rawFrame / 5) * 5 : Math.round(rawFrame));
  };

  const handleTrackDragOver = (event: React.DragEvent<HTMLDivElement>, trackId: string) => {
    event.preventDefault();
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    const isFileDrop = event.dataTransfer.types.includes("Files");
    const droppedFileTypes = Array.from(event.dataTransfer.items).filter((item) => item.kind === "file").map((item) => item.type);
    const hasCompatibleFile = track?.kind !== "caption" && (droppedFileTypes.length === 0 || droppedFileTypes.some((type) => track?.kind === "audio" ? type.startsWith("audio/") : !type.startsWith("audio/")));
    const compatible = isFileDrop && hasCompatibleFile;
    const allowed = Boolean(compatible && !track?.locked);
    event.dataTransfer.dropEffect = allowed ? "copy" : "none";
    setDropTarget({trackId, frame: getDropFrame(event), duration: 90, allowed});
  };

  const handleTrackDrop = async (event: React.DragEvent<HTMLDivElement>, trackId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const start = getDropFrame(event);
    const dropFps = project.fps;
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    setDropTarget(null);

    if (!track || track.locked) {
      setToast(track?.locked ? `${track.name} is locked` : "Track unavailable");
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    const {unique, duplicates} = uniqueImportFiles(files);
    const conformed = await conformImportedFrameRate(await filesToMediaItems(unique));
    const additions = conformed.items;
    const compatibleItems = additions.filter((item) => clipTrackKind(item.kind) === track.kind);
    if (!compatibleItems.length) {
      if (additions.length) commit((draft) => {
        if (conformed.targetFps) Object.assign(draft, retimeProjectForFrameRate(draft, conformed.targetFps));
        draft.media.unshift(...additions);
      }, `Imported ${additions.length} media files`);
      setToast(duplicates ? `Skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}` : `Those files are not compatible with ${track.name}`);
      return;
    }
    const latestProject = projectRef.current;
    const staged = conformed.targetFps ? retimeProjectForFrameRate(latestProject, conformed.targetFps) : cloneProject(latestProject);
    const placementFrame = Math.max(0, Math.round(start * staged.fps / dropFps));
    staged.media.unshift(...additions);
    let offsetFrames = 0;
    const items = compatibleItems.map((item) => {
      const placement = {mediaId: item.id, trackId, offsetFrames};
      offsetFrames += item.duration;
      return placement;
    });
    const result = placeMedia(staged, {mode: editMode, atFrame: placementFrame, items, idBase: "drop"});
    const added = result.ok ? compatibleItems.length : 0;
    if (applyKernelResult(result, `Dropped ${compatibleItems.length} ${compatibleItems.length === 1 ? "clip" : "clips"} onto ${track.name}`, latestProject) && result.ok) {
      setSelectedClipIds(result.createdClipIds);
      if (conformed.targetFps) setFrame((current) => Math.max(0, Math.round(current * conformed.targetFps! / latestProject.fps)));
    }
    const unavailable = additions.filter((item) => item.renderReady === false).length;
    if (result.ok) setToast(`Dropped ${added} ${added === 1 ? "clip" : "clips"} onto ${track.name}${duplicates ? ` · skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}` : ""}${unavailable ? " · preview only until relinked" : " · ready to export"}`);
  };

  const exportIsActive = Boolean(renderJob && ["queued", "bundling", "rendering", "packaging"].includes(renderJob.stage));
  const currentVersionChanges = projectVersions.length ? diffProjects(projectVersions[projectVersions.length - 1].project, project) : [];
  const speedDialogClip = speedDialog ? project.clips.find((clip) => clip.id === speedDialog.clipId) : null;
  const exportScale = exportResolution === "720p" ? Math.min(1, 720 / project.height) : 1;
  const exportWidth = Math.max(2, Math.round((project.width * exportScale) / 2) * 2);
  const exportHeight = Math.max(2, Math.round((project.height * exportScale) / 2) * 2);
  const exportFrames = exportRange === "selected" && selectedClip ? selectedClip.duration : project.durationInFrames;

  return (
    <div className={`editor-shell ${activeLeftTab === "color" ? "color-active" : ""} ${activeLeftTab === "audio" ? "audio-active" : ""}`}>
      {frameRateMismatch && (
        <div className="frame-rate-overlay">
          <section className="frame-rate-dialog" role="dialog" aria-modal="true" aria-labelledby="frame-rate-dialog-title">
            <header>
              <div className="frame-rate-dialog-icon"><Gauge size={19} /></div>
              <div><strong id="frame-rate-dialog-title">Clip Mismatch Warning</strong><small>This clip does not match the sequence frame rate.</small></div>
            </header>
            <div className="frame-rate-clip">
              <Film size={20} />
              <div><strong>{frameRateMismatch.mediaName}</strong><span>{frameRateMismatch.width && frameRateMismatch.height ? `${frameRateMismatch.width} × ${frameRateMismatch.height} · ` : ""}{formatFrameRate(frameRateMismatch.mediaFps)} fps</span></div>
            </div>
            <div className="frame-rate-comparison">
              <div><span>Current sequence</span><strong>{formatFrameRate(frameRateMismatch.projectFps)} fps</strong></div>
              <ChevronRight size={16} />
              <div><span>Imported clip</span><strong>{formatFrameRate(frameRateMismatch.mediaFps)} fps</strong></div>
            </div>
            <p>Change the sequence to match the clip? Existing edits will be retimed so their positions and durations stay at the same real-world time.</p>
            <footer>
              <button className="frame-rate-keep" onClick={() => resolveFrameRateChoice("keep")}>Keep existing settings</button>
              <button className="frame-rate-change" onClick={() => resolveFrameRateChoice("change")}>Change sequence settings</button>
            </footer>
          </section>
        </div>
      )}
      {speedDialog && speedDialogClip && (
        <div className="speed-dialog-overlay" onPointerDown={(event) => event.target === event.currentTarget && setSpeedDialog(null)}>
          <section className="speed-dialog" role="dialog" aria-modal="true" aria-labelledby="speed-dialog-title">
            <header>
              <div className="speed-dialog-icon"><Gauge size={19} /></div>
              <div><strong id="speed-dialog-title">Clip Speed / Duration</strong><small>{speedDialogClip.name}</small></div>
              <button onClick={() => setSpeedDialog(null)} title="Close speed controls"><X size={16} /></button>
            </header>
            <div className="speed-preset-row" aria-label="Speed presets">
              {[25, 50, 100, 200, 400].map((preset) => <button className={Math.abs(speedDialog.speedPercent - preset) < 0.01 ? "active" : ""} key={preset} onClick={() => updateSpeedPercent(preset)}>{preset}%</button>)}
            </div>
            <div className="speed-fields">
              <label><span>Speed</span><div><input aria-label="Clip speed percentage" type="number" min={MIN_PLAYBACK_RATE * 100} max={MAX_PLAYBACK_RATE * 100} step={1} value={Math.round(speedDialog.speedPercent * 10) / 10} onChange={(event) => updateSpeedPercent(Number(event.target.value))} /><i>%</i></div></label>
              <label><span>Duration</span><div><input aria-label="Clip duration in seconds" type="number" min={2 / project.fps} step={1 / project.fps} value={Math.round((speedDialog.durationFrames / project.fps) * 1000) / 1000} onChange={(event) => updateSpeedDuration(Number(event.target.value) * project.fps)} /><i>sec</i></div><small>{formatTimecode(speedDialog.durationFrames, project.fps)} · {speedDialog.durationFrames} frames</small></label>
            </div>
            <label className="speed-slider"><span>Playback speed</span><input aria-label="Playback speed" type="range" min={25} max={400} step={1} value={clamp(speedDialog.speedPercent, 25, 400)} onChange={(event) => updateSpeedPercent(Number(event.target.value))} /></label>
            <div className="speed-options">
              <label><input type="checkbox" checked={speedDialog.ripple} onChange={(event) => setSpeedDialog((current) => current ? {...current, ripple: event.target.checked} : current)} /><span><strong>Ripple edit, shifting trailing clips</strong><small>Move later clips on this track when duration changes.</small></span></label>
              <label><input type="checkbox" checked={speedDialog.preservePitch} onChange={(event) => setSpeedDialog((current) => current ? {...current, preservePitch: event.target.checked} : current)} /><span><strong>Maintain audio pitch</strong><small>Keep voices and music at their natural pitch.</small></span></label>
            </div>
            <footer>
              <span>Source used: {Math.round((speedDialog.sourceSpan / project.fps) * 100) / 100}s</span>
              <button onClick={() => setSpeedDialog(null)}>Cancel</button>
              <button className="apply-speed" onClick={applySpeedDialog}>Apply</button>
            </footer>
          </section>
        </div>
      )}
      {reviewOpen && (
        <div className="review-overlay" onPointerDown={(event) => event.target === event.currentTarget && setReviewOpen(false)}>
          <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title">
            <header>
              <div className="review-dialog-icon"><MessageSquare size={18} /></div>
              <div><strong id="review-dialog-title">Review & versions</strong><small>Frame-accurate notes, semantic versions, and protected sharing</small></div>
              <button onClick={() => setReviewOpen(false)} title="Close review"><X size={16} /></button>
            </header>
            <div className="review-columns">
              <section className="review-comments-column">
                <div className="review-section-heading"><span>Sequence comments</span><b>{reviewComments.filter((item) => item.status === "open").length} open</b></div>
                <div className="review-composer">
                  <div><MessageSquare size={13} /><span>{formatTimecode(frame, project.fps)}</span><small>{activeSequence?.name ?? "Sequence"}</small></div>
                  <textarea aria-label="Review comment" value={reviewCommentText} onChange={(event) => setReviewCommentText(event.target.value)} placeholder="Leave a precise note at the playhead…" rows={3} />
                  <button disabled={!reviewCommentText.trim()} onClick={addReviewComment}>Add comment</button>
                </div>
                <div className="review-comment-list">
                  {reviewComments.length ? reviewComments.map((comment) => <article className={comment.status === "resolved" ? "resolved" : ""} key={comment.id}>
                    <button className="review-timecode" onClick={() => {if (comment.sequenceId === project.activeSequenceId) seek(comment.frame); setReviewOpen(false);}}>{formatTimecode(comment.frame, project.fps)}</button>
                    <div><strong>{comment.author}</strong><p>{comment.body}</p><small>{comment.status === "resolved" ? "Resolved" : "Needs review"}</small></div>
                    <button disabled={sharedSession?.role === "reviewer"} title={sharedSession?.role === "reviewer" ? "Only editors can change comment status" : undefined} onClick={() => setReviewComments((current) => current.map((item) => item.id === comment.id ? setReviewCommentResolved(item, item.status !== "resolved") : item))}>{comment.status === "resolved" ? "Reopen" : "Resolve"}</button>
                  </article>) : <div className="review-empty"><MessageSquare size={22} /><strong>No review notes yet</strong><span>Add a note tied to the current playhead.</span></div>}
                </div>
              </section>
              <section className="review-versions-column">
                <div className={`shared-project-bar ${sharedStatus}`}>
                  <div><span>{sharedSession?.role === "reviewer" ? `Reviewer access · r${sharedSession.revision}` : sharedSession ? `Private share · r${sharedSession.revision}` : "Local project"}</span><small>{sharedStatus === "conflict" ? "A newer remote revision needs your decision" : sharedStatus === "syncing" ? "Synchronizing…" : sharedSession?.role === "reviewer" ? "Comment-only session; project edits cannot overwrite the shared cut" : sharedSession ? "Revision-safe workspace; stale edits are never overwritten" : "Publish to the private local collaboration service"}</small></div>
                  {sharedSession?.reviewerToken && sharedSession.role !== "reviewer" ? <button onClick={() => void copyReviewerLink()}>Copy reviewer link</button> : null}
                  <button disabled={sharedStatus === "syncing"} onClick={() => void syncSharedProject()}>{sharedSession?.role === "reviewer" ? "Refresh" : sharedSession ? "Sync" : "Publish"}</button>
                </div>
                {remoteConflict && <div className="shared-conflict"><Info size={14} /><div><strong>Revision conflict</strong><span>Remote revision {remoteConflict.revision} changed since this editor opened. Reloading preserves your current edit in undo history.</span></div><button onClick={() => void reloadSharedProject()}>Load remote</button><button onClick={() => {setSharedSession(null); setRemoteConflict(null); setSharedStatus("local"); setToast("Local edit detached from the shared project");}}>Keep as local copy</button></div>}
                <div className="review-section-heading"><span>Version history</span><b>{projectVersions.length} saved</b></div>
                <button className="save-review-version" onClick={saveReviewVersion}><Save size={14} /><span><strong>Save review version</strong><small>{currentVersionChanges.length ? `${currentVersionChanges.length} changes since last version` : projectVersions.length ? "No changes since last version" : "Create a comparison baseline"}</small></span></button>
                {projectVersions.length ? <div className="review-diff-list"><header><span>Changes since {projectVersions[projectVersions.length - 1].label ?? `revision ${projectVersions[projectVersions.length - 1].revision}`}</span><b>{currentVersionChanges.length}</b></header>{currentVersionChanges.length ? currentVersionChanges.slice(0, 8).map((change, index) => <div key={`${change.entityType}-${change.entityId}-${change.category}-${index}`}><i className={change.category}>{change.category}</i><span><strong>{change.label}</strong><small>{change.entityType} · {change.category}</small></span></div>) : <p>Current edit matches the saved baseline.</p>}{currentVersionChanges.length > 8 ? <footer>+ {currentVersionChanges.length - 8} more changes</footer> : null}</div> : null}
                <div className="review-version-list">
                  {[...projectVersions].reverse().map((version, index) => {
                    const newer = index === 0 ? project : projectVersions[projectVersions.length - index]?.project;
                    const changes = newer ? diffProjects(version.project, newer).length : 0;
                    return <article key={version.id}><div><strong>{version.label ?? `Revision ${version.revision}`}</strong><span>{new Date(version.createdAt).toLocaleString()}</span><small>{changes} semantic {changes === 1 ? "change" : "changes"} after this version · {version.checksum}</small></div><button onClick={() => restoreReviewVersion(version)}>Restore</button></article>;
                  })}
                  {!projectVersions.length && <div className="review-empty"><Save size={22} /><strong>No review versions</strong><span>Save a named baseline before major edits.</span></div>}
                </div>
                <div className="review-boundary"><Info size={13} /><span>Private sharing uses an unguessable editor token and revision conflicts on this Directors Cut Pro host. Internet-facing teams still require deployed identity, permissions, encrypted object storage, and audit controls.</span></div>
              </section>
            </div>
          </section>
        </div>
      )}
      {exportOpen && (
        <div className="export-overlay" onPointerDown={(event) => event.target === event.currentTarget && setExportOpen(false)}>
          <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
            <header>
              <div className="export-dialog-icon"><FileVideo2 size={18} /></div>
              <div><strong id="export-dialog-title">Export video</strong><small>Render the active sequence with Remotion</small></div>
              <button onClick={() => setExportOpen(false)} title="Close export"><X size={16} /></button>
            </header>
            <div className="export-summary">
              <div className="export-summary-frame"><Film size={25} /><span>{activeSequence?.name ?? "Active sequence"}</span></div>
              <div><strong>{project.name}</strong><span>{exportWidth} × {exportHeight}</span><span>{formatFrameRate(project.fps)} fps · {formatTimecode(exportFrames, project.fps)}</span><span>{EXPORT_FORMAT_LABELS[exportFormat].summary}</span></div>
            </div>
            <div className="export-settings">
              <label><span>Format</span><select aria-label="Export format" disabled={renderStarting} value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>{(Object.entries(EXPORT_FORMAT_LABELS) as Array<[ExportFormat, {name: string; summary: string; download: string}]>).map(([format, details]) => <option key={format} value={format}>{details.name}</option>)}</select></label>
              <label><span>Resolution</span><select aria-label="Export resolution" disabled={renderStarting} value={exportResolution} onChange={(event) => setExportResolution(event.target.value as ExportResolution)}><option value="source">Source ({project.width} × {project.height})</option><option value="720p">720p preview</option></select></label>
              <label><span>Quality</span><select aria-label="Export quality" disabled={renderStarting} value={exportQuality} onChange={(event) => setExportQuality(event.target.value as ExportQuality)}><option value="draft">Draft · faster</option><option value="standard">Standard</option><option value="high">High quality</option></select></label>
              <label><span>Range</span><select aria-label="Export range" disabled={renderStarting} value={exportRange} onChange={(event) => setExportRange(event.target.value as ExportRange)}><option value="sequence">Entire sequence</option><option value="selected" disabled={!selectedClip}>Selected clip{selectedClip ? ` · ${selectedClip.name}` : ""}</option></select></label>
            </div>
            {(renderStarting || renderJob) && (
              <div className={`render-status ${renderJob?.stage ?? "starting"}`}>
                <div className="render-status-row">
                  <span>{renderJob?.stage === "complete" ? <Check size={15} /> : renderJob?.stage === "error" ? <X size={15} /> : <LoaderCircle className={exportIsActive || renderStarting ? "spinning" : ""} size={15} />}</span>
                  <div><strong>{renderStarting ? "Starting local renderer" : renderJob?.message}</strong><small>{renderJob?.stage === "complete" && renderJob.sizeBytes ? `${renderJob.filename} · ${formatBytes(renderJob.sizeBytes)}` : renderJob?.error ?? (exportIsActive ? "You can keep editing while this finishes." : "")}</small></div>
                  <b>{renderJob?.stage === "complete" ? "100%" : `${Math.round(renderJob?.progress ?? 0)}%`}</b>
                </div>
                <div className="render-progress"><i style={{width: `${renderJob?.progress ?? 1}%`}} /></div>
              </div>
            )}
            {exportJobs.length > 0 && <div className="export-queue-list"><header><span>Export queue</span><b>{exportJobs.filter((job) => ["queued", "bundling", "rendering", "packaging"].includes(job.stage)).length} active</b></header>{exportJobs.map((job) => <article key={job.id}><div><strong>{job.filename || "Preparing export"}</strong><small>{job.stage} · {Math.round(job.progress)}%{job.attempts ? ` · attempt ${job.attempts}` : ""}</small></div>{job.stage === "complete" && job.downloadUrl ? <a href={job.downloadUrl} download={job.filename}>Download</a> : job.stage === "error" || job.stage === "cancelled" ? <button onClick={() => void fetch(`/api/render/${job.id}/retry`, {method: "POST"}).then((response) => response.json()).then((next: RenderJobStatus) => {setRenderJob(next); setExportJobs((current) => [next, ...current.filter((item) => item.id !== next.id)]);})}>Retry</button> : <button onClick={() => void fetch(`/api/render/${job.id}/cancel`, {method: "POST"}).then((response) => response.json()).then((next: RenderJobStatus) => {setExportJobs((current) => current.map((item) => item.id === next.id ? next : item)); if (renderJob?.id === next.id) setRenderJob(next);})}>Cancel</button>}</article>)}</div>}
            <footer>
              <button className="project-export-button" onClick={exportProjectFile}><Save size={14} /> Project file</button>
              <button className="project-export-button" onClick={() => exportInterchange("edl")} title="Export CMX 3600 edit decision list">EDL</button>
              <button className="project-export-button" onClick={() => exportInterchange("xml")} title="Export Final Cut Pro 7 XML for Premiere Pro and Resolve">XML</button>
              <span />
              {exportIsActive ? <button className="cancel-render-button" onClick={() => void cancelVideoExport()}>Cancel render</button> : null}
              {renderJob?.stage === "complete" && renderJob.downloadUrl ? <a className="download-video-button" href={renderJob.downloadUrl} download={renderJob.filename}><Download size={15} /> Download</a> : null}
              <button className="start-render-button" disabled={renderStarting} onClick={() => void startVideoExport()}>{renderStarting ? <LoaderCircle className="spinning" size={15} /> : <FileVideo2 size={15} />} Queue export</button>
            </footer>
          </section>
        </div>
      )}
      {binPointerDrag?.active && (
        <div className="media-drag-ghost" style={{left: binPointerDrag.x + 13, top: binPointerDrag.y + 13}}>
          <span style={{background: binPointerDrag.item.color}}>{clipIcon(binPointerDrag.item.kind, 14)}</span>
          <strong>{binPointerDrag.item.name}</strong>
        </div>
      )}
      {contextMenu && (
        <div className="clip-context-menu" style={{left: contextMenu.x, top: contextMenu.y}} onPointerDown={(event) => event.stopPropagation()}>
          <strong>Clip actions</strong>
          <button onClick={() => {splitClipAt(contextMenu.clipId, frame); setContextMenu(null);}}><Scissors size={13} /> Split at playhead <kbd>S</kbd></button>
          <button onClick={() => openSpeedDialog(contextMenu.clipId)}><Gauge size={13} /> Speed / Duration <kbd>⌘R</kbd></button>
          <button onClick={() => {addTransition("cross-dissolve", contextMenu.clipId); setContextMenu(null);}}><Layers3 size={13} /> Add cross dissolve</button>
          <button onClick={() => {copySelected(); setContextMenu(null);}}><Copy size={13} /> Copy <kbd>⌘C</kbd></button>
          <button onClick={() => {duplicateSelected(); setContextMenu(null);}}><Copy size={13} /> Duplicate <kbd>⌘D</kbd></button>
          <button onClick={() => {rippleDeleteSelected(); setContextMenu(null);}}><Trash2 size={13} /> Ripple delete <kbd>⇧⌫</kbd></button>
          <span />
          <button onClick={() => {linkSelectedClips(); setContextMenu(null);}}><Link2 size={13} /> Link selected</button>
          <button onClick={() => {unlinkSelectedClips(); setContextMenu(null);}}><Link2 size={13} /> Unlink selected</button>
          <button className="danger" onClick={() => {deleteSelected(); setContextMenu(null);}}><Trash2 size={13} /> Delete <kbd>⌫</kbd></button>
        </div>
      )}
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark"><Clapperboard size={16} /></div><span>DIRECTORS <b>CUT PRO</b></span></div>
        <button className="project-title" onClick={() => {saveProject(); onBackToProjects();}} title="Back to projects"><span>{project.name}</span><ChevronDown size={13} /><i>{toast}</i></button>
        <div className="top-actions">
          <button className="icon-button" onClick={undo} disabled={!past.length} title="Undo (⌘Z)"><Undo2 size={16} /></button>
          <button className="icon-button" onClick={redo} disabled={!future.length} title="Redo (⇧⌘Z)"><Redo2 size={16} /></button>
          <button className="quiet-button" onClick={() => setReviewOpen(true)}><MessageSquare size={15} /> Review{reviewComments.some((item) => item.status === "open") ? <i className="review-count">{reviewComments.filter((item) => item.status === "open").length}</i> : null}</button>
          <button className="quiet-button" onClick={saveProject}><Save size={15} /> Save</button>
          <button className="export-button" onClick={() => {if (!exportIsActive) setRenderJob(null); setExportOpen(true);}}><Download size={15} /> Export</button>
          <button className="icon-button"><CircleHelp size={17} /></button>
          <button className="avatar">BS</button>
        </div>
      </header>

      <main className="workspace">
        <section className="left-panel panel">
          <div className="panel-tabs">
            <button className={activeLeftTab === "project" ? "active" : ""} onClick={() => setActiveLeftTab("project")}><FolderOpen size={14} /> Project</button>
            <button className={activeLeftTab === "text" ? "active" : ""} onClick={() => setActiveLeftTab("text")}><Type size={14} /> Text</button>
            <button className={activeLeftTab === "color" ? "active" : ""} onClick={() => setActiveLeftTab("color")}><Palette size={14} /> Color</button>
            <button className={activeLeftTab === "effects" ? "active" : ""} onClick={() => setActiveLeftTab("effects")}><WandSparkles size={14} /> Effects</button>
            <button className={activeLeftTab === "audio" ? "active" : ""} onClick={() => setActiveLeftTab("audio")}><AudioWaveform size={14} /> Audio</button>
          </div>
          {activeLeftTab === "project" ? (
            <div className="media-workspace">
              <div className="search-row"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search media" /><button onClick={() => fileInputRef.current?.click()}><Upload size={14} /></button></div>
              <input ref={fileInputRef} className="hidden-input" type="file" multiple accept="video/*,audio/*,image/*" onChange={importMedia} />
              <input ref={mediaActionInputRef} className="hidden-input" type="file" accept="video/*,audio/*,image/*" onChange={handleMediaFileAction} />
              <div className="media-browser-toolbar">
                <button onClick={createBin} title="New bin"><FolderPlus size={13} /><span>New bin</span></button>
                <span />
                <button className={mediaView === "grid" ? "active" : ""} onClick={() => setMediaView("grid")} title="Grid view"><Grid2X2 size={13} /></button>
                <button className={mediaView === "list" ? "active" : ""} onClick={() => setMediaView("list")} title="List view"><List size={13} /></button>
              </div>
              <div className="media-bin-strip">
                <button className={activeBinId === "all" ? "active" : ""} onClick={() => setActiveBinId("all")}>All <i>{project.media.length}</i></button>
                {project.mediaBins.map((bin) => editingBinId === bin.id ? (
                  <input
                    key={bin.id}
                    autoFocus
                    defaultValue={bin.name}
                    aria-label="Rename bin"
                    onBlur={(event) => {renameBin(bin.id, event.target.value); setEditingBinId(null);}}
                    onKeyDown={(event) => {if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEditingBinId(null);}}
                  />
                ) : (
                  <button key={bin.id} className={activeBinId === bin.id ? "active" : ""} onClick={() => setActiveBinId(bin.id)} onDoubleClick={() => setEditingBinId(bin.id)} title="Double-click to rename">
                    {bin.name} <i>{project.media.filter((item) => item.binId === bin.id).length}</i>
                  </button>
                ))}
              </div>
              <div className="media-filter-row">
                <select value={mediaKindFilter} onChange={(event) => setMediaKindFilter(event.target.value as typeof mediaKindFilter)} aria-label="Filter media type">
                  <option value="all">All types</option><option value="video">Video</option><option value="image">Images</option><option value="audio">Audio</option>
                </select>
                <select value={mediaSort} onChange={(event) => setMediaSort(event.target.value as MediaSort)} aria-label="Sort media">
                  <option value="name">Name</option><option value="date">Newest</option><option value="duration">Duration</option><option value="type">Type</option>
                </select>
                <span>{filteredMedia.length} items</span>
              </div>
              <div className={mediaView === "grid" ? "media-grid" : "media-list"}>
                {filteredMedia.map((item) => (
                  <button
                    key={item.id}
                    className={`${mediaView === "grid" ? "media-card" : "media-list-row"}${selectedMediaId === item.id ? " selected" : ""}${item.offline ? " offline" : ""}`}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      setSelectedMediaId(item.id);
                      const next = {item, originX: event.clientX, originY: event.clientY, x: event.clientX, y: event.clientY, active: false};
                      binPointerDragRef.current = next;
                      setBinPointerDrag(next);
                    }}
                    onDoubleClick={() => openInSourceMonitor(item)}
                    title="Drag to a timeline track or double-click to open in Source Monitor"
                  >
                    <div className="media-thumb" style={{"--media-color": item.color} as React.CSSProperties}>
                      {item.analysis?.status === "ready" && item.analysis.thumbnailUrl && !item.offline ? <img src={item.analysis.thumbnailUrl} alt="" /> : item.kind === "image" && !item.offline ? <img src={item.src} alt="" /> : clipIcon(item.kind, mediaView === "grid" ? 25 : 15)}
                      {item.offline && <b>OFFLINE</b>}
                      {item.proxy && <i className={`media-proxy-badge ${item.proxy.status}`}>{item.proxy.status === "ready" ? "P" : item.proxy.status === "error" ? "!" : "…"}</i>}
                      {item.analysis && <i className={`media-analysis-badge ${item.analysis.status}`}>{item.analysis.status === "ready" ? "✓" : item.analysis.status === "error" ? "!" : "…"}</i>}
                      <span>{formatTimecode(item.duration, project.fps).slice(3)}</span>
                    </div>
                    <div className="media-item-copy"><strong>{item.name}</strong><small>{item.kind.toUpperCase()}{mediaUseCounts[item.id] ? ` · ${mediaUseCounts[item.id]} USE${mediaUseCounts[item.id] === 1 ? "" : "S"}` : ""}</small></div>
                    {mediaView === "list" && <em>{item.width && item.height ? `${item.width}×${item.height}` : formatTimecode(item.duration, project.fps).slice(3)}</em>}
                  </button>
                ))}
                {!filteredMedia.length && <div className="media-empty"><Search size={18} /><strong>No media found</strong><small>Change the bin or filter, or import files.</small></div>}
              </div>
              {selectedMedia ? (
                <section className="media-details" aria-label="Selected media details">
                  <header><Info size={13} /><span>Media details</span><button onClick={() => setSelectedMediaId(null)} title="Close details"><X size={12} /></button></header>
                  <div className="media-details-title">
                    <div className="media-detail-icon" style={{"--media-color": selectedMedia.color} as React.CSSProperties}>{clipIcon(selectedMedia.kind, 18)}</div>
                    {editingMediaName ? (
                      <input autoFocus defaultValue={selectedMedia.name} aria-label="Rename media" onBlur={(event) => {renameMedia(selectedMedia.id, event.target.value); setEditingMediaName(false);}} onKeyDown={(event) => {if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEditingMediaName(false);}} />
                    ) : <button onDoubleClick={() => setEditingMediaName(true)} onClick={() => setEditingMediaName(true)} title="Rename media"><strong>{selectedMedia.name}</strong><small>{selectedMedia.fileName ?? selectedMedia.kind}</small></button>}
                    <span className={selectedMedia.offline ? "media-status offline" : selectedMedia.renderReady === false ? "media-status preview" : "media-status ready"}>{selectedMedia.offline ? "Offline" : selectedMedia.renderReady === false ? "Preview" : "Ready"}</span>
                  </div>
                  <div className="media-metadata">
                    <span>Duration <b>{formatTimecode(selectedMedia.duration, project.fps)}</b></span>
                    <span>Used <b>{mediaUseCounts[selectedMedia.id] ?? 0}×</b></span>
                    <span>Frame <b>{selectedMedia.width && selectedMedia.height ? `${selectedMedia.width} × ${selectedMedia.height}` : "—"}</b></span>
                    <span>Frame rate <b>{selectedMedia.fps ? `${formatFrameRate(selectedMedia.fps)} fps` : "—"}</b></span>
                    <span>Size <b>{selectedMedia.fileSize ? formatBytes(selectedMedia.fileSize) : "Bundled"}</b></span>
                    <span>Prepared <b>{selectedMedia.analysis?.status === "ready" ? "Ready" : selectedMedia.analysis?.status === "processing" ? "Analyzing" : selectedMedia.analysis?.status === "queued" ? "Queued" : selectedMedia.analysis?.status === "error" ? "Error" : "Pending"}</b></span>
                    {selectedMedia.kind === "video" && <span>Proxy <b>{selectedMedia.proxy?.status === "ready" ? selectedMedia.proxy.fileSize ? formatBytes(selectedMedia.proxy.fileSize) : "Ready" : selectedMedia.proxy?.status === "processing" ? "Processing" : selectedMedia.proxy?.status === "queued" ? "Queued" : selectedMedia.proxy?.status === "error" ? "Error" : "Not created"}</b></span>}
                  </div>
                  <label className="media-bin-select"><span>Bin</span><select value={selectedMedia.binId} onChange={(event) => moveMediaToBin(selectedMedia.id, event.target.value)}>{project.mediaBins.map((bin) => <option key={bin.id} value={bin.id}>{bin.name}</option>)}</select></label>
                  <div className="media-detail-actions">
                    <button onClick={() => addMediaToTimeline(selectedMedia)}><Plus size={12} /> Add</button>
                    <button onClick={() => startMediaFileAction(selectedMedia.id, "relink")}><RefreshCw size={12} /> Relink</button>
                    <button onClick={() => startMediaFileAction(selectedMedia.id, "replace")}><HardDrive size={12} /> Replace</button>
                    <button onClick={() => toggleMediaOffline(selectedMedia.id)}>{selectedMedia.offline ? <Link2 size={12} /> : <EyeOff size={12} />} {selectedMedia.offline ? "Online" : "Offline"}</button>
                    <button disabled={selectedMedia.analysis?.status === "queued" || selectedMedia.analysis?.status === "processing"} onClick={() => void prepareMediaForEditing(selectedMedia.id)} title="Cache the thumbnail and waveform; video also gets an edit proxy"><Sparkles size={12} /> {selectedMedia.analysis?.status === "ready" && (selectedMedia.kind !== "video" || selectedMedia.proxy?.status === "ready") ? "Optimized" : selectedMedia.analysis?.status === "error" ? "Retry prep" : "Optimize"}</button>
                    {selectedMedia.kind === "video" && (selectedMedia.proxy?.status === "ready"
                      ? <button onClick={() => void removeMediaProxy(selectedMedia.id)} title="Delete cached proxy; original media remains untouched"><Trash2 size={12} /> Proxy</button>
                      : <button disabled={selectedMedia.proxy?.status === "queued" || selectedMedia.proxy?.status === "processing"} onClick={() => void createMediaProxy(selectedMedia.id)} title={selectedMedia.proxy?.error ?? "Create a lightweight edit proxy in the background"}>{selectedMedia.proxy?.status === "queued" || selectedMedia.proxy?.status === "processing" ? <LoaderCircle className="spinning" size={12} /> : <Gauge size={12} />} {selectedMedia.proxy?.status === "error" ? "Retry" : selectedMedia.proxy ? "Creating" : "Proxy"}</button>)}
                    <button className="danger" disabled={Boolean(mediaUseCounts[selectedMedia.id])} onClick={() => removeMedia(selectedMedia.id)} title={mediaUseCounts[selectedMedia.id] ? "Media in use cannot be removed" : "Remove from project"}><Trash2 size={12} /> Remove</button>
                  </div>
                </section>
              ) : <button className="import-zone" onClick={() => fileInputRef.current?.click()}><Plus size={15} /><span>Import media</span><small>Or drag files onto the timeline</small></button>}
            </div>
          ) : activeLeftTab === "color" ? (
            <div className="color-workspace">
              {selectedClip && (selectedClip.kind === "video" || selectedClip.kind === "image") ? <>
                <div className="color-clip-header">
                  <span style={{background: selectedClip.color}}>{clipIcon(selectedClip.kind, 14)}</span>
                  <div><strong>{selectedClip.name}</strong><small>{selectedEffects.look} · Lumetri Color</small></div>
                  <button className={!selectedEffects.enabled ? "bypassed" : ""} onClick={() => updateSelectedEffects({enabled: !selectedEffects.enabled}, selectedEffects.enabled ? "Bypassed all clip effects" : "Enabled all clip effects")} title="Bypass all color and effects">{selectedEffects.enabled ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                  <button onClick={resetColor} title="Reset color and effects"><RotateCcw size={13} /></button>
                </div>
                <section className="color-scope-card">
                  <header><span>Live scopes</span><div><button className={scopeMode === "waveform" ? "active" : ""} onClick={() => setScopeMode("waveform")}>Luma</button><button className={scopeMode === "rgb" ? "active" : ""} onClick={() => setScopeMode("rgb")}>RGB</button></div></header>
                  <svg viewBox="0 0 210 100" role="img" aria-label={scopeMode === "waveform" ? "Luma waveform" : "RGB histogram"}>
                    {[10, 31, 53, 74, 96].map((y) => <line key={y} x1="0" x2="210" y1={y} y2={y} className="scope-grid-line" />)}
                    {scopeMode === "waveform" ? <polyline points={waveformPoints} className="scope-waveform" /> : scopeData.red.map((value, index) => {
                      const width = 210 / scopeData.red.length;
                      return <g key={index}><rect x={index * width} y={96 - value * 84} width={width + .4} height={value * 84} className="scope-red" /><rect x={index * width} y={96 - scopeData.green[index] * 84} width={width + .4} height={scopeData.green[index] * 84} className="scope-green" /><rect x={index * width} y={96 - scopeData.blue[index] * 84} width={width + .4} height={scopeData.blue[index] * 84} className="scope-blue" /></g>;
                    })}
                  </svg>
                  <footer><span>0</span><span>25</span><span>50</span><span>75</span><span>100 IRE</span></footer>
                </section>
                <div className="color-section-heading"><span>Creative looks</span><small>{selectedEffects.look}</small></div>
                <div className="color-look-grid">
                  {COLOR_PRESETS.map((preset) => <button key={preset.name} className={selectedEffects.look === preset.name ? "active" : ""} onClick={() => applyColorPreset(preset)}><i style={{background: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})`}} /><span>{preset.name}</span></button>)}
                </div>
                <div className="color-utility-row"><button onClick={copyColor}><Copy size={12} /> Copy grade</button><button onClick={pasteColor}><Link2 size={12} /> Paste grade</button></div>
                <section className={`color-module ${!selectedEffects.colorEnabled ? "disabled" : ""}`}>
                  <header><button onClick={() => updateSelectedEffects({colorEnabled: !selectedEffects.colorEnabled})}>{selectedEffects.colorEnabled ? <Eye size={12} /> : <EyeOff size={12} />}</button><span>Basic correction</span><button onClick={() => updateSelectedEffects({temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, brightness: 100, contrast: 100, look: "Custom"})}><RotateCcw size={11} /></button></header>
                  <ColorControl label="Temperature" value={propertyValue("effects", "temperature")} min={-100} max={100} onChange={(value) => updateSelected("effects", "temperature", value)} />
                  <ColorControl label="Tint" value={propertyValue("effects", "tint")} min={-100} max={100} onChange={(value) => updateSelected("effects", "tint", value)} />
                  <ColorControl label="Exposure" value={propertyValue("effects", "exposure")} min={-3} max={3} step={0.05} onChange={(value) => updateSelected("effects", "exposure", value)} />
                  <ColorControl label="Contrast" value={propertyValue("effects", "contrast")} min={0} max={200} onChange={(value) => updateSelected("effects", "contrast", value)} />
                  <ColorControl label="Highlights" value={propertyValue("effects", "highlights")} min={-100} max={100} onChange={(value) => updateSelected("effects", "highlights", value)} />
                  <ColorControl label="Shadows" value={propertyValue("effects", "shadows")} min={-100} max={100} onChange={(value) => updateSelected("effects", "shadows", value)} />
                  <ColorControl label="Whites" value={propertyValue("effects", "whites")} min={-100} max={100} onChange={(value) => updateSelected("effects", "whites", value)} />
                  <ColorControl label="Blacks" value={propertyValue("effects", "blacks")} min={-100} max={100} onChange={(value) => updateSelected("effects", "blacks", value)} />
                </section>
                <section className="color-module">
                  <header><Palette size={12} /><span>Creative</span><button onClick={() => updateSelectedEffects({saturation: 100, vibrance: 0, hue: 0, fade: 0, sharpen: 0, look: "Custom"})}><RotateCcw size={11} /></button></header>
                  <ColorControl label="Saturation" value={propertyValue("effects", "saturation")} min={0} max={200} onChange={(value) => updateSelected("effects", "saturation", value)} />
                  <ColorControl label="Vibrance" value={propertyValue("effects", "vibrance")} min={-100} max={100} onChange={(value) => updateSelected("effects", "vibrance", value)} />
                  <ColorControl label="Hue" value={propertyValue("effects", "hue")} min={-180} max={180} suffix="°" onChange={(value) => updateSelected("effects", "hue", value)} />
                  <ColorControl label="Faded film" value={propertyValue("effects", "fade")} min={0} max={100} onChange={(value) => updateSelected("effects", "fade", value)} />
                  <ColorControl label="Sharpen" value={propertyValue("effects", "sharpen")} min={0} max={100} onChange={(value) => updateSelected("effects", "sharpen", value)} />
                </section>
                <ProfessionalColorControls
                  grade={selectedColorGrade}
                  luts={project.luts ?? []}
                  masks={selectedClip.effectMasks ?? []}
                  selectedMaskId={selectedProgramMask?.id ?? null}
                  showOverlay={showMaskOverlay}
                  tracking={maskTracking}
                  onGrade={updateSelectedColorGrade}
                  onLuts={updateProjectLuts}
                  onMasks={updateSelectedMasks}
                  onSelectMask={setSelectedMaskId}
                  onToggleOverlay={() => setShowMaskOverlay((value) => !value)}
                  onTrack={(mode) => mode === "cancel" ? (cancelMaskTrackingRef.current = true) : void trackSelectedMask(mode)}
                />
                <section className="color-module effect-stack">
                  <header><Layers3 size={12} /><span>Effect stack</span><small>Fixed render order</small></header>
                  {([
                    {name: "Gaussian Blur", key: "blurEnabled", amount: "blur", value: selectedEffects.blur, max: 24, suffix: " px"},
                    {name: "Vignette", key: "vignetteEnabled", amount: "vignette", value: selectedEffects.vignette, max: 100, suffix: "%"},
                    {name: "Film Grain", key: "grainEnabled", amount: "grain", value: selectedEffects.grain, max: 100, suffix: "%"},
                    {name: "Glow", key: "glowEnabled", amount: "glow", value: selectedEffects.glow, max: 100, suffix: "%"},
                  ] as const).map((effect) => <div className={`effect-stack-item ${!selectedEffects[effect.key] ? "disabled" : ""}`} key={effect.name}>
                    <button onClick={() => updateSelectedEffects({[effect.key]: !selectedEffects[effect.key]} as Partial<EditorClip["effects"]>)}>{selectedEffects[effect.key] ? <Eye size={11} /> : <EyeOff size={11} />}</button>
                    <span><strong>{effect.name}</strong><small>{Math.round(effect.value * 10) / 10}{effect.suffix}</small></span>
                    <input aria-label={effect.name} type="range" min={0} max={effect.max} step={effect.amount === "blur" ? .5 : 1} value={effect.value} onChange={(event) => updateSelected("effects", effect.amount, Number(event.target.value))} />
                    <button onClick={() => updateSelectedEffects({[effect.amount]: 0} as Partial<EditorClip["effects"]>)} title={`Remove ${effect.name}`}><X size={11} /></button>
                  </div>)}
                </section>
              </> : <div className="color-empty"><Palette size={28} /><strong>Select a visual clip</strong><small>Color correction, looks, effects, masks, and scopes appear here.</small></div>}
            </div>
          ) : activeLeftTab === "text" ? (
            <div className="text-workspace">
              <div className="text-heading"><span>Text and captions</span><small>Titles · subtitles · graphics</small></div>
              <div className="text-actions">
                <button className="primary" onClick={() => addTextClip("title")}><Type size={17} /><span><strong>Add title</strong><small>Creates a title at the playhead</small></span><Plus size={14} /></button>
                <button onClick={() => addTextClip("caption")}><Captions size={17} /><span><strong>Add caption</strong><small>Creates a caption on C1</small></span><Plus size={14} /></button>
              </div>
              <div className="text-heading"><span>Caption file</span><small>{project.clips.filter((clip) => clip.kind === "caption").length} in sequence</small></div>
              <input ref={subtitleInputRef} className="hidden-input" type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" onChange={(event) => void importSubtitles(event)} />
              <div className="subtitle-actions">
                <button onClick={() => subtitleInputRef.current?.click()}><Upload size={14} /> Import SRT / VTT</button>
                <button onClick={exportSubtitles}><Download size={14} /> Export SRT</button>
              </div>
              <div className="text-heading"><span>Style presets</span><small>Select a text clip first</small></div>
              <div className="text-presets">
                <button onClick={() => updateSelectedText({textStyle: {...DEFAULT_TITLE_STYLE}})}><i className="preset-hero">Aa</i><span>Hero title</span></button>
                <button onClick={() => updateSelectedText({textStyle: {...DEFAULT_CAPTION_STYLE}})}><i className="preset-caption">Cc</i><span>Broadcast caption</span></button>
                <button onClick={() => updateSelectedText({textStyle: {...DEFAULT_TITLE_STYLE, fontSize: 58, fontWeight: 600, letterSpacing: 1, backgroundOpacity: 58}})}><i className="preset-card">Aa</i><span>Lower third</span></button>
              </div>
              <div className="text-tip"><Captions size={15} /><span>Select a title or caption on the timeline to edit its copy, font, colors, alignment, background, outline, and animation.</span></div>
            </div>
          ) : activeLeftTab === "effects" ? (
            <div className="effects-list">
              <div className="search-row"><Search size={14} /><input aria-label="Search visual effects" value={effectsSearch} onChange={(event) => setEffectsSearch(event.target.value)} placeholder="Search 25 effects" /></div>
              {selectedClip && selectedClip.kind !== "audio" && selectedClip.kind !== "caption" && (selectedClip.visualEffects?.length ?? 0) > 0 ? <div className="visual-effect-stack">
                <div className="effects-heading">Applied effects · render order</div>
                {selectedClip.visualEffects?.map((effect) => {
                  const descriptor = getVisualEffectDescriptor(effect.descriptorId);
                  return <article key={effect.id} className={effect.enabled ? "" : "disabled"}>
                    <header><label><input type="checkbox" checked={effect.enabled} onChange={(event) => updateVisualEffect(effect.id, (item) => ({...item, enabled: event.target.checked}))} /><span>{descriptor?.name ?? effect.descriptorId}</span></label><button onClick={() => updateVisualEffect(effect.id, () => null)} title="Remove effect"><X size={12} /></button></header>
                    {descriptor && <div className="visual-effect-parameters">{Object.entries(descriptor.parameters).map(([key, schema]) => {
                      const value = effect.parameters[key];
                      if (schema.type === "boolean") return <label key={key}><span>{key}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => updateVisualEffect(effect.id, (item) => ({...item, parameters: {...item.parameters, [key]: event.target.checked}}))} /></label>;
                      if (schema.type === "select") return <label key={key}><span>{key}</span><select value={String(value)} onChange={(event) => updateVisualEffect(effect.id, (item) => ({...item, parameters: {...item.parameters, [key]: event.target.value}}))}>{schema.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
                      return <label key={key}><span>{key}</span><input type={schema.type === "color" ? "color" : "number"} value={value as string | number} min={schema.type === "number" ? schema.min : undefined} max={schema.type === "number" ? schema.max : undefined} step={schema.type === "number" ? schema.step : undefined} onChange={(event) => updateVisualEffect(effect.id, (item) => ({...item, parameters: {...item.parameters, [key]: schema.type === "number" ? Number(event.target.value) : event.target.value}}))} /></label>;
                    })}</div>}
                  </article>;
                })}
              </div> : null}
              {selectedClip && selectedClip.kind !== "audio" && selectedClip.kind !== "caption" ? <div className="object-matte-panel">
                <div><strong>Object mattes</strong><small>{selectedClip.objectMattes?.length ? `${selectedClip.objectMattes.length} attached` : "No semantic provider installed · import PNG/WebP mattes"}</small></div>
                <label><Plus size={13} /> Import matte sequence<input className="hidden-input" type="file" multiple accept="image/png,image/webp" onChange={(event) => void importObjectMatte(event)} /></label>
                {selectedClip.objectMattes?.map((matte) => <article key={matte.id}><label><input type="checkbox" checked={matte.enabled} onChange={(event) => commit((draft) => {const clip = draft.clips.find((item) => item.id === selectedClip.id); const target = clip?.objectMattes?.find((item) => item.id === matte.id); if (target) target.enabled = event.target.checked;}, "Toggled object matte")} /><span>{matte.name}</span></label><small>{matte.frames.length} frames · {matte.source}</small></article>)}
              </div> : null}
              <div className="effects-heading">Video effects</div>
              {listVisualEffects(effectsSearch).map((effect) => <button key={effect.id} onClick={() => applyVideoEffect(effect.id)}><Sparkles size={16} /><span>{effect.name}<small>{effect.category} · deterministic preview</small></span><Plus size={14} /></button>)}
              <div className="effects-heading">Video transitions</div>
              {(Object.entries(TRANSITION_NAMES) as Array<[TransitionType, string]>).map(([type, name]) => (
                <button key={type} onClick={() => addTransition(type)} title={`Apply ${name} to the selected edit point`}>
                  <Layers3 size={16} /><span>{name}<small>Transition</small></span><Plus size={14} />
                </button>
              ))}
            </div>
          ) : (
            <div className="audio-mixer">
              <VoiceoverRecorder onUploaded={addVoiceoverToTimeline} onError={setToast} />
              <AudioMixerPanel
                tracks={project.tracks}
                settings={project.audioSettings}
                onTracksChange={(tracks) => commit((draft) => {draft.tracks = tracks;}, "Updated audio mixer")}
                onSettingsChange={(audioSettings) => commit((draft) => {draft.audioSettings = audioSettings;}, "Updated audio bus")}
              />
            </div>
          )}
        </section>

        <section className="program-panel panel">
          <div className="monitor-heading">
            <div className="monitor-tabs">
              <button className={monitorMode === "source" ? "active" : ""} disabled={!selectedMedia} onClick={() => selectedMedia && setMonitorMode("source")}>Source{selectedMedia ? `: ${selectedMedia.name}` : ""}</button>
              <button className={monitorMode === "program" ? "active" : ""} onClick={() => setMonitorMode("program")}>Program: {activeSequence?.name ?? "Sequence"}</button>
            </div>
            <div><button
              className={`cache-preview-toggle ${renderCacheUsable && useRenderCache ? "active" : ""} ${renderCacheWorking ? "working" : ""}`}
              disabled={renderCacheWorking}
              onClick={(event) => {
                if (event.shiftKey && project.renderCache) void removeTimelineRenderCache();
                else if (renderCacheUsable) setUseRenderCache((current) => !current);
                else void createTimelineRenderCache();
              }}
              title={renderCacheWorking ? "Rendering timeline cache" : renderCacheUsable ? `${useRenderCache ? "Bypass" : "Use"} cached timeline preview · Shift-click to remove` : "Render a preview cache for the active sequence"}
            >{renderCacheWorking ? <LoaderCircle className="spinning" size={12} /> : <Sparkles size={12} />} {renderCacheWorking ? "Rendering" : renderCacheUsable ? useRenderCache ? "Cached" : "Cache off" : project.renderCache ? "Rebuild cache" : "Render cache"}</button><button
              className={`proxy-preview-toggle ${useProxies ? "active" : ""}`}
              onClick={() => setUseProxies((current) => !current)}
              title={`${useProxies ? "Disable" : "Enable"} proxy media for Source and Program preview · exports always use originals`}
            ><Gauge size={13} /> {useProxies ? "Proxy" : "Original"}{workingProxyCount ? <i>{workingProxyCount}</i> : readyProxyCount ? <i>{readyProxyCount}</i> : null}</button><span className={`media-preparation-status ${preparingMediaCount ? "working" : ""}`} title={`${preparedMediaCount} of ${project.media.length} media items have cached thumbnails and waveforms`}>{preparingMediaCount ? <LoaderCircle className="spinning" size={11} /> : <Check size={11} />} {preparingMediaCount ? `Preparing ${preparingMediaCount}` : `${preparedMediaCount} prepared`}</span><button>Fit <ChevronDown size={12} /></button><button><Settings2 size={14} /></button></div>
          </div>
          <div className="program-stage">
            {monitorMode === "source" && selectedMedia ? <div className="source-monitor-frame">
              {selectedMedia.kind === "video" ? <video
                key={`${selectedMedia.id}-${selectedMediaPreviewSrc}`}
                ref={(node) => {sourceMediaRef.current = node;}}
                src={selectedMediaPreviewSrc}
                onPlay={() => setSourcePlaying(true)}
                onPause={() => setSourcePlaying(false)}
                onTimeUpdate={(event) => {
                  const next = Math.round(event.currentTarget.currentTime * project.fps);
                  setSourceFrame(next);
                  if (sourceRange && next >= sourceRange.outFrame) {event.currentTarget.pause(); setShuttleRate(0); seekSource(sourceRange.inFrame);}
                }}
              /> : selectedMedia.kind === "audio" ? <div className="source-audio-preview"><AudioWaveform size={46} /><strong>{selectedMedia.name}</strong><small>Audio source</small><audio
                key={`${selectedMedia.id}-${selectedMediaPreviewSrc}`}
                ref={(node) => {sourceMediaRef.current = node;}}
                src={selectedMediaPreviewSrc}
                onPlay={() => setSourcePlaying(true)}
                onPause={() => setSourcePlaying(false)}
                onTimeUpdate={(event) => {
                  const next = Math.round(event.currentTarget.currentTime * project.fps);
                  setSourceFrame(next);
                  if (sourceRange && next >= sourceRange.outFrame) {event.currentTarget.pause(); setShuttleRate(0); seekSource(sourceRange.inFrame);}
                }}
              /></div> : <img src={selectedMediaPreviewSrc} alt={selectedMedia.name} />}
            </div> : <div className="player-frame">
              <Player
                ref={playerRef}
                component={EditorComposition}
                inputProps={playerInputProps}
                durationInFrames={project.durationInFrames}
                fps={project.fps}
                compositionWidth={project.width}
                compositionHeight={project.height}
                controls={false}
                autoPlay={false}
                playbackRate={shuttleRate > 0 ? shuttleRate : 1}
                initialFrame={initialFrameRef.current}
                loop
                acknowledgeRemotionLicense
                style={{width: "100%", height: "100%"}}
              />
            </div>}
            {monitorMode === "program" && activeLeftTab === "color" && showMaskOverlay && selectedProgramMask ? <div
              className={`program-mask-overlay ${selectedProgramMask.shape}`}
              style={{left: `${selectedProgramMask.x}%`, top: `${selectedProgramMask.y}%`, width: `${selectedProgramMask.width}%`, height: `${selectedProgramMask.height}%`, transform: `translate(-50%,-50%) rotate(${selectedProgramMask.rotation}deg)`}}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).tagName === "I") return;
                event.currentTarget.setPointerCapture(event.pointerId);
                maskDragRef.current = {maskId: selectedProgramMask.id, clientX: event.clientX, clientY: event.clientY, x: selectedProgramMask.x, y: selectedProgramMask.y, width: selectedProgramMask.width, height: selectedProgramMask.height, mode: "move"};
              }}
              onPointerMove={(event) => {
                const dragState = maskDragRef.current;
                if (!dragState || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const dx = event.clientX - dragState.clientX;
                const dy = event.clientY - dragState.clientY;
                if (dragState.mode === "resize") {
                  const signX = dragState.corner?.includes("e") ? 1 : -1;
                  const signY = dragState.corner?.includes("s") ? 1 : -1;
                  event.currentTarget.style.width = `calc(${dragState.width}% + ${dx * signX}px)`;
                  event.currentTarget.style.height = `calc(${dragState.height}% + ${dy * signY}px)`;
                  event.currentTarget.style.transform = `translate(calc(-50% + ${dx / 2}px),calc(-50% + ${dy / 2}px)) rotate(${selectedProgramMask.rotation}deg)`;
                } else event.currentTarget.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${selectedProgramMask.rotation}deg)`;
              }}
              onPointerUp={(event) => {
                const dragState = maskDragRef.current;
                maskDragRef.current = null;
                if (!dragState) return;
                const stage = event.currentTarget.parentElement?.getBoundingClientRect();
                if (!stage) return;
                const dx = event.clientX - dragState.clientX;
                const dy = event.clientY - dragState.clientY;
                const signX = dragState.corner?.includes("e") ? 1 : -1;
                const signY = dragState.corner?.includes("s") ? 1 : -1;
                const updates = dragState.mode === "resize"
                  ? {x: clamp(dragState.x + (dx / stage.width) * 50, -200, 300), y: clamp(dragState.y + (dy / stage.height) * 50, -200, 300), width: clamp(dragState.width + (dx / stage.width) * signX * 100, .1, 400), height: clamp(dragState.height + (dy / stage.height) * signY * 100, .1, 400)}
                  : {x: clamp(dragState.x + (dx / stage.width) * 100, -200, 300), y: clamp(dragState.y + (dy / stage.height) * 100, -200, 300)};
                updateSelectedMasks((selectedClip?.effectMasks ?? []).map((mask) => mask.id === dragState.maskId ? {...mask, ...updates} : mask), dragState.mode === "resize" ? "Resized effect mask" : "Moved effect mask");
              }}
              title={`Drag ${selectedProgramMask.name}`}
            ><b>{selectedProgramMask.name}</b>{(["nw", "ne", "sw", "se"] as const).map((corner) => <i key={corner} className={corner} onPointerDown={(event) => {event.stopPropagation(); event.currentTarget.parentElement?.setPointerCapture(event.pointerId); maskDragRef.current = {maskId: selectedProgramMask.id, clientX: event.clientX, clientY: event.clientY, x: selectedProgramMask.x, y: selectedProgramMask.y, width: selectedProgramMask.width, height: selectedProgramMask.height, mode: "resize", corner};}} />)}</div> : null}
          </div>
          {monitorMode === "source" && selectedMedia && sourceRange ? <div className="source-transport">
            <div className="source-range-bar">
              <div className="source-range-selection" style={{left: `${(sourceRange.inFrame / selectedMedia.duration) * 100}%`, width: `${((sourceRange.outFrame - sourceRange.inFrame) / selectedMedia.duration) * 100}%`}} />
              <input aria-label="Source playhead" type="range" min={0} max={Math.max(1, selectedMedia.duration - 1)} value={sourceFrame} onChange={(event) => seekSource(Number(event.target.value))} />
            </div>
            <div className="source-controls">
              <span className="timecode primary">{formatTimecode(sourceFrame, project.fps)}</span>
              <button onClick={() => setSourcePoint("inFrame")} title="Mark In (I)">Mark In <kbd>I</kbd></button>
              <button onClick={() => seekSource(sourceFrame - 1)}><ChevronRight className="flip" size={15} /></button>
              <button className={shuttleRate < 0 ? "shuttle active" : "shuttle"} onClick={() => changeShuttleRate(-1)} title="Play backward (J)">J</button>
              <button className="play-button" onClick={() => {if (selectedMedia.kind === "image") return; if (sourceMediaRef.current?.paused) void sourceMediaRef.current.play(); else sourceMediaRef.current?.pause();}}>{sourcePlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
              <button className={shuttleRate === 0 ? "shuttle stop" : "shuttle"} onClick={() => changeShuttleRate(0)} title="Stop shuttle (K)">K</button>
              <button className={shuttleRate > 0 ? "shuttle active" : "shuttle"} onClick={() => changeShuttleRate(1)} title="Play forward (L)">L</button>
              <button onClick={() => seekSource(sourceFrame + 1)}><ChevronRight size={15} /></button>
              <button onClick={() => setSourcePoint("outFrame")} title="Mark Out (O)">Mark Out <kbd>O</kbd></button>
              <button className="source-edit insert" onClick={() => performThreePointEdit("insert")} title="Insert edit (,)">Insert <kbd>,</kbd></button>
              <button className="source-edit overwrite" onClick={() => performThreePointEdit("overwrite")} title="Overwrite edit (.)">Overwrite <kbd>.</kbd></button>
              <span className="source-range-time">{formatTimecode(sourceRange.outFrame - sourceRange.inFrame, project.fps)}</span>
            </div>
          </div> : <div className="transport">
            <div className="timecode primary">{formatTimecode(frame, project.fps)}</div>
            <div className="transport-controls">
              <button onClick={() => seek(frame - project.fps)} title="Previous second"><StepBack size={16} /></button>
              <button onClick={() => seek(frame - 1)} title="Previous frame"><ChevronRight className="flip" size={17} /></button>
              <button className={shuttleRate < 0 ? "shuttle active" : "shuttle"} onClick={() => changeShuttleRate(-1)} title="Play backward (J)">J</button>
              <button className="play-button" onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"} title="Play or pause (Space)">{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
              <button className={shuttleRate === 0 ? "shuttle stop" : "shuttle"} onClick={() => changeShuttleRate(0)} title="Stop shuttle (K)">K</button>
              <button className={shuttleRate > 0 ? "shuttle active" : "shuttle"} onClick={() => changeShuttleRate(1)} title="Play forward (L)">L</button>
              <button onClick={() => seek(frame + 1)} title="Next frame"><ChevronRight size={17} /></button>
              <button onClick={() => seek(frame + project.fps)} title="Next second"><StepForward size={16} /></button>
              {shuttleRate !== 0 && <span className="shuttle-rate">{shuttleRate > 0 ? "▶" : "◀"} {Math.abs(shuttleRate)}×</span>}
            </div>
            <div className="transport-range-controls" role="group" aria-label="Timeline range editing">
              <button className={timelineRange ? "marked" : ""} onClick={() => setTimelinePoint("inFrame")} title="Mark timeline In (I)">In</button>
              <button className={timelineRange ? "marked" : ""} onClick={() => setTimelinePoint("outFrame")} title="Mark timeline Out (O)">Out</button>
              <button disabled={!timelineRange} onClick={() => performRangeEdit("lift")} title="Lift marked range and leave a gap (;)">Lift</button>
              <button disabled={!timelineRange} onClick={() => performRangeEdit("extract")} title="Extract marked range and close the gap (')">Extract</button>
              <button disabled={!timelineRange} onClick={() => setTimelineRange(null)} title="Clear timeline In and Out">×</button>
              <span className="timecode">{formatTimecode(project.durationInFrames, project.fps)}</span>
            </div>
          </div>}
        </section>

        <aside className="inspector-panel panel">
          <div className="panel-heading"><span>Inspector</span><button><Menu size={15} /></button></div>
          {selectedTransition ? (
            <div className="inspector-content transition-inspector">
              <div className="selected-summary"><span className="transition-summary-icon"><Layers3 size={15} /></span><div><strong>{TRANSITION_NAMES[selectedTransition.type]}</strong><small>{selectedTransitionFrom?.name} → {selectedTransitionTo?.name}</small></div></div>
              <InspectorSection title="Transition" icon={<Layers3 size={14} />}>
                <label className="transition-property"><span>Type</span><select value={selectedTransition.type} onChange={(event) => updateSelectedTransition({type: event.target.value as TransitionType})}>{(Object.entries(TRANSITION_NAMES) as Array<[TransitionType, string]>).map(([type, name]) => <option value={type} key={type}>{name}</option>)}</select></label>
                <label className="transition-property"><span>Duration</span><div><input type="number" min={2} max={Math.min(selectedTransitionFrom?.duration ?? 2, selectedTransitionTo?.duration ?? 2)} value={selectedTransition.duration} onChange={(event) => updateSelectedTransition({duration: Number(event.target.value)})} /><i>frames</i></div></label>
                <div className="transition-duration-readout">{formatTimecode(selectedTransition.duration, project.fps)} centered on the edit</div>
                <button className="delete-transition" onClick={deleteSelectedTransition}><Trash2 size={13} /> Remove transition</button>
              </InspectorSection>
            </div>
          ) : selectedClip ? (
            <div className="inspector-content">
              <div className="selected-summary"><span style={{background: selectedClip.color}}>{clipIcon(selectedClip.kind, 15)}</span><div><strong>{selectedClipIds.length > 1 ? `${selectedClipIds.length} clips selected` : selectedClip.name}</strong><small>{selectedClip.kind} · {formatTimecode(selectedClip.duration, project.fps)}{selectedClip.linkedGroupId ? " · linked" : ""}</small></div></div>
              {(selectedClip.kind === "title" || selectedClip.kind === "caption") && (
                <InspectorSection title={selectedClip.kind === "caption" ? "Caption" : "Title"} icon={selectedClip.kind === "caption" ? <Captions size={14} /> : <Type size={14} />}>
                  <label className="text-copy-property"><span>Text</span><textarea aria-label="Text content" rows={3} value={selectedClip.text ?? ""} onChange={(event) => updateSelectedText({text: event.target.value})} /></label>
                  <div className="typography-grid">
                    <label><span>Font</span><select aria-label="Font family" value={selectedTextStyle.fontFamily} onChange={(event) => updateSelectedText({textStyle: {fontFamily: event.target.value}})}><option value="Inter, Arial, sans-serif">Inter</option><option value="'Space Grotesk', Arial, sans-serif">Space Grotesk</option><option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option><option value="'Courier New', monospace">Courier New</option></select></label>
                    <label><span>Weight</span><select aria-label="Font weight" value={selectedTextStyle.fontWeight} onChange={(event) => updateSelectedText({textStyle: {fontWeight: Number(event.target.value)}})}><option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>Semibold</option><option value={700}>Bold</option><option value={800}>Extra bold</option><option value={900}>Black</option></select></label>
                    <SimpleProperty label="Size" value={selectedTextStyle.fontSize} suffix="px" onChange={(value) => updateSelectedText({textStyle: {fontSize: clamp(value, 8, 300)}})} />
                    <SimpleProperty label="Tracking" value={selectedTextStyle.letterSpacing} suffix="px" onChange={(value) => updateSelectedText({textStyle: {letterSpacing: clamp(value, -10, 60)}})} />
                    <SimpleProperty label="Line height" value={selectedTextStyle.lineHeight * 100} suffix="%" onChange={(value) => updateSelectedText({textStyle: {lineHeight: clamp(value / 100, 0.7, 3)}})} />
                    <SimpleProperty label="Outline" value={selectedTextStyle.strokeWidth} suffix="px" onChange={(value) => updateSelectedText({textStyle: {strokeWidth: clamp(value, 0, 12)}})} />
                  </div>
                  <div className="text-align-controls" aria-label="Text alignment">
                    <button className={selectedTextStyle.textAlign === "left" ? "active" : ""} onClick={() => updateSelectedText({textStyle: {textAlign: "left"}})} title="Align left"><AlignLeft size={14} /></button>
                    <button className={selectedTextStyle.textAlign === "center" ? "active" : ""} onClick={() => updateSelectedText({textStyle: {textAlign: "center"}})} title="Align center"><AlignCenter size={14} /></button>
                    <button className={selectedTextStyle.textAlign === "right" ? "active" : ""} onClick={() => updateSelectedText({textStyle: {textAlign: "right"}})} title="Align right"><AlignRight size={14} /></button>
                  </div>
                  <div className="text-color-grid">
                    <label><span>Text</span><input aria-label="Text color" type="color" value={selectedTextStyle.color} onChange={(event) => updateSelectedText({textStyle: {color: event.target.value}})} /><b>{selectedTextStyle.color}</b></label>
                    <label><span>Background</span><input aria-label="Background color" type="color" value={selectedTextStyle.backgroundColor} onChange={(event) => updateSelectedText({textStyle: {backgroundColor: event.target.value}})} /><b>{selectedTextStyle.backgroundColor}</b></label>
                    <label><span>Outline</span><input aria-label="Outline color" type="color" value={selectedTextStyle.strokeColor} onChange={(event) => updateSelectedText({textStyle: {strokeColor: event.target.value}})} /><b>{selectedTextStyle.strokeColor}</b></label>
                  </div>
                  <label className="plain-slider-property"><span>Background opacity <b>{Math.round(selectedTextStyle.backgroundOpacity)}%</b></span><input aria-label="Background opacity" type="range" min={0} max={100} value={selectedTextStyle.backgroundOpacity} onChange={(event) => updateSelectedText({textStyle: {backgroundOpacity: Number(event.target.value)}})} /></label>
                </InspectorSection>
              )}
              <div className="animation-strip">
                <Diamond size={11} />
                <span><strong>Animation</strong><small>{selectedClip.keyframes?.length ? `${selectedClip.keyframes.length} ${selectedClip.keyframes.length === 1 ? "keyframe" : "keyframes"}` : "Use diamonds to animate"}</small></span>
                <button onClick={() => seekAdjacentKeyframe(-1)} title="Previous keyframe"><ChevronLeft size={13} /></button>
                <button onClick={() => seekAdjacentKeyframe(1)} title="Next keyframe"><ChevronRight size={13} /></button>
              </div>
              {(selectedClip.kind === "audio" || selectedClip.kind === "video") && (
                <InspectorSection title="Speed / Duration" icon={<Gauge size={14} />}>
                  <div className="clip-speed-summary">
                    <span><small>Speed</small><strong>{Math.round(getClipPlaybackRate(selectedClip) * 1000) / 10}%</strong></span>
                    <span><small>Duration</small><strong>{formatTimecode(selectedClip.duration, project.fps)}</strong></span>
                  </div>
                  <button className="open-speed-dialog" onClick={() => openSpeedDialog(selectedClip.id)}><Gauge size={13} /> Speed / Duration… <kbd>⌘R</kbd></button>
                </InspectorSection>
              )}
              {(selectedClip.kind === "audio" || selectedClip.kind === "video") && (
                <InspectorSection title="Audio" icon={<AudioWaveform size={14} />}>
                  <Slider label="Clip gain" value={linearToDb(propertyValue("audio", "volume"))} min={-60} max={12} step={0.5} suffix=" dB" keyframe={keyframeState("audio", "volume")} onToggleKeyframe={() => togglePropertyKeyframe("audio", "volume")} onChange={(value) => updateSelected("audio", "volume", dbToLinear(value))} />
                  <div className="property-grid audio-properties">
                    <SimpleProperty label="Fade in" value={selectedClip.fadeIn} suffix="fr" onChange={(value) => updateClipAudio("fadeIn", value)} />
                    <SimpleProperty label="Fade out" value={selectedClip.fadeOut} suffix="fr" onChange={(value) => updateClipAudio("fadeOut", value)} />
                  </div>
                  <button className={`clip-audio-mute ${selectedClip.audioMuted ? "active" : ""}`} onClick={() => updateClipAudio("audioMuted", !selectedClip.audioMuted)}>{selectedClip.audioMuted ? <VolumeX size={13} /> : <Volume2 size={13} />} {selectedClip.audioMuted ? "Unmute clip" : "Mute clip"}</button>
                </InspectorSection>
              )}
              {selectedClip.kind !== "audio" && <>
              <InspectorSection title="Transform" icon={<Maximize2 size={14} />}>
                <div className="property-grid">
                  <Property label="Position X" value={propertyValue("transform", "x")} keyframe={keyframeState("transform", "x")} onToggleKeyframe={() => togglePropertyKeyframe("transform", "x")} onChange={(value) => updateSelected("transform", "x", value)} />
                  <Property label="Position Y" value={propertyValue("transform", "y")} keyframe={keyframeState("transform", "y")} onToggleKeyframe={() => togglePropertyKeyframe("transform", "y")} onChange={(value) => updateSelected("transform", "y", value)} />
                  <Property label="Scale" value={propertyValue("transform", "scale")} suffix="%" keyframe={keyframeState("transform", "scale")} onToggleKeyframe={() => togglePropertyKeyframe("transform", "scale")} onChange={(value) => updateSelected("transform", "scale", value)} />
                  <Property label="Rotation" value={propertyValue("transform", "rotation")} suffix="°" keyframe={keyframeState("transform", "rotation")} onToggleKeyframe={() => togglePropertyKeyframe("transform", "rotation")} onChange={(value) => updateSelected("transform", "rotation", value)} />
                  <Property label="Opacity" value={propertyValue("transform", "opacity")} suffix="%" keyframe={keyframeState("transform", "opacity")} onToggleKeyframe={() => togglePropertyKeyframe("transform", "opacity")} onChange={(value) => updateSelected("transform", "opacity", value)} />
                </div>
              </InspectorSection>
              <InspectorSection title="Color" icon={<SlidersHorizontal size={14} />}>
                <Slider label="Temperature" value={propertyValue("effects", "temperature")} min={-100} max={100} keyframe={keyframeState("effects", "temperature")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "temperature")} onChange={(value) => updateSelected("effects", "temperature", value)} />
                <Slider label="Tint" value={propertyValue("effects", "tint")} min={-100} max={100} keyframe={keyframeState("effects", "tint")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "tint")} onChange={(value) => updateSelected("effects", "tint", value)} />
                <Slider label="Exposure" value={propertyValue("effects", "exposure")} min={-3} max={3} step={0.05} keyframe={keyframeState("effects", "exposure")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "exposure")} onChange={(value) => updateSelected("effects", "exposure", value)} />
                <Slider label="Brightness" value={propertyValue("effects", "brightness")} min={0} max={200} keyframe={keyframeState("effects", "brightness")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "brightness")} onChange={(value) => updateSelected("effects", "brightness", value)} />
                <Slider label="Contrast" value={propertyValue("effects", "contrast")} min={0} max={200} keyframe={keyframeState("effects", "contrast")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "contrast")} onChange={(value) => updateSelected("effects", "contrast", value)} />
                <Slider label="Saturation" value={propertyValue("effects", "saturation")} min={0} max={200} keyframe={keyframeState("effects", "saturation")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "saturation")} onChange={(value) => updateSelected("effects", "saturation", value)} />
                <Slider label="Vibrance" value={propertyValue("effects", "vibrance")} min={-100} max={100} keyframe={keyframeState("effects", "vibrance")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "vibrance")} onChange={(value) => updateSelected("effects", "vibrance", value)} />
              </InspectorSection>
              <InspectorSection title="Effects" icon={<Sparkles size={14} />}>
                <Slider label="Gaussian blur" value={propertyValue("effects", "blur")} min={0} max={24} keyframe={keyframeState("effects", "blur")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "blur")} onChange={(value) => updateSelected("effects", "blur", value)} />
                <Slider label="Vignette" value={propertyValue("effects", "vignette")} min={0} max={100} keyframe={keyframeState("effects", "vignette")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "vignette")} onChange={(value) => updateSelected("effects", "vignette", value)} />
                <Slider label="Film grain" value={propertyValue("effects", "grain")} min={0} max={100} keyframe={keyframeState("effects", "grain")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "grain")} onChange={(value) => updateSelected("effects", "grain", value)} />
                <Slider label="Glow" value={propertyValue("effects", "glow")} min={0} max={100} keyframe={keyframeState("effects", "glow")} onToggleKeyframe={() => togglePropertyKeyframe("effects", "glow")} onChange={(value) => updateSelected("effects", "glow", value)} />
                <button className="add-effect" onClick={() => setActiveLeftTab("effects")}><Plus size={14} /> Add effect</button>
              </InspectorSection>
              </>}
            </div>
          ) : <div className="empty-inspector"><MousePointer2 size={28} /><span>Select a clip</span><small>Adjust motion, color, opacity and effects.</small></div>}
        </aside>

        <section className={`timeline-panel panel tool-${activeTool}`} onPointerDown={() => contextMenu && setContextMenu(null)}>
          <div className="timeline-toolbar">
            <div className="tool-group">
              <button className={activeTool === "select" ? "active" : ""} onClick={() => setActiveTool("select")} title="Selection and marquee tool (V)"><MousePointer2 size={15} /></button>
              <button className={activeTool === "razor" ? "active" : ""} onClick={() => setActiveTool("razor")} title="Razor tool (C)"><Scissors size={15} /></button>
              <button className={activeTool === "ripple" ? "active" : ""} onClick={() => setActiveTool("ripple")} title="Ripple edit tool (B)"><span className="tool-letter">R</span></button>
              <button className={activeTool === "roll" ? "active" : ""} onClick={() => setActiveTool("roll")} title="Rolling edit tool (N)"><span className="tool-letter">O</span></button>
              <button className={activeTool === "slip" ? "active" : ""} onClick={() => setActiveTool("slip")} title="Slip tool (Y)"><span className="tool-letter">Y</span></button>
              <button className={activeTool === "slide" ? "active" : ""} onClick={() => setActiveTool("slide")} title="Slide tool (U)"><span className="tool-letter">U</span></button>
              <button onClick={addMarker} title="Add marker at playhead (M)"><Plus size={15} /></button>
              <button onClick={rippleDeleteSelected} title="Ripple delete selected (Shift+Delete)"><Trash2 size={15} /></button>
              <button className={snap ? "active" : ""} onClick={() => setSnap((value) => !value)} title="Snap to clips, markers, and playhead"><Magnet size={15} /></button>
              <button className={linkedSelection ? "active" : ""} onClick={() => setLinkedSelection((value) => !value)} title="Linked selection"><Link2 size={15} /></button>
              <span className="tool-divider" aria-hidden="true" />
              <div className="edit-mode-switch" role="group" aria-label="Timeline edit mode">
                <button aria-pressed={editMode === "insert"} className={editMode === "insert" ? "active" : ""} onClick={() => setEditMode("insert")} title="Insert edit: ripple targeted tracks">Insert</button>
                <button aria-pressed={editMode === "overwrite"} className={editMode === "overwrite" ? "active" : ""} onClick={() => setEditMode("overwrite")} title="Overwrite edit: replace material in range">Overwrite</button>
              </div>
            </div>
            <div className="sequence-title"><Layers3 size={14} />
              <select aria-label="Active sequence" value={project.activeSequenceId} onChange={(event) => changeSequence(event.target.value)}>{project.sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select>
              <button onClick={addSequence} title="New sequence"><Plus size={12} /> New</button>
              <button onClick={duplicateSequence} title="Duplicate active sequence"><Copy size={12} /> Duplicate</button>
              <select aria-label="Nest sequence at playhead" value="" onChange={(event) => {if (event.target.value) nestSequence(event.target.value);}}>
                <option value="">Nest…</option>
                {project.sequences.filter((sequence) => canNestSequence(project, sequence.id)).map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}
              </select>
              <span>{selectedClipIds.length ? `${selectedClipIds.length} selected` : `${project.width} × ${project.height} · ${formatFrameRate(project.fps)} fps`}</span>
            </div>
            <div className="zoom-control"><ZoomOut size={14} /><input type="range" min="0.55" max="3.4" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><ZoomIn size={14} /></div>
          </div>
          <div className="timeline-body">
            <div className="track-headers">
              <div className="track-routing-header" title="Source patch and edit targets"><span>Patch</span><span>Target</span></div>
              {project.tracks.map((track) => (
                <div className={`track-header ${track.kind} ${track.locked ? "locked" : ""}`} key={track.id}>
                  <button aria-label={`Route incoming ${track.kind} media to ${track.name}`} aria-pressed={destinationRoutes[track.kind] === track.id} className={destinationRoutes[track.kind] === track.id ? "destination-route active" : "destination-route"} onClick={() => setDestinationRoutes((current) => ({...current, [track.kind]: track.id}))} title={track.locked ? `${track.name} is locked · unlock to use as a destination` : `Route incoming ${track.kind} media to ${track.name}`}>{track.name}</button>
                  <button aria-label={`Target ${track.name} for timeline edits`} aria-pressed={targetedTrackIds.includes(track.id)} className={targetedTrackIds.includes(track.id) ? "track-target active" : "track-target"} onClick={() => setTargetedTrackIds((current) => current.includes(track.id) ? current.filter((id) => id !== track.id) : [...current, track.id])} title={`${targetedTrackIds.includes(track.id) ? "Remove" : "Add"} ${track.name} ${targetedTrackIds.includes(track.id) ? "from" : "to"} edit targets`}>T</button>
                  <button onClick={() => toggleTrack(track.id, "locked")}>{track.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
                  {track.kind !== "audio" ? <button onClick={() => toggleTrack(track.id, "hidden")}>{track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button> : <><button className={track.solo ? "track-solo active" : "track-solo"} onClick={() => toggleTrack(track.id, "solo")} title={`Solo ${track.name}`}>S</button><button onClick={() => toggleTrack(track.id, "muted")} title={`Mute ${track.name}`}>{track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button></>}
                </div>
              ))}
            </div>
            <div className="timeline-scroll" ref={timelineScrollerRef}>
              <div className="timeline-canvas" style={{width: timelineWidth}}>
                <div className="ruler" onPointerDown={beginPlayheadScrub}>
                  {virtualRulerSeconds.map((second) => (
                    <div className="ruler-mark" key={second} style={{left: second * project.fps * pixelsPerFrame}}><i /><span>{formatTimecode(second * project.fps, project.fps).slice(3, 8)}</span></div>
                  ))}
                  {project.markers.filter((marker) => frameRangeIntersects(marker.frame, 1, virtualTimelineWindow)).map((marker) => (
                    <button
                      className="timeline-marker"
                      key={marker.id}
                      style={{left: marker.frame * pixelsPerFrame, "--marker-color": marker.color} as React.CSSProperties}
                      title={`${marker.label} · double-click to remove`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => seek(marker.frame)}
                      onDoubleClick={() => commit((draft) => {draft.markers = draft.markers.filter((item) => item.id !== marker.id);}, `Removed ${marker.label}`)}
                    />
                  ))}
                </div>
                <div className="tracks">
                  {project.tracks.map((track) => (
                    <div
                      className={`track-lane ${track.kind} ${track.locked ? "locked" : ""} ${dropTarget?.trackId === track.id ? (dropTarget.allowed ? "drop-allowed" : "drop-rejected") : ""} ${dragTrackTarget === track.id ? "track-transfer-target" : ""}`}
                      key={track.id}
                      data-track-id={track.id}
                      onPointerDown={beginMarquee}
                      onDragOver={(event) => handleTrackDragOver(event, track.id)}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
                      }}
                      onDrop={(event) => void handleTrackDrop(event, track.id)}
                    >
                      {dropTarget?.trackId === track.id && (
                        <div
                          className={`drop-preview ${dropTarget.allowed ? `allowed ${editMode}` : "rejected"}`}
                          style={{left: dropTarget.frame * pixelsPerFrame, width: Math.max(60, dropTarget.duration * pixelsPerFrame)}}
                        >
                          {dropTarget.allowed ? <><Plus size={12} /><span>{editMode === "insert" ? "INSERT" : "OVERWRITE"} · {track.name}</span></> : <><Lock size={12} /><span>{track.name} unavailable</span></>}
                        </div>
                      )}
                      {(virtualClipsByTrack[track.id] ?? []).map((clip) => (
                        <div
                          key={clip.id}
                          data-clip-id={clip.id}
                          className={`timeline-clip ${clip.kind} ${selectedClipIds.includes(clip.id) ? "selected" : ""} ${clip.linkedGroupId ? "linked" : ""}`}
                          style={{left: clip.start * pixelsPerFrame, width: Math.max(18, clip.duration * pixelsPerFrame), "--clip-color": clip.color} as React.CSSProperties}
                          onPointerDown={(event) => {
                            if (track.locked) return;
                            const mode: DragMode = activeTool === "slip" ? "slip" : activeTool === "slide" ? "slide" : activeTool === "roll" ? "roll-end" : "move";
                            beginDrag(event, clip, mode);
                          }}
                          onDoubleClick={() => seek(clip.start)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setSelectedTransitionId(null);
                            if (!selectedClipIds.includes(clip.id)) setSelectedClipIds(expandLinkedIds([clip.id]));
                            setContextMenu({clipId: clip.id, x: event.clientX, y: event.clientY});
                          }}
                        >
                          <button className="trim-handle left" onPointerDown={(event) => beginDrag(event, clip, activeTool === "ripple" ? "ripple-start" : "trim-start")} />
                          <span className="clip-icon">{clipIcon(clip.kind)}</span><b>{clip.name}</b>
                          {clip.linkedGroupId && <Link2 className="linked-badge" size={10} />}
                          {Math.abs(getClipPlaybackRate(clip) - 1) > 0.001 && <span className="clip-speed-badge">{Math.round(getClipPlaybackRate(clip) * 100)}%</span>}
                          {clip.kind === "audio" && <>
                            <span className="waveform waveform-bars">{(waveforms[clip.id]?.length ? waveforms[clip.id] : [0.2, 0.48, 0.82, 0.34, 0.68, 0.92, 0.44, 0.3, 0.78, 0.62, 0.24, 0.5, 0.88, 0.58, 0.32, 0.74]).map((peak, index) => <i key={index} style={{height: `${Math.max(10, peak * 100)}%`}} />)}</span>
                            {clip.fadeIn > 0 && <span className="audio-fade-region in" style={{width: `${(clip.fadeIn / Math.max(1, clip.duration)) * 100}%`}} />}
                            {clip.fadeOut > 0 && <span className="audio-fade-region out" style={{width: `${(clip.fadeOut / Math.max(1, clip.duration)) * 100}%`}} />}
                            <button className="fade-handle in" style={{left: `${(clip.fadeIn / Math.max(1, clip.duration)) * 100}%`}} onPointerDown={(event) => beginDrag(event, clip, "fade-in")} title={`Fade in · ${clip.fadeIn} frames`} />
                            <button className="fade-handle out" style={{right: `${(clip.fadeOut / Math.max(1, clip.duration)) * 100}%`}} onPointerDown={(event) => beginDrag(event, clip, "fade-out")} title={`Fade out · ${clip.fadeOut} frames`} />
                          </>}
                          {Array.from(new Set((clip.keyframes ?? []).map((keyframe) => keyframe.frame))).map((localFrame) => {
                            const count = (clip.keyframes ?? []).filter((keyframe) => keyframe.frame === localFrame).length;
                            return (
                              <button
                                key={`keyframe-${localFrame}`}
                                className="clip-keyframe"
                                style={{left: `${(localFrame / Math.max(1, clip.duration)) * 100}%`}}
                                title={`${count} ${count === 1 ? "keyframe" : "keyframes"} · click to seek`}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  selectClip(clip.id);
                                  seek(clip.start + localFrame);
                                }}
                              />
                            );
                          })}
                          <button className="trim-handle right" onPointerDown={(event) => beginDrag(event, clip, activeTool === "roll" ? "roll-end" : activeTool === "ripple" ? "ripple-end" : "trim-end")} />
                        </div>
                      ))}
                      {(virtualTransitionsByTrack[track.id] ?? []).map((transition) => {
                        const toClip = project.clips.find((clip) => clip.id === transition.toClipId);
                        if (!toClip) return null;
                        return (
                          <button
                            key={transition.id}
                            data-transition-id={transition.id}
                            className={`timeline-transition ${selectedTransitionId === transition.id ? "selected" : ""}`}
                            style={{left: (toClip.start - transition.duration / 2) * pixelsPerFrame, width: Math.max(22, transition.duration * pixelsPerFrame)} as React.CSSProperties}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedClipIds([]);
                              setSelectedTransitionId(transition.id);
                              seek(toClip.start);
                            }}
                            title={`${TRANSITION_NAMES[transition.type]} · ${transition.duration} frames`}
                          >
                            <i /><span>{TRANSITION_NAMES[transition.type]}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {timelineRange && <div
                  className="timeline-range-overlay"
                  style={{left: timelineRange.inFrame * pixelsPerFrame, width: Math.max(2, (timelineRange.outFrame - timelineRange.inFrame) * pixelsPerFrame)}}
                  title={`Timeline range · ${formatTimecode(timelineRange.outFrame - timelineRange.inFrame, project.fps)}`}
                ><span>IN</span><span>OUT</span></div>}
                {marquee && (
                  <div className="selection-marquee" style={{left: Math.min(marquee.startX, marquee.x), top: Math.min(marquee.startY, marquee.y), width: Math.abs(marquee.x - marquee.startX), height: Math.abs(marquee.y - marquee.startY)}} />
                )}
                <div className={`playhead ${scrubbing ? "scrubbing" : ""}`} style={{left: frame * pixelsPerFrame}} onPointerDown={beginPlayheadScrub} title="Drag to scrub the playhead"><div /><span /></div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

const InspectorSection: React.FC<{title: string; icon: React.ReactNode; children: React.ReactNode}> = ({title, icon, children}) => (
  <section className="inspector-section"><header>{icon}<strong>{title}</strong><ChevronDown size={14} /></header><div>{children}</div></section>
);

type KeyframeControlState = {animated: boolean; active: boolean};

const KeyframeButton: React.FC<{state: KeyframeControlState; onClick: () => void}> = ({state, onClick}) => (
  <button
    type="button"
    className={`keyframe-button ${state.animated ? "animated" : ""} ${state.active ? "active" : ""}`}
    onClick={(event) => {event.preventDefault(); onClick();}}
    title={state.active ? "Remove keyframe at playhead" : "Add keyframe at playhead"}
  >
    <Diamond size={9} fill={state.active ? "currentColor" : "none"} />
  </button>
);

const Property: React.FC<{label: string; value: number; suffix?: string; keyframe: KeyframeControlState; onToggleKeyframe: () => void; onChange: (value: number) => void}> = ({label, value, suffix, keyframe, onToggleKeyframe, onChange}) => (
  <label className="property"><span>{label}<KeyframeButton state={keyframe} onClick={onToggleKeyframe} /></span><div><input type="number" value={Math.round(value * 10) / 10} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <i>{suffix}</i>}</div></label>
);

const SimpleProperty: React.FC<{label: string; value: number; suffix?: string; onChange: (value: number) => void}> = ({label, value, suffix, onChange}) => (
  <label className="property simple-property"><span>{label}</span><div><input type="number" min={0} value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <i>{suffix}</i>}</div></label>
);

const ColorControl: React.FC<{label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void}> = ({label, value, min, max, step = 1, suffix, onChange}) => (
  <label className="color-control">
    <span>{label}</span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <b>{Math.round(value * 100) / 100}{suffix}</b>
  </label>
);

const Slider: React.FC<{label: string; value: number; min: number; max: number; step?: number; suffix?: string; keyframe: KeyframeControlState; onToggleKeyframe: () => void; onChange: (value: number) => void}> = ({label, value, min, max, step = 1, suffix, keyframe, onToggleKeyframe, onChange}) => (
  <label className="slider-property"><span><em>{label}</em><span><b>{Math.round(value * 10) / 10}{suffix}</b><KeyframeButton state={keyframe} onClick={onToggleKeyframe} /></span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
);
