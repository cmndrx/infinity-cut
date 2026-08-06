import React from "react";
import {AbsoluteFill, Html5Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from "remotion";
import {getAnimatedPropertyValue} from "./animation";
import {getClipPlaybackRate} from "./clip-speed";
import type {EditorClip, EditorProject, EditorTransition} from "./types";
import {DEFAULT_CAPTION_STYLE, DEFAULT_TITLE_STYLE} from "./types";

export type EditorCompositionProps = {
  project: EditorProject;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const visualStyle = (clip: EditorClip, localFrame: number, processed = true): React.CSSProperties => {
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
  const blur = effectsEnabled && clip.effects.blurEnabled ? getAnimatedPropertyValue(clip, "effects.blur", localFrame) : 0;
  const glow = effectsEnabled && clip.effects.glowEnabled ? getAnimatedPropertyValue(clip, "effects.glow", localFrame) : 0;
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
    filter: `brightness(${tonalBrightness}%) contrast(${tonalContrast}%) saturate(${tonalSaturation}%) hue-rotate(${hue}deg) blur(${blur}px)${glow > 0 ? ` drop-shadow(0 0 ${glow * .22}px rgba(255,255,255,${glow / 260}))` : ""}`,
  };
};

const effectMaskStyle = (clip: EditorClip): React.CSSProperties => {
  const featherStart = clamp(100 - clip.effects.maskFeather, 0, 100);
  const gradient = clip.effects.maskInverted
    ? `radial-gradient(ellipse ${clip.effects.maskSize}% ${clip.effects.maskSize}% at ${clip.effects.maskX}% ${clip.effects.maskY}%, transparent 0%, transparent ${featherStart}%, black 100%)`
    : `radial-gradient(ellipse ${clip.effects.maskSize}% ${clip.effects.maskSize}% at ${clip.effects.maskX}% ${clip.effects.maskY}%, black 0%, black ${featherStart}%, transparent 100%)`;
  return {WebkitMaskImage: gradient, maskImage: gradient};
};

const TreatmentOverlays: React.FC<{clip: EditorClip; localFrame: number}> = ({clip, localFrame}) => {
  if (!clip.effects.enabled) return null;
  const colorEnabled = clip.effects.colorEnabled;
  const temperature = colorEnabled ? getAnimatedPropertyValue(clip, "effects.temperature", localFrame) : 0;
  const tint = colorEnabled ? getAnimatedPropertyValue(clip, "effects.tint", localFrame) : 0;
  const vignette = clip.effects.vignetteEnabled ? getAnimatedPropertyValue(clip, "effects.vignette", localFrame) : 0;
  const grain = clip.effects.grainEnabled ? getAnimatedPropertyValue(clip, "effects.grain", localFrame) : 0;
  const glow = clip.effects.glowEnabled ? getAnimatedPropertyValue(clip, "effects.glow", localFrame) : 0;
  return <>
    {temperature !== 0 && <AbsoluteFill style={{backgroundColor: temperature > 0 ? "#ff8a3d" : "#327bff", opacity: Math.abs(temperature) / 430, mixBlendMode: "soft-light"}} />}
    {tint !== 0 && <AbsoluteFill style={{backgroundColor: tint > 0 ? "#e54bca" : "#49c985", opacity: Math.abs(tint) / 520, mixBlendMode: "soft-light"}} />}
    {glow > 0 && <AbsoluteFill style={{background: "radial-gradient(circle at 50% 45%, rgba(255,255,255,.6), rgba(255,255,255,.12) 34%, transparent 70%)", opacity: glow / 300, mixBlendMode: "screen"}} />}
    {vignette > 0 && <AbsoluteFill style={{background: "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,.18) 62%, rgba(0,0,0,.92) 100%)", opacity: vignette / 100, mixBlendMode: "multiply"}} />}
    {grain > 0 && <AbsoluteFill style={{mixBlendMode: "overlay", opacity: grain / 145}}>{Array.from({length: 84}, (_, index) => {
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

const VisualClip: React.FC<{clip: EditorClip; frameOffset: number; audioMultiplier: number; offline?: boolean; mediaName?: string; incoming?: EditorTransition; outgoing?: EditorTransition}> = ({clip, frameOffset, audioMultiplier, offline, mediaName, incoming, outgoing}) => {
  const localFrame = useCurrentFrame() + frameOffset;
  const style = visualStyle(clip, localFrame);
  const baseStyle = visualStyle(clip, localFrame, false);
  const incomingActive = incoming && localFrame <= Math.ceil(incoming.duration / 2);
  const outgoingActive = outgoing && localFrame >= clip.duration - Math.floor(outgoing.duration / 2);
  const wrapperStyle = incomingActive ? transitionStyle(clip, incoming, "incoming", localFrame) : outgoingActive ? transitionStyle(clip, outgoing, "outgoing", localFrame) : {};
  const maskedTreatment = Boolean(clip.effects.enabled && clip.effects.maskEnabled && (clip.kind === "video" || clip.kind === "image"));
  const renderMedia = (mediaStyle: React.CSSProperties, withAudio: boolean) => {
    if (clip.kind === "video" && clip.src) {
      const playbackRate = getClipPlaybackRate(clip);
      return (
        <OffthreadVideo
          src={resolveMediaSource(clip.src)}
          trimBefore={Math.max(0, clip.sourceStart + frameOffset * playbackRate)}
          playbackRate={playbackRate}
          preservePitch={clip.preservePitch ?? true}
          volume={(currentFrame) => withAudio ? clipAudioVolume(clip, currentFrame + frameOffset) * audioMultiplier : 0}
          pauseWhenBuffering={false}
          style={{...mediaStyle, objectFit: "cover"}}
        />
      );
    }
    if (clip.kind === "image" && clip.src) return <Img src={resolveMediaSource(clip.src)} style={{...mediaStyle, objectFit: "cover"}} />;
    return null;
  };
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
  if ((clip.kind === "video" || clip.kind === "image") && clip.src) {
    if (maskedTreatment) {
      return <>{renderMedia(baseStyle, true)}<AbsoluteFill style={effectMaskStyle(clip)}>{renderMedia(style, false)}<TreatmentOverlays clip={clip} localFrame={localFrame} /></AbsoluteFill></>;
    }
    return renderMedia(style, true);
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

  return <AbsoluteFill style={{overflow: "hidden", ...wrapperStyle}}>{content}{!offline && !maskedTreatment && <TreatmentOverlays clip={clip} localFrame={localFrame} />}</AbsoluteFill>;
};

export const EditorComposition: React.FC<EditorCompositionProps> = ({project}) => {
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

  return (
    <AbsoluteFill style={{backgroundColor: "#05060a", overflow: "hidden"}}>
      {visibleClips.map((clip) => {
        const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
        const sourceMedia = project.media?.find((item) => item.id === clip.sourceMediaId);
        if (clip.kind === "audio") {
          if (!clip.src || sourceMedia?.offline) return null;
          const trackAudible = !track?.muted && (!audioSoloActive || Boolean(track?.solo));
          const trackMultiplier = trackAudible ? (track?.volume ?? 1) : 0;
          return (
            <Sequence key={clip.id} from={clip.start} durationInFrames={clip.duration}>
              <Html5Audio
                src={resolveMediaSource(clip.src)}
                trimBefore={clip.sourceStart}
                playbackRate={getClipPlaybackRate(clip)}
                preservePitch={clip.preservePitch ?? true}
                pauseWhenBuffering={false}
                volume={(frame) => clipAudioVolume(clip, frame) * trackMultiplier}
              />
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

        return (
          <Sequence key={clip.id} from={sequenceFrom} durationInFrames={Math.max(1, sequenceEnd - sequenceFrom)}>
            <VisualClip clip={clip} frameOffset={frameOffset} audioMultiplier={trackMultiplier} offline={sourceMedia?.offline} mediaName={sourceMedia?.name} incoming={incoming} outgoing={outgoing} />
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
