# Infinity Cut + Remotion VFX

This repository contains a browser-based nonlinear video editor and the existing Remotion trailer compositions.

## Infinity Cut editor

Start the editing workspace:

```console
npm run dev
```

`npm run editor` is available as an alias. Infinity Cut is a separate application from Remotion Studio; dragging clips onto a Remotion Studio timeline will not add them to an Infinity Cut sequence.

The editor opens at `http://localhost:5173/editor.html` and includes:

- Multi-track video, caption, and audio timeline
- Click-and-drag playhead scrubbing and frame stepping
- Multi-select and marquee selection
- Cross-track clip moves with edge, marker, and playhead snapping
- Razor, ripple, roll, slip, and slide editing tools
- Clip move, trim, split, duplicate, ripple-delete, and delete operations
- Linked video/audio clip groups and linked selection
- Timeline markers and clip context menus
- Copy and paste at the playhead
- Track visibility, mute, and lock controls
- Persistent media library with bins, search, type filters, sorting, and grid/list views
- Media metadata, timeline usage counts, master-clip rename, duplicate-import detection, and safe removal
- Offline media placeholders plus relink and replace-footage workflows that update every linked timeline clip
- Browser import, playhead insertion, and timeline drag-and-drop
- Keyframe animation for position, scale, rotation, opacity, color, and blur with eased interpolation
- Lumetri-style Color workspace with live luma/RGB scopes, creative looks, copy/paste grades, and full effect bypass
- Temperature, tint, exposure, tonal-range, vibrance, hue, fade, sharpen, vignette, grain, glow, and blur controls
- Ellipse effect masks with position, size, feather, and inversion controls
- Keyframeable color and finishing effects that render consistently in preview and final exports
- Inspector keyframe navigation and clickable keyframe diamonds on timeline clips
- Cross Dissolve, Dip to Black, Wipe Left, and Slide Left video transitions
- Timeline transition overlays with editable type and frame duration
- Decoded audio waveforms for timeline clips
- Clip gain in dB with keyframe automation and clip mute
- Constant-power fade-in and fade-out handles
- Audio track mixer with volume, mute, and solo controls
- Title and caption clips with a dedicated C1 caption track
- Typography controls for font, size, weight, alignment, tracking, line height, fill, background, and outline
- Title/caption style presets with transform keyframe animation
- SRT and WebVTT caption import plus SRT export
- Real Remotion-powered MP4 (H.264/AAC) and WebM (VP9/Opus) video export
- Export presets for source or 720p resolution, draft/standard/high quality, and full-sequence or selected-clip range
- Live render progress, cancellation, downloadable output, and persistent local media imports
- Timeline snapping and zoom
- Undo and redo history
- Remotion-powered program preview
- Local project persistence and editable JSON project export

Keyboard shortcuts:

| Action | Shortcut |
| --- | --- |
| Play or pause | `Space` |
| Split selected clip | `S` |
| Selection tool | `V` |
| Razor tool | `C` |
| Ripple edit tool | `B` |
| Rolling edit tool | `N` |
| Slip tool | `Y` |
| Slide tool | `U` |
| Add marker | `M` |
| Delete selected clip | `Delete` or `Backspace` |
| Ripple delete selected clips | `Shift + Delete` |
| Duplicate selected clip | `Cmd/Ctrl + D` |
| Copy / paste clips | `Cmd/Ctrl + C` / `Cmd/Ctrl + V` |
| Undo | `Cmd/Ctrl + Z` |
| Redo | `Cmd/Ctrl + Shift + Z` |
| Previous or next frame | `Left` / `Right` |
| Previous or next second | `Shift + Left` / `Shift + Right` |

Create a production editor bundle with:

```console
npm run editor:build
```

The output is written to `editor-dist/`.

### Animate a property

1. Select a clip and place the playhead over it.
2. Click the diamond beside an Inspector property to create its first keyframe.
3. Drag the playhead to another point inside the clip.
4. Change the property value. Infinity Cut creates the next keyframe and animates between the two values.

Click a diamond on the timeline clip to seek to it. The arrows in the Inspector's Animation row move between keyframes. Click a filled property diamond to remove the keyframe at the current playhead position.

### Add a transition

1. Select either side of an edit between two adjacent visual clips.
2. Open the Effects tab and choose a transition under Video transitions, or right-click a clip and choose **Add cross dissolve**.
3. Click the transition overlay centered on the edit point to change its type or duration in the Inspector.

Transitions require adjacent clips on the same video track. Moving or trimming clips so the edit is no longer adjacent removes the invalid transition.

### Grade color and add effects

1. Select a video, image, or title clip and open the **Color** tab.
2. Choose a creative look or use **Basic correction** and **Creative** controls for a custom grade. The luma waveform and RGB histogram update from the current program frame.
3. Use the **Effect stack** to adjust or bypass Gaussian Blur, Vignette, Film Grain, and Glow. The eye in the clip header bypasses the complete grade for before/after comparison.
4. Enable the **Ellipse mask** to limit the processed result, then adjust its position, size, feather, or inversion.

Use **Copy grade** and **Paste grade** to match clips quickly. The expanded Color and Effects sections in the Inspector expose keyframe diamonds for animated grades. Color settings are stored in the project and included in MP4/WebM exports.

### Mix audio

- Open the **Audio** tab for A1/A2 track gain, mute, and solo controls.
- Select an audio or video clip to edit clip gain, fades, and mute in the Inspector.
- Drag the green fade handles along the top of an audio clip to shape constant-power fade-in and fade-out curves.
- Click the diamond beside Clip gain, move the playhead, and change the dB value to create gain automation.

Track volume and clip gain are combined during Remotion playback. When any audio track is soloed, non-solo audio tracks are silenced.

### Add titles and captions

1. Place the playhead where the text should begin and open the **Text** tab.
2. Choose **Add title** for a graphic on V3 or **Add caption** for a subtitle on C1.
3. Select the text clip and use the Inspector to edit its copy, typography, alignment, colors, background, and outline.
4. Trim or move the clip on the timeline like any other edit. Transform diamonds animate its position, scale, rotation, and opacity.

Use **Import SRT / VTT** in the Text tab to create timed C1 caption clips from a subtitle file. **Export SRT** writes all C1 caption clips in sequence order.

### Export a video

1. Click **Export** in the top-right toolbar.
2. Choose MP4 or WebM, source or 720p resolution, a quality preset, and either the entire sequence or selected clip.
3. Click **Render video**. The dialog reports bundling, frame rendering, audio mixing, and completion progress.
4. Click **Download MP4** or **Download WebM** when the render finishes. A running export can be cancelled safely.

Video rendering runs through the local Remotion service included with `npm run dev` or `npm run editor`. Imported media is copied into the ignored `.infinity-cut/media/` workspace so it remains accessible to both the editor preview and renderer. Completed files are staged in `.infinity-cut/renders/` and downloaded through the Export dialog.

### Manage media

Open the **Project** tab to organize source footage into bins, switch between grid and list views, filter by media type, or sort by name, date, duration, and type. Select an item to see its duration, resolution, file size, export readiness, and timeline usage count.

- Click a media name in the details card to rename the master item and every linked timeline instance.
- Use **Relink** to reconnect missing footage while keeping the master name, or **Replace** to swap the source and propagate the new name to linked clips.
- Mark an item **Offline** to test missing-media behavior. Visual clips show a clear offline slate and linked audio is muted until the item is brought online or relinked.
- Duplicate file imports are skipped using the source file's name, size, and modified time.
- Media used by the timeline cannot be removed from the project accidentally; its usage count identifies the clips that must be removed or replaced first.

## Remotion Studio

Start the existing trailer composition workspace separately:

```console
npm run studio
```

Render a composition with:

```console
npx remotion render
```

## Original Remotion starter notes

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
