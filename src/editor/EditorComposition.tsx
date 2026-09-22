import React from "react";
import {GradedMedia} from "./GradedMedia";
import {gradeRequiresProcessing} from "./grade-texture";
import {AbsoluteFill, Html5Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from "remotion";
import {getAnimatedPropertyValue} from "./animation";
import {getClipPlaybackRate} from "./clip-speed";
import {buildEffectRenderPlan, deterministicEffectNoise, type EffectOverlay} from "./effects/render-plan";
import type {VisualEffectInstance} from "./effects/registry";
import {matteFrameAt, objectMatteCss, type ObjectMatteReference} from "./mattes/object-matte";
import type {EditorClip, EditorProject, EditorTransition, ProjectLut, MaskTarget} from "./types";
import {effectMaskImage} from "./mask-image";
import {DEFAULT_CAPTION_STYLE, DEFAULT_TITLE_STYLE} from "./types";
import {projectViewForSequence} from "./sequences";
import {resolveClipPreviewSource} from "./proxy";
import {usableRenderCache} from "./render-cache";

export type EditorCompositionProps = {
  project: EditorProject;
  useProxies?: boolean;
  useRenderCache?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const visualStyle = (clip: EditorClip, localFrame: number, processed = true, gradeFilterId?: string): React.CSSProperties => {
  const x = getAnimatedPropertyValue(clip, "transform.x", localFrame);
  const y = getAnimatedPropertyValue(clip, "transform.y", localFrame);
  const scale = getAnimatedPropertyValue(clip, "transform.scale", localFrame);
  const rotation = getAnimatedPropertyValue(clip, "transform.rotation", localFrame);
  const opacity = getAnimatedPropertyValue(clip, "transform.opacity", localFrame);
  const effectsEnabled = processed && clip.effects.enabled;
  const colorEnabled = effectsEnabled && clip.effects.colorEnabled;
  const brightness = colorEnabled ? getAnimatedPropertyValue(clip, "effects.brightness", localFrame) : 100;
  const exposure = colorEnabled ? getAnimatedPropertyValue(clip, "effects.exposure", localFrame) : 0;
  const highlights = colorEnabled ? getAnimatedPropertyValue(clip, "effects.highlights", localFrame) : 0;
  const shadows = colorEnabled ? getAnimatedPropertyValue(clip, "effects.shadows", localFrame) : 0;
  const whites = colorEnabled ? getAnimatedPropertyValue(clip, "effects.whites", localFrame) : 0;
  const blacks = colorEnabled ? getAnimatedPropertyValue(clip, "effects.blacks", localFrame) : 0;
  const fade = colorEnabled ? getAnimatedPropertyValue(clip, "effects.fade", localFrame) : 0;
  const sharpen = colorEnabled ? getAnimatedPropertyValue(clip, "effects.sharpen", localFrame) : 0;
  const contrast = colorEnabled ? getAnimatedPropertyValue(clip, "effects.contrast", localFrame) : 100;
  const saturation = colorEnabled ? getAnimatedPropertyValue(clip, "effects.saturation", localFrame) : 100;
  const vibrance = colorEnabled ? getAnimatedPropertyValue(clip, "effects.vibrance", localFrame) : 0;
  const hue = colorEnabled ? getAnimatedPropertyValue(clip, "effects.hue", localFrame) : 0;
  const maskedMediaBlur = (clip.kind === "video" || clip.kind === "image") && hasTargetMask(clip, "blur");
  const blur = effectsEnabled && clip.effects.blurEnabled && !maskedMediaBlur ? getAnimatedPropertyValue(clip, "effects.blur", localFrame) : 0;
  const glow = effectsEnabled && clip.effects.glowEnabled && !hasTargetMask(clip, "glow") ? getAnimatedPropertyValue(clip, "effects.glow", localFrame) : 0;
  const tonalBrightness = clamp(brightness * (2 ** exposure) * (1 + (highlights * .35 + shadows * .22 + whites * .42 + blacks * .18) / 400), 1, 500);
  const tonalContrast = clamp((contrast + sharpen * .16 + whites * .1 - blacks * .12) * (1 - fade * .0042), 0, 300);
  const tonalSaturation = clamp(saturation * (1 + vibrance / 170), 0, 300);
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    opacity: opacity / 100,
    transform: `translate(${x}px, ${y}px) scale(${scale / 100}) rotate(${rotation}deg)`,
    filter: `${gradeFilterId ? `url(#${gradeFilterId}) ` : ""}brightness(${tonalBrightness}%) contrast(${tonalContrast}%) saturate(${tonalSaturation}%) hue-rotate(${hue}deg) blur(${blur}px)${glow > 0 ? ` drop-shadow(0 0 ${glow * .22}px rgba(255,255,255,${glow / 260}))` : ""}`,
  };
};

export const hasTargetMask = (clip: EditorClip, target: MaskTarget) => Boolean(clip.effects.enabled && clip.effectMasks?.some((mask) => mask.enabled && mask.target === target));
export const effectMaskStyle = (clip: EditorClip, localFrame: number, target: MaskTarget = "color"): React.CSSProperties => {
  if (!clip.effects.enabled) return {};
  const masks = (clip.effectMasks ?? []).filter((mask) => mask.enabled && mask.target === target);
  if (masks.length) {
    return {
      WebkitMaskImage: masks.map((mask) => effectMaskImage(mask, localFrame)).join(", "),
      maskImage: masks.map((mask) => effectMaskImage(mask, localFrame)).join(", "),
      WebkitMaskComposite: masks.slice(1).map((mask) => mask.combineMode === "subtract" ? "destination-out" : mask.combineMode === "intersect" ? "source-in" : "source-over").join(", ") as React.CSSProperties["WebkitMaskComposite"],
      maskComposite: masks.slice(1).map((mask) => mask.combineMode).join(", ") as React.CSSProperties["maskComposite"],
    };
  }
  if (target !== "color" || !clip.effects.maskEnabled) return {};
  const featherStart = clamp(100 - clip.effects.maskFeather, 0, 100);
  const gradient = clip.effects.maskInverted
    ? `radial-gradient(ellipse ${clip.effects.maskSize}% ${clip.effects.maskSize}% at ${clip.effects.maskX}% ${clip.effects.maskY}%, transparent 0%, transparent ${featherStart}%, black 100%)`
    : `radial-gradient(ellipse ${clip.effects.maskSize}% ${clip.effects.maskSize}% at ${clip.effects.maskX}% ${clip.effects.maskY}%, black 0%, black ${featherStart}%, transparent 100%)`;
  return {WebkitMaskImage: gradient, maskImage: gradient};
};

const TreatmentOverlays: React.FC<{clip: EditorClip; localFrame: number; mode?: "color" | "finishing" | "all"}> = ({clip, localFrame, mode = "all"}) => {
  if (!clip.effects.enabled) return null;
  const colorEnabled = clip.effects.colorEnabled && mode !== "finishing";
  const temperature = colorEnabled ? getAnimatedPropertyValue(clip, "effects.temperature", localFrame) : 0;
  const tint = colorEnabled ? getAnimatedPropertyValue(clip, "effects.tint", localFrame) : 0;
  const vignette = clip.effects.vignetteEnabled && mode !== "color" ? getAnimatedPropertyValue(clip, "effects.vignette", localFrame) : 0;
  const grain = clip.effects.grainEnabled && mode !== "color" ? getAnimatedPropertyValue(clip, "effects.grain", localFrame) : 0;
  const glow = clip.effects.glowEnabled && mode !== "color" ? getAnimatedPropertyValue(clip, "effects.glow", localFrame) : 0;
  return <>
    {temperature !== 0 && <AbsoluteFill style={{...effectMaskStyle(clip, localFrame, "color"), backgroundColor: temperature > 0 ? "#ff8a3d" : "#327bff", opacity: Math.abs(temperature) / 430, mixBlendMode: "soft-light"}} />}
    {tint !== 0 && <AbsoluteFill style={{...effectMaskStyle(clip, localFrame, "color"), backgroundColor: tint > 0 ? "#e54bca" : "#49c985", opacity: Math.abs(tint) / 520, mixBlendMode: "soft-light"}} />}
    {glow > 0 && <AbsoluteFill data-effect-target="glow" style={{...effectMaskStyle(clip, localFrame, "glow"), background: "radial-gradient(circle at 50% 45%, rgba(255,255,255,.6), rgba(255,255,255,.12) 34%, transparent 70%)", opacity: glow / 300, mixBlendMode: "screen"}} />}
    {vignette > 0 && <AbsoluteFill data-effect-target="vignette" style={{...effectMaskStyle(clip, localFrame, "vignette"), background: "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,.18) 62%, rgba(0,0,0,.92) 100%)", opacity: vignette / 100, mixBlendMode: "multiply"}} />}
    {grain > 0 && <AbsoluteFill data-effect-target="grain" style={{...effectMaskStyle(clip, localFrame, "grain"), mixBlendMode: "overlay", opacity: grain / 145}}>{Array.from({length: 84}, (_, index) => {
      const x = (index * 47 + localFrame * 13) % 100;
      const y = (index * 71 + localFrame * 19) % 100;
      const size = 2 + ((index * 11 + localFrame) % 7);
      return <i key={index} style={{position: "absolute", left: `${x}%`, top: `${y}%`, width: size, height: size, borderRadius: "50%", backgroundColor: index % 2 ? "rgba(255,255,255,.75)" : "rgba(0,0,0,.75)"}} />;
    })}</AbsoluteFill>}
  </>;
};

const clipAudioVolume = (clip: EditorClip, localFrame: number) => {
  if (clip.audioMuted || localFrame < 0 || localFrame >= clip.duration) return 0;
  const gain = getAnimatedPropertyValue(clip, "audio.volume", localFrame);
  const fadeIn = clip.fadeIn > 0 && localFrame < clip.fadeIn ? Math.sin((Math.max(0, localFrame) / clip.fadeIn) * Math.PI / 2) : 1;
  const framesFromEnd = clip.duration - localFrame;
  const fadeOut = clip.fadeOut > 0 && framesFromEnd < clip.fadeOut ? Math.sin((Math.max(0, framesFromEnd) / clip.fadeOut) * Math.PI / 2) : 1;
  return Math.max(0, gain * fadeIn * fadeOut);
};

const transitionProgress = (clip: EditorClip, transition: EditorTransition, role: "incoming" | "outgoing", localFrame: number) => {
  const beforeCut = Math.floor(transition.duration / 2);
  const start = role === "incoming" ? -beforeCut : clip.duration - beforeCut;
  return Math.max(0, Math.min(1, (localFrame - start) / Math.max(1, transition.duration)));
};

const transitionStyle = (clip: EditorClip, transition: EditorTransition | undefined, role: "incoming" | "outgoing", localFrame: number): React.CSSProperties => {
  if (!transition) return {};
  const progress = transitionProgress(clip, transition, role, localFrame);
  if (transition.type === "cross-dissolve") return {opacity: role === "incoming" ? progress : 1 - progress};
  if (transition.type === "dip-to-black") return {opacity: role === "incoming" ? Math.max(0, (progress - 0.5) * 2) : Math.max(0, 1 - progress * 2)};
  if (transition.type === "wipe-left") return role === "incoming" ? {clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`} : {};
  if (transition.type === "slide-left") return {transform: role === "incoming" ? `translateX(${(1 - progress) * 100}%)` : `translateX(${-progress * 22}%)`};
  return {};
};

const hexToRgba = (hex: string, opacity: number) => {
  const normalized = hex.replace("#", "");
  const expanded = normalized.length === 3 ? normalized.split("").map((value) => value + value).join("") : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(expanded, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${Math.max(0, Math.min(100, opacity)) / 100})`;
};

const resolveMediaSource = (source: string) => /^(?:https?:|blob:|data:)/.test(source)
  ? source
  : staticFile(source.replace(/^\//, ""));

type RenderableEditorClip = EditorClip & {
  visualEffects?: VisualEffectInstance[];
  objectMattes?: ObjectMatteReference[];
};

const combineEffectStyle = (style: React.CSSProperties, clip: RenderableEditorClip, localFrame: number) => {
  const plan = buildEffectRenderPlan(clip.visualEffects, localFrame);
  return {
    plan,
    style: {
      ...style,
      filter: [style.filter, plan.filter].filter(Boolean).join(" "),
      transform: [style.transform, plan.transform].filter(Boolean).join(" "),
      imageRendering: plan.imageRendering,
      clipPath: plan.clipPath,
    } satisfies React.CSSProperties,
  };
};

const EffectOverlayLayer: React.FC<{overlay: EffectOverlay; localFrame: number; renderMedia: (style: React.CSSProperties, withAudio: boolean) => React.ReactNode}> = ({overlay, localFrame, renderMedia}) => {
  const p = overlay.parameters;
  const n = (key: string) => Number(p[key] ?? 0);
  const s = (key: string) => String(p[key] ?? "");
  if (overlay.kind === "tint") return <AbsoluteFill style={{backgroundColor: s("color"), opacity: n("amount"), mixBlendMode: "color"}} />;
  if (overlay.kind === "duotone") return <AbsoluteFill style={{background: `linear-gradient(135deg, ${s("shadow")}, ${s("highlight")})`, opacity: n("amount"), mixBlendMode: "color"}} />;
  if (overlay.kind === "progressive-blur") {
    const direction = s("direction");
    const gradient = direction === "top" ? "to top" : direction === "right" ? "to right" : direction === "left" ? "to left" : "to bottom";
    return <AbsoluteFill style={{WebkitMaskImage: `linear-gradient(${gradient}, transparent, black)`, maskImage: `linear-gradient(${gradient}, transparent, black)`}}>{renderMedia({position: "absolute", inset: 0, width: "100%", height: "100%", filter: `blur(${n("radius")}px)`, transform: "scale(1.04)"}, false)}</AbsoluteFill>;
  }
  if (overlay.kind === "zoom-blur") return <AbsoluteFill style={{transformOrigin: `${n("centerX") * 100}% ${n("centerY") * 100}%`, opacity: Math.min(.7, n("amount"))}}>{[1.01, 1.025, 1.045].map((scale, index) => <React.Fragment key={scale}>{renderMedia({position: "absolute", inset: 0, width: "100%", height: "100%", transform: `scale(${scale})`, opacity: n("amount") / (index + 2), mixBlendMode: "screen"}, false)}</React.Fragment>)}</AbsoluteFill>;
  if (overlay.kind === "halftone") {
    const size = Math.max(2, n("size"));
    return <AbsoluteFill style={{backgroundImage: "radial-gradient(circle, rgba(0,0,0,.75) 0 28%, transparent 31%)", backgroundSize: `${size}px ${size}px`, transform: `rotate(${n("angle")}deg) scale(1.5)`, opacity: .34, mixBlendMode: "overlay"}} />;
  }
  if (overlay.kind === "scanlines") return <AbsoluteFill style={{backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,${n("opacity")}) 0 1px, transparent 1px ${Math.max(2, n("spacing"))}px)`, mixBlendMode: "multiply"}} />;
  if (overlay.kind === "chromatic") {
    const amount = n("amount");
    return <AbsoluteFill style={{opacity: .42, mixBlendMode: "screen"}}>{renderMedia({position: "absolute", inset: 0, width: "100%", height: "100%", transform: `translateX(${-amount}px)`, filter: "sepia(1) saturate(8) hue-rotate(300deg)"}, false)}{renderMedia({position: "absolute", inset: 0, width: "100%", height: "100%", transform: `translateX(${amount}px)`, filter: "sepia(1) saturate(8) hue-rotate(140deg)"}, false)}</AbsoluteFill>;
  }
  if (overlay.kind === "noise") {
    const amount = n("amount");
    const seed = n("seed");
    return <AbsoluteFill style={{opacity: amount, mixBlendMode: "overlay"}}>{Array.from({length: 96}, (_, index) => <i key={index} style={{position: "absolute", left: `${deterministicEffectNoise(seed, localFrame, index) * 100}%`, top: `${deterministicEffectNoise(seed, localFrame, index + 101) * 100}%`, width: 2 + deterministicEffectNoise(seed, localFrame, index + 202) * 5, height: 2 + deterministicEffectNoise(seed, localFrame, index + 202) * 5, backgroundColor: p.monochrome === false ? `hsl(${deterministicEffectNoise(seed, localFrame, index + 303) * 360} 80% 60%)` : index % 2 ? "white" : "black"}} />)}</AbsoluteFill>;
  }
  if (overlay.kind === "paper") return <AbsoluteFill style={{backgroundImage: "repeating-radial-gradient(ellipse at 30% 20%, rgba(112,82,44,.18) 0 1px, transparent 1px 4px)", backgroundSize: `${8 + deterministicEffectNoise(n("seed"), localFrame, 1) * 5}px ${7 + deterministicEffectNoise(n("seed"), localFrame, 2) * 4}px`, opacity: n("amount"), mixBlendMode: "multiply"}} />;
  if (overlay.kind === "light-leak") {
    const phase = (n("progress") + localFrame / 180 + deterministicEffectNoise(n("seed"), 0, 1)) % 1;
    return <AbsoluteFill style={{background: `radial-gradient(circle at ${phase * 120 - 10}% ${30 + phase * 40}%, rgba(255,245,174,.92), rgba(255,74,36,.55) 24%, transparent 62%)`, opacity: n("opacity"), mixBlendMode: "screen"}} />;
  }
  return null;
};

const EffectFailureBadge: React.FC<{errors: string[]}> = ({errors}) => errors.length ? <div style={{position: "absolute", zIndex: 50, left: 22, top: 22, maxWidth: "72%", padding: "10px 14px", border: "2px solid #ff4f76", borderRadius: 6, background: "rgba(38,3,13,.92)", color: "#ffd5df", font: "700 16px Inter, Arial, sans-serif", boxShadow: "0 8px 28px rgba(0,0,0,.48)"}}>EFFECT RENDER ERROR · {errors.join(" · ")}</div> : null;

const VisualClip: React.FC<{clip: EditorClip; luts: ProjectLut[]; frameOffset: number; audioMultiplier: number; previewSrc?: string; offline?: boolean; mediaName?: string; incoming?: EditorTransition; outgoing?: EditorTransition}> = ({clip, luts, frameOffset, audioMultiplier, previewSrc, offline, mediaName, incoming, outgoing}) => {
  const renderableClip = clip as RenderableEditorClip;
  const localFrame = useCurrentFrame() + frameOffset;
  const gradeFilterId: string | undefined = undefined; // Curves now belong to the GPU grade, not a second SVG pass.
  const legacyStyle = visualStyle(clip, localFrame, true, gradeFilterId);
  const {plan: effectPlan, style} = combineEffectStyle(legacyStyle, renderableClip, localFrame);
  const baseStyle = combineEffectStyle(visualStyle({...clip, effects: {...clip.effects, colorEnabled: false}}, localFrame, true), renderableClip, localFrame).style;
  const incomingActive = incoming && localFrame <= Math.ceil(incoming.duration / 2);
  const outgoingActive = outgoing && localFrame >= clip.duration - Math.floor(outgoing.duration / 2);
  const wrapperStyle = incomingActive ? transitionStyle(clip, incoming, "incoming", localFrame) : outgoingActive ? transitionStyle(clip, outgoing, "outgoing", localFrame) : {};
  const maskedTreatment = Boolean(clip.effects.enabled && (clip.effects.maskEnabled || clip.effectMasks?.some((mask) => mask.enabled && mask.target === "color")) && (clip.kind === "video" || clip.kind === "image"));
  const renderMedia = (mediaStyle: React.CSSProperties, withAudio: boolean) => {
    if (clip.colorGrade && gradeRequiresProcessing(clip.colorGrade) && clip.effects.enabled && clip.effects.colorEnabled && mediaStyle !== baseStyle && previewSrc && (clip.kind === "image" || clip.kind === "video")) {
      return <GradedMedia grade={clip.colorGrade} luts={luts} kind={clip.kind} media={{src: resolveMediaSource(previewSrc), trimBefore: Math.max(0, clip.sourceStart + frameOffset * getClipPlaybackRate(clip)), playbackRate: getClipPlaybackRate(clip), preservePitch: clip.preservePitch ?? true, volume: (frame) => withAudio ? clipAudioVolume(clip, frame + frameOffset) * audioMultiplier : 0, pauseWhenBuffering: false, style: {...mediaStyle, objectFit: "cover"}}} />;
    }
    if (clip.kind === "video" && previewSrc) {
      const playbackRate = getClipPlaybackRate(clip);
      return (
        <OffthreadVideo
          src={resolveMediaSource(previewSrc)}
          trimBefore={Math.max(0, clip.sourceStart + frameOffset * playbackRate)}
          playbackRate={playbackRate}
          preservePitch={clip.preservePitch ?? true}
          volume={(currentFrame) => withAudio ? clipAudioVolume(clip, currentFrame + frameOffset) * audioMultiplier : 0}
          pauseWhenBuffering={false}
          style={{...mediaStyle, objectFit: "cover"}}
        />
      );
    }
    if (clip.kind === "image" && previewSrc) return <Img src={resolveMediaSource(previewSrc)} style={{...mediaStyle, objectFit: "cover"}} />;
    return null;
  };
  const effectOverlays = effectPlan.overlays.map((overlay) => <EffectOverlayLayer key={overlay.id} overlay={overlay} localFrame={localFrame} renderMedia={renderMedia} />);
  const mediaContent = (withAudio: boolean) => <>
    {maskedTreatment ? <>{renderMedia(baseStyle, withAudio)}<AbsoluteFill style={effectMaskStyle(clip, localFrame)}>{renderMedia(style, false)}</AbsoluteFill></> : renderMedia(style, withAudio)}
    <TreatmentOverlays clip={clip} localFrame={localFrame} mode="color" />
  </>;
  const content = (() => {
  if (offline) {
    return (
      <AbsoluteFill style={{...baseStyle, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#160817", backgroundImage: "linear-gradient(45deg, rgba(255,40,160,.11) 25%, transparent 25%, transparent 75%, rgba(255,40,160,.11) 75%), linear-gradient(45deg, rgba(255,40,160,.11) 25%, transparent 25%, transparent 75%, rgba(255,40,160,.11) 75%)", backgroundSize: "80px 80px", backgroundPosition: "0 0, 40px 40px"}}>
        <div style={{padding: "24px 36px", border: "2px solid #ff4fa3", borderRadius: 8, background: "rgba(15,4,15,.84)", color: "#ff8bc6", textAlign: "center", fontFamily: "Inter, Arial, sans-serif", boxShadow: "0 18px 60px rgba(0,0,0,.45)"}}>
          <strong style={{display: "block", fontSize: 32, letterSpacing: 5}}>MEDIA OFFLINE</strong>
          <span style={{display: "block", marginTop: 10, color: "#d6b8c8", fontSize: 18}}>{mediaName ?? clip.name}</span>
        </div>
      </AbsoluteFill>
    );
  }
  if ((clip.kind === "video" || clip.kind === "image") && previewSrc) {
    return <>{mediaContent(true)}{clip.effects.blurEnabled && hasTargetMask(clip, "blur") && getAnimatedPropertyValue(clip, "effects.blur", localFrame) > 0 && <AbsoluteFill data-effect-target="blur" style={effectMaskStyle(clip, localFrame, "blur")}><AbsoluteFill style={{filter: `blur(${getAnimatedPropertyValue(clip, "effects.blur", localFrame)}px)`}}>{mediaContent(false)}</AbsoluteFill></AbsoluteFill>}</>;
  }

  if (clip.kind === "title" || clip.kind === "caption") {
    const isCaption = clip.kind === "caption";
    const textStyle = {...(isCaption ? DEFAULT_CAPTION_STYLE : DEFAULT_TITLE_STYLE), ...(clip.textStyle ?? {})};
    return (
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: isCaption ? "flex-end" : "center",
          padding: isCaption ? "0 120px 88px" : "70px 110px",
          ...style,
          position: "absolute",
        }}
      >
        <div
          style={{
            maxWidth: "100%",
            padding: textStyle.backgroundOpacity > 0 ? (isCaption ? "10px 22px 12px" : "12px 22px") : 0,
            borderRadius: isCaption ? 9 : 5,
            color: textStyle.color,
            backgroundColor: hexToRgba(textStyle.backgroundColor, textStyle.backgroundOpacity),
            fontFamily: textStyle.fontFamily,
            fontSize: textStyle.fontSize,
            fontWeight: textStyle.fontWeight,
            letterSpacing: textStyle.letterSpacing,
            lineHeight: textStyle.lineHeight,
            textAlign: textStyle.textAlign,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            WebkitTextStroke: `${textStyle.strokeWidth}px ${textStyle.strokeColor}`,
            paintOrder: "stroke fill",
            textShadow: "0 6px 30px rgba(0,0,0,.78)",
          }}
        >
          {clip.text}
        </div>
      </AbsoluteFill>
    );
  }

  return null;
  })();

  const enabledMatte = renderableClip.objectMattes?.find((matte) => matte.enabled);
  const matteMissing = enabledMatte && !matteFrameAt(enabledMatte, localFrame);
  return <AbsoluteFill data-editor-clip-id={clip.id} data-editor-track-id={clip.trackId} style={{overflow: "hidden", ...wrapperStyle}}><AbsoluteFill style={enabledMatte ? objectMatteCss(enabledMatte, localFrame) : undefined}>{content}{!offline && <TreatmentOverlays clip={clip} localFrame={localFrame} mode={clip.kind === "video" || clip.kind === "image" ? "finishing" : "all"} />}{!offline && effectOverlays}</AbsoluteFill><EffectFailureBadge errors={[...effectPlan.errors, ...(matteMissing ? [`Object matte has no frame: ${enabledMatte.name}`] : [])]} /></AbsoluteFill>;
};

const NestedAudioScope: React.FC<React.PropsWithChildren<{clip: EditorClip}>> = ({clip, children}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill data-audio-nest-id={clip.id} data-audio-gain={clipAudioVolume(clip, frame)}>{children}</AbsoluteFill>;
};

const CachedAudioTimeline: React.FC<EditorCompositionProps & {ancestors: string[]}> = ({project, ancestors, useProxies = false}) => {
  const audioSoloActive = project.tracks.some((track) => track.kind === "audio" && track.solo);
  return <>{project.clips.map((clip) => {
    const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
    const sourceMedia = project.media.find((item) => item.id === clip.sourceMediaId);
    if (track?.hidden || sourceMedia?.offline) return null;
    if (clip.kind === "sequence" && clip.nestedSequenceId && !ancestors.includes(clip.nestedSequenceId)) {
      const nested = projectViewForSequence(project, clip.nestedSequenceId);
      if (!nested) return null;
      return <Sequence key={clip.id} from={clip.start} durationInFrames={clip.duration}><NestedAudioScope clip={clip}><Sequence from={-Math.round(clip.sourceStart)} durationInFrames={nested.durationInFrames}><CachedAudioTimeline project={nested} ancestors={[...ancestors, clip.nestedSequenceId]} useProxies={useProxies} /></Sequence></NestedAudioScope></Sequence>;
    }
    if ((clip.kind !== "audio" && clip.kind !== "video") || !clip.src) return null;
    const trackAudible = clip.kind === "audio" ? !track?.muted && (!audioSoloActive || Boolean(track?.solo)) : !track?.muted;
    const trackMultiplier = trackAudible ? (track?.volume ?? 1) : 0;
    return <Sequence key={clip.id} from={clip.start} durationInFrames={clip.duration}><div data-editor-clip-id={clip.id} data-editor-track-id={clip.trackId}><Html5Audio src={resolveMediaSource(resolveClipPreviewSource(clip, project.media, useProxies) ?? clip.src)} trimBefore={clip.sourceStart} playbackRate={getClipPlaybackRate(clip)} preservePitch={clip.preservePitch ?? true} pauseWhenBuffering={false} volume={(frame) => clipAudioVolume(clip, frame) * trackMultiplier} /></div></Sequence>;
  })}</>;
};

const EditorTimeline: React.FC<EditorCompositionProps & {ancestors: string[]}> = ({project, ancestors, useProxies = false, useRenderCache = false}) => {
  const trackOrder = new Map(project.tracks.map((track, index) => [track.id, index]));
  const visibleClips = project.clips
    .filter((clip) => {
      const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
      return track && !track.hidden;
    })
    .sort((a, b) => ((trackOrder.get(b.trackId) ?? 0) - (trackOrder.get(a.trackId) ?? 0)) || a.start - b.start);

  const validTransitions = (project.transitions ?? []).filter((transition) => {
    const from = project.clips.find((clip) => clip.id === transition.fromClipId);
    const to = project.clips.find((clip) => clip.id === transition.toClipId);
    return from && to && from.kind !== "audio" && from.kind !== "caption" && to.kind !== "audio" && to.kind !== "caption" && from.trackId === to.trackId && from.start + from.duration === to.start;
  });
  const audioSoloActive = project.tracks.some((track) => track.kind === "audio" && track.solo);

  if (ancestors.length === 1 && useRenderCache && usableRenderCache(project)) {
    // The cache already contains the complete composition; do not grade it again.
    return <AbsoluteFill style={{backgroundColor: "#05060a", overflow: "hidden"}} data-render-cache="active"><OffthreadVideo src={resolveMediaSource(project.renderCache!.url!)} volume={0} pauseWhenBuffering={false} style={{width: "100%", height: "100%", objectFit: "cover"}} /><CachedAudioTimeline project={project} ancestors={ancestors} useProxies={useProxies} /></AbsoluteFill>;
  }

  return (
    <AbsoluteFill style={{backgroundColor: "#05060a", overflow: "hidden"}}>
      {visibleClips.map((clip) => {
        const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
        const sourceMedia = project.media?.find((item) => item.id === clip.sourceMediaId);
        if (clip.kind === "sequence" && clip.nestedSequenceId && !ancestors.includes(clip.nestedSequenceId)) {
          const nested = projectViewForSequence(project, clip.nestedSequenceId);
          if (!nested) return null;
          return (
            <Sequence key={clip.id} from={clip.start} durationInFrames={clip.duration} premountFor={Math.min(project.fps, clip.duration)}>
              <NestedAudioScope clip={clip}>
              <Sequence from={-Math.round(clip.sourceStart)} durationInFrames={nested.durationInFrames}>
                <EditorTimeline project={nested} ancestors={[...ancestors, clip.nestedSequenceId]} useProxies={useProxies} />
              </Sequence>
              </NestedAudioScope>
            </Sequence>
          );
        }
        if (clip.kind === "audio") {
          if (!clip.src || sourceMedia?.offline) return null;
          const trackAudible = !track?.muted && (!audioSoloActive || Boolean(track?.solo));
          const trackMultiplier = trackAudible ? (track?.volume ?? 1) : 0;
          return (
            <Sequence key={clip.id} from={clip.start} durationInFrames={clip.duration}>
              <div data-editor-clip-id={clip.id} data-editor-track-id={clip.trackId}>
              <Html5Audio
                src={resolveMediaSource(resolveClipPreviewSource(clip, project.media, useProxies) ?? clip.src)}
                trimBefore={clip.sourceStart}
                playbackRate={getClipPlaybackRate(clip)}
                preservePitch={clip.preservePitch ?? true}
                pauseWhenBuffering={false}
                volume={(frame) => clipAudioVolume(clip, frame) * trackMultiplier}
              />
              </div>
            </Sequence>
          );
        }

        const incoming = validTransitions.find((transition) => transition.toClipId === clip.id);
        const outgoing = validTransitions.find((transition) => transition.fromClipId === clip.id);
        const desiredFrom = clip.start - Math.floor((incoming?.duration ?? 0) / 2);
        const sequenceFrom = Math.max(0, desiredFrom);
        const frameOffset = sequenceFrom - clip.start;
        const outgoingExtension = Math.ceil((outgoing?.duration ?? 0) / 2);
        const sequenceEnd = Math.min(project.durationInFrames, clip.start + clip.duration + outgoingExtension);
        const trackMultiplier = track?.muted ? 0 : (track?.volume ?? 1);
        const previewSrc = resolveClipPreviewSource(clip, project.media, useProxies);

        return (
          <Sequence key={clip.id} from={sequenceFrom} durationInFrames={Math.max(1, sequenceEnd - sequenceFrom)}>
            <VisualClip clip={clip} luts={project.luts ?? []} frameOffset={frameOffset} audioMultiplier={trackMultiplier} previewSrc={previewSrc} offline={sourceMedia?.offline} mediaName={sourceMedia?.name} incoming={incoming} outgoing={outgoing} />
          </Sequence>
        );
      })}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          boxShadow: "inset 0 0 160px rgba(0,0,0,.52)",
          background: "linear-gradient(180deg, rgba(0,0,0,.06), transparent 45%, rgba(0,0,0,.2))",
        }}
      />
    </AbsoluteFill>
  );
};

export const EditorComposition: React.FC<EditorCompositionProps> = ({project, useProxies = false, useRenderCache = false}) => (
  <EditorTimeline project={project} ancestors={[project.activeSequenceId]} useProxies={useProxies} useRenderCache={useRenderCache} />
);
