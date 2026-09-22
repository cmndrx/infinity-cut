# Directors Cut Pro: audit and release plan

Audit date: September 7, 2026. Baseline: `4fbda5a52b013d36eeb96900ef5eee16c3c5fd77` on `codex/premiere-26-parity`.

## Executive assessment

This is a substantial local nonlinear-editor prototype with many real implementations, but it is not yet a production-qualified professional editor. The largest risk is not missing buttons: it is disagreement between saved settings, live preview, cached preview, and exported output.

The recommended finish line is a dependable local, single-editor V1. Full Premiere feature parity is a separate, much larger roadmap. Secure internet collaboration and automatic ML rotoscoping remain explicitly deferred.

## Evidence and limits

- Fresh automated verification: 139 tests across 34 files passed; ESLint and TypeScript passed; the production editor build passed.
- Build warnings include a large editor JavaScript chunk and Vite's deprecated CJS API.
- This pass inspected source, integration paths, tests, and build output. It did not perform a new interactive browser audit, microphone recording, codec compatibility matrix, or real media export comparison.
- Consequently, “implemented” below means connected code exists, not that every workflow has passed release acceptance. Many tests exercise helpers; some composition tests inspect source strings rather than rendered pixels.
- Prior array-filter timing is not a full-editor browser performance benchmark. Do not treat it as proof that a huge interactive project remains responsive.

## What exists today

| Area | Implemented foundation | Release status |
| --- | --- | --- |
| Projects | Project Home; create/open/duplicate/rename; browser autosave, checkpoints, recovery; JSON import/export | Needs portability, recovery, quota, and long-session acceptance tests |
| Media | File import/drop; media bins/search; metadata and FPS mismatch prompt; offline/relink workflows | Needs mixed-FPS, variable-frame-rate, reload and missing-file tests |
| Editing | Multitrack timeline; source monitor/In-Out; insert/overwrite; targeting; trim/split/ripple/roll/slip/slide; linked clips; undo/redo | Strong foundation; browser interaction and edge-case qualification outstanding |
| Sequences and speed | Multiple/nested sequence data and playback; constant positive speed adjustment; shuttle controls | Nested audio export gap; reverse shuttle is not a reverse-rendered clip |
| Animation and transitions | Property keyframes/easing; titles; basic transitions | Needs deterministic frame-level render fixtures and richer animation tooling |
| Text/captions | Editable titles/captions; typography/presets; SRT/WebVTT import and SRT export | Automatic transcription and transcript-driven editing are not integrated |
| Color/effects/masks | Basic correction, SVG curves, effects registry, effect presets, mask/tracking controls and helpers | Several controls do not produce the promised rendered operation; see blockers |
| Audio | Clip/track gain and fades; processor/bus model; live Web Audio integration; voiceover; FFmpeg export mixing | Preview/export parity and actual device recording need qualification |
| Performance | Proxy selection/generation, background thumbnails/waveforms, render cache, horizontal timeline clip virtualization | Partial optimization; correctness, job limits and real browser benchmarks unfinished |
| Export/interchange | Persistent export queue; H.264/WebM/HEVC/ProRes/image sequence/audio output paths; EDL/FCP7 XML export | Formats exist in code, but delivery matrix is not certified; AAF unfinished |
| Review | Comments, version snapshots, local sharing/session logic | Local feature set, not deployed secure internet collaboration |

## Confirmed code-level blockers

These are source findings, not claims of fresh browser reproduction.

### P0: Output must match the edit

1. **Advanced color is only partly consumed by the composition.** `src/editor/EditorComposition.tsx`, `AdvancedGradeFilter`, applies master/R/G/B curves. Color-wheel, HSL-secondary and LUT data are not applied there. Controls and math/parser tests are not equivalent to a rendered pipeline.
2. **Rectangle masks are explicitly converted to ellipses.** `maskGradient` selects `"ellipse"` for both shapes. The composition's effect-mask path also filters to the `color` target, leaving other advertised mask targets without equivalent integration.
3. **Cached playback applies a finishing overlay twice.** The render-cache job renders the normal composition, including its full-frame gradient/vignette overlay. Cached playback displays that video and applies the same overlay again. Remove the duplicate; also make any artistic full-frame treatment opt-in rather than an invisible default.
4. **Nested edits are absent from cache invalidation.** `src/editor/render-cache.ts` fingerprints active clips and tracks but omits `project.sequences`. Parent cache validity can therefore survive an edit inside a nested sequence.
5. **Bundled public-media audio resolves to the wrong filesystem location.** `render-server.ts`, `mediaSourcePath`, treats URLs beginning with `/audio/...` or `/trailers/...` as absolute disk paths before mapping to `public/`. Failed audio probes return false and can silently exclude that audio.
6. **Final audio mixing does not flatten nested sequences or carry volume keyframes.** `renderProfessionalAudio` selects top-level audio/video clips; `buildProjectAudioMix` likewise consumes top-level clips and static gain. Export must preserve nested timing, routing, mute/solo, automation and speed/pitch intent.

### P1: Performance and reliability

7. **Background preparation is not a bounded worker system.** Analysis/cache jobs begin via `queueMicrotask`; cancellation bookkeeping is not equivalent to terminating the underlying render/FFmpeg process. Add real cancellation, concurrency limits and explicit retry/restart behavior.
8. **Waveforms need a trustworthy source-time contract.** Analysis caps input at two hours, returns fixed peak bins, and does not return the analyzed duration. Drawing must map bins to actual decoded source duration and trim/speed ranges. Do not display decorative fallback peaks as if they were measured audio.
9. **Virtualization is incomplete.** The timeline mounts a visible clip window, but whole-project hashing and some whole-timeline derivations still run during editor rendering. Marquee selection currently depends on mounted clip elements and needs cross-scroll qualification.
10. **Some named effects are approximations.** For example, Pixelate sets CSS image rendering and contrast without an explicit pixel-block sampling operation. Distortion effects also use CSS approximations. Either implement the named behavior or label/limit it honestly.
11. **The release verification layer is missing.** Green helper tests do not certify import-to-export fidelity, browser gestures, audio devices, large projects, crash recovery or output codec compatibility.

## Ordered finish-line plan

### Gate 1 — Trustworthy preview and export

Scope:

- Resolve staged files, public assets and supported remote media through one explicit media contract; surface missing audio rather than silently dropping it.
- Share deterministic sequence flattening and timing across preview/export, including nested audio, mute/solo, fades, volume automation and pitch behavior.
- Fix cache appearance and recursive dependency invalidation.
- Connect wheels/HSL/LUTs to the renderer or disable unfinished controls with an explanation until implemented.
- Correct rectangle masks and supported effect targets; validate inversion, feather and animation.
- Inventory every registered effect: implemented accurately, intentional approximation, or disabled.

Acceptance:

- Small reference projects cover staged and bundled video/audio, 24/25/29.97/30/60 fps, speed changes, nested sequences, transitions, captions and masks.
- Automated image comparisons verify preview render versus final render; cached preview uses a documented compression tolerance, not exact equality.
- Export probes confirm expected frame count, duration, streams and sample rate; audible events align within one sequence frame, with no accumulated drift.
- Changing a nested clip invalidates its parent's cache. Cache on/off introduces no additional artistic treatment.
- No enabled control silently does nothing. No missing media/audio is silently accepted as a successful complete export.

### Gate 2 — Safe projects, media and background jobs

Scope:

- Prove save/reopen, checkpoint recovery, schema migration, relink and project switching preserve all supported settings.
- Define portable project delivery: project JSON references are not a self-contained media archive. Add collect/consolidate media or clear packaging and relink workflows.
- Bound proxy/analysis/cache workers, terminate cancelled processes, protect against stale results after relink, and recover interrupted work.
- Add disk usage visibility, limits and controlled cleanup; invalidate assets when source content changes.
- Store actual analyzed duration/coverage with waveforms and show pending/failed states accurately.

Acceptance:

- Forced server/browser restarts, unavailable media, quota/disk errors and interrupted imports do not silently lose edits.
- A project can be moved to a clean installation and restored using the documented media workflow.
- Large import batches respect configured worker limits; cancellation stops actual work; relinking never attaches the old source's analysis/proxy.

### Gate 3 — Complete and qualify the local editing experience

Scope:

- Audit track creation/reordering, source patching, linked/unlinked edits, sequence nesting, snapping and edit-boundary behavior through the UI. Implement missing essential controls rather than relying on data helpers.
- Qualify drag/drop, playhead dragging, trimming, cross-scroll selection, keyboard shortcuts and undo/redo under zoom and virtualization.
- Move expensive project-wide computation off transport-frame updates; profile actual editor rendering rather than isolated filtering.
- Test microphone permissions/recording alignment and live processor/bus routing with real devices.
- Review workspace layout, readable controls, dialogs, empty/loading/error states and keyboard accessibility at laptop and desktop sizes.

Proposed measurable targets (validate against a recorded reference machine):

- Projects with 100, 1,000 and 10,000 clips remain editable; record median and p95 interaction time, memory and dropped preview frames.
- Target p95 editing feedback below 100 ms for the intended V1 workload; sustained playback target equals sequence fps with an appropriate proxy preset.
- No offscreen-selection regressions, repeated long tasks during playback, or leaked media/process resources after repeated open/close cycles.

### Gate 4 — Release candidate and delivery

Scope:

- Add CI for lint/types/unit tests plus deterministic render fixtures and browser end-to-end workflows.
- Certify each offered export preset with a real output: full sequence, In/Out range, image sequence, audio-only and stems. Validate filename/order, transparency where claimed, channel layout and common-player readability.
- Provide a supported local launcher/runtime workflow, dependency checks for Node/FFmpeg/FFprobe, install instructions and troubleshooting. A static frontend bundle alone is not the complete media/export application.
- Update documentation to reflect verified behavior and disclose unsupported capabilities.
- Run representative projects and sustained editing sessions before tagging a release candidate.

Release gate:

- Zero known P0/P1 issues in supported workflows.
- Ten representative projects successfully complete import → edit → save/reopen/relink → export → independent playback inspection.
- Two-hour editing/recording/export soak with no lost edits or unrecovered jobs.
- A clean-machine install works from the documentation; release notes identify tested platforms, formats and limitations.

## Expansion after the dependable V1

Prioritize separately; these should not hide the correctness work above:

- Reverse clip rendering, freeze frames, variable time remapping and a richer keyframe graph editor.
- Automatic transcription, transcript search/cuts, filler-word removal, speaker labels and automatic captions.
- More accurate effects, full motion-graphics templates and an actual isolated extension/plugin host; declarative manifests alone are not third-party hosting.
- Integrated music remix/retiming, higher-end restoration and speech enhancement; helper modules are not finished workflows.
- Pen/object masks, stronger tracking, edge refinement and rotoscoping.
- HDR/log/raw color management and calibrated scopes/comparison workflows.
- AAF and more complete interchange/round-trip validation.
- Secure internet collaboration, cloud media, identity and permissions, plus selected ML segmentation infrastructure — explicitly deferred.

## Next implementation slice

Start with Gate 1, specifically media-path resolution, nested/automated audio export, and cache appearance/invalidation. Add failing integration/render fixtures first, fix the implementation, and verify actual output. Then complete the advanced color/mask pipeline using the same acceptance approach.

No implementation fixes, commits, pushes or deployments were performed as part of the original audit.

## Implementation progress — September 7, 2026

First Gate 1 slice implemented after approval:

- Shared URL-to-disk media resolution fixes bundled public audio paths and preserves staged upload naming. Unsupported sources and traversal are rejected.
- Audio probing distinguishes valid silent video from missing/unreadable media. Probe failures now fail the export with a relink message rather than silently excluding audio.
- Cache fingerprints include nested sequences and a renderer revision, invalidating older caches.
- Cached playback no longer reapplies the composition's finishing overlay. The original live composition treatment is preserved in this slice.
- Verification: 148 tests passed, lint/TypeScript and production build passed. A generated tone was exported through the actual FFmpeg mix graph and independently probed for non-silent, stereo, 48 kHz audio with the expected duration. Missing-media, silent-video and already-cancelled probe cases passed.

Still open in Gate 1: nested audio routing/timing, volume automation and pitch parity, advanced color and masks, and actual cached-versus-live rendered-image comparison. No new browser QA, full video-export certification, commit, push or deployment is claimed by this slice.

### Second slice — nested audio and automation export

- Nested-sequence audio now renders recursively through child clip/track/bus processing, then through the parent clip/track/bus processing. Repeated instances reuse the rendered child within the parent job; temporary audio is cleaned up on success/failure.
- Export preserves clip-local volume keyframes (linear and eased) and respects the pitch-preservation switch. Small audio blocks prevent coarse automation steps. Mixing normalizes timestamps and pads trailing silence to the sequence duration.
- Audio-track solo handling no longer inadvertently silences embedded video audio. Hidden tracks are excluded from audible export.
- Preflight rejects missing/cyclic nests and nests with differing frame rates or non-100% parent speed. Those cases are not yet supported consistently by preview and export; they are not silently accepted.
- Fresh verification: all 155 tests across 37 files passed, ESLint/TypeScript passed, production build passed, and diff whitespace checks passed. Real FFmpeg output tests measured gain envelopes, 440 Hz versus 880 Hz pitch behavior, repeated nested placement, source trims, parent mute/gain, selected ranges and trailing silence.
- This is an export integration milestone, not full preview/export certification. Nested live Web Audio routing and parent gain/automation in browser preview remain open, along with nested retiming, advanced color/masks and visual cache comparisons. Next: reconcile nested preview audio with this tested export contract, then continue the color/mask pipeline. No commit, push or deployment performed.

### Third slice — nested preview routing and mask geometry

- Live preview now resolves clips in their own nested-instance scope, including repeated nests with duplicate child clip IDs. Each instance has child tracks/buses routed through its parent clip processors and parent track/bus chain.
- Parent clip fades/volume automation are evaluated on the Remotion frame clock and applied to the nested output without rebuilding the audio graph. Cleanup cancels pending gain updates and disconnects graph nodes; stale asynchronous connections are ignored.
- Rectangle color masks now use SVG rectangle geometry instead of the ellipse fallback. Rotation, animated opacity, inversion and feathering reach the mask image. Existing ellipse masks use the same image path; older render caches are invalidated.
- Verification: routing is covered by a mocked Web Audio graph test, including repeated IDs, isolated parent gain paths, dynamic gain changes without node recreation, and cleanup. Mask tests inspect generated SVG geometry and properties. These tests do not constitute real-browser listening or pixel-level mask certification.
- Lint/TypeScript, production build and the full automated suite passed. Remaining: actual browser audio/visual QA, exact processor equivalence between Web Audio and FFmpeg, nested retiming, color wheels/HSL/LUT rendering, and masks targeting effects other than color. No commit, push or deployment performed.

### Fourth slice — actual color processing

- Video and image frames now pass through curves, shadow/midtone/highlight wheels, HSL secondaries and imported 1D/3D LUT evaluation with LUT intensity. The old separate SVG-curve pass was removed to avoid double grading. Effect/color bypass and neutral grades bypass the new frame-processing path.
- Processing uses a 33-cubed RGB lookup texture with trilinear interpolation and 8-bit SDR output. This is an approximation of the source color functions at that sampling resolution, not HDR/raw color management. Sharp HSL boundaries require further visual qualification.
- WebGL is preferred; a software canvas fallback handles browsers without it. The headless test environment rejected the explicitly requested SwiftShader WebGL context, so GPU throughput and accelerated-path compatibility are not certified. Software processing at large resolutions can be slow.
- LUT decoding is cached by object/payload rather than repeated per cube sample. Missing LUTs report errors, and render-time processing errors cancel output rather than silently omitting the grade. Updated renderer revision invalidates old preview caches.
- Browser canvas readback verified neutral gray [128,128,128], a wheel-adjusted result [173,128,83], and LUT inversion from black to white. Automated texture tests cover neutral bypass, wheel changes, HSL hue selection, LUT intensity and missing LUTs. Lint/TypeScript, production build and the suite passed.
- Still open: full video-export/preview frame comparisons, paused-frame editing and context-loss QA, 4K performance, text/title color processing, and masks for blur/vignette/grain/glow. Non-color masks are not claimed complete by this slice. No commit, push or deployment performed.

### Fifth slice — target-specific masks (September 8, 2026)

- Blur masks now composite a muted visual copy of the video/image treatment instead of affecting the entire image. The color-masked treatment remains inside that blur input; no extra audible copy is introduced.
- Vignette, grain and glow overlays use only masks assigned to their own target. Color masking no longer wraps the full finishing/effects stack. Legacy ellipse masks stay color-only; disabled masks and master bypass remain respected.
- Browser verification mounted the actual EditorComposition in a Player with a striped image and a left-half rectangular mask. Before/after screenshots were decoded with FFmpeg: all four target effects changed inside pixels and produced exactly zero outside-region pixel difference. Repeat via `node scripts/verify-effect-masks.cjs` with local Vite on 127.0.0.1:4175, Chrome at the script's macOS path, and FFmpeg installed. The fixture does not open or alter a user project.
- Unit regressions cover target isolation, bypass, disabled masks and legacy color masks. Renderer revision 5 invalidates prior caches.
- Boundaries: the pixel check covers a static image, one hard-edged rectangular mask per effect, not every multi-mask combination or animated/feathered boundary. Masked blur currently targets video/images; title/caption masked blur remains unimplemented. Glow remains the existing stylistic glow treatment, not a new physically accurate bloom algorithm. Masked blur adds visual decoding/compositing work, so long-video/4K performance and full preview/export frame comparisons remain open. No commit, push or deployment performed.
