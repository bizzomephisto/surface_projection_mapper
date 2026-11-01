# Surface — Projection Studio

A local desktop app for tracing physical objects into projection zones. Built for Linux and Windows with Electron and WebGL. This is an early, usable prototype; real projector calibration and Windows hardware testing are still required.

## Packaged builds

- Linux: `release/0.5.2/Surface-0.5.2.AppImage`. Mark it executable if your file manager requires it. If FUSE is unavailable, run `./launch-linux.sh` to use the unpacked build.
- Windows: `release/0.5.2/Surface Setup 0.5.2.exe`. Copy it to Windows and run the installer. It is unsigned and has not been tested on Windows hardware.
- The Linux AppImage passed the desktop test suite, including actual image/video decoding, projector pixels, portable saves, and missing-file relinking. Physical projector calibration still needs to be checked on your setup.

## Run from source

Install Node.js 22 or newer, then run:

```sh
npm install
npm start
```

If the Electron binary was not downloaded automatically, run `npx install-electron --no` once. Use a normal desktop session with hardware acceleration. On Linux, you can explicitly select X11 with `npm start -- --ozone-platform=x11` if needed.

## First mapping

1. Connect your projector and configure it as an **extended display** in the operating system.
2. Choose it from **Projector**. Set **Canvas** to its native resolution, then select **Launch output**. With one connected monitor, output opens on that monitor; press Escape in output to close it.
3. Add a **Quad** for each flat face, an **Ellipse**, or **Trace** for an irregular outline. Click points and press Enter to finish tracing. Clicking the first point or double-clicking also finishes.
4. Turn on **Calibration**. Select the surface and drag its numbered corners to match the physical object. Arrow keys nudge by one output pixel; Shift nudges by ten.
5. For curves, select a mesh density in the inspector and choose **Add warp mesh**. Drag mesh nodes. Changing mesh density replaces existing mesh adjustments. Removing a mesh returns to the original four corners.
6. Import images/videos with **Import**, then click the asset's **＋** to place it in the selected surface. Add text and color layers from the inspector. The first content layer replaces the initial alignment grid. Layers can be reordered, hidden, and removed.
7. Trace **Cutout** polygons for areas that must stay transparent. Traced outlines remain point-editable in **Select** and **Outline**, including after warping. Cutouts can also be traced after warping. The inspector can clear cutouts.
8. To join shapes, Shift-click them in the surface list or canvas, then select **Join shapes** (Ctrl/Cmd + J). The last selected shape is active (highlighted more strongly); its content fills the whole joined mask. Overlaps merge, disconnected parts retain their gaps, and cutouts are preserved where no other selected shape fills them. Joining bakes the current geometry into a new outline; undo restores the originals. Every island and hole remains point-editable.
9. Use **Minimal interface** or Tab to hide panels and extra bars and fit the canvas to the enlarged workspace. The same button restores the full interface. Projector controls stay available.
10. Save the project. Keep its JSON file and adjacent `.assets` folder together when moving between computers. Use the library's relink button if a file is missing.

The projector shows content only. Calibration patterns are explicitly enabled. Guides, selections, inspector controls, and editor zoom do not appear in output. **B** toggles blackout in either window. Escape in the projector window closes output.

Trace vertices appear immediately after finishing a trace. Drag them, use arrow keys to nudge, double-click an edge to insert a point, or use **＋ Point** / **− Point** in the inspector. Delete removes the selected outline point while retaining at least three vertices. Use **Corners** for perspective adjustment or **Warp** for mesh adjustment. Unwarped traces can expand beyond their original bounds; warped outline points stay within the existing mesh.

New projects use format version 5. Existing version 1–4 projects still open; older versions of Surface cannot open version 5 projects. Keep a separate copy if you also need the older app.

## Media, masks, transforms, and outlines

- **Remove media** in the inspector removes image/video layers from the active surface while keeping its geometry, warp, outline, and text/color layers. **Clear all content** removes every content layer and keeps the surface. **Remove this layer** removes only the selected layer.
- The library's **×** removes an asset and its references from every surface. It preserves all masks and can be undone. Unlock any surfaces using the asset first. This does not delete source files or copied files from disk.
- **Copy masks / Paste masks**, or Ctrl/Cmd + C / V, use the system clipboard. Copies include geometry, cutouts, joined regions, warp, transforms, and outline settings, with **no media or text layers**. Paste works across projects without requiring assets. Copies get new identities, are unlocked, and are offset by 20 output pixels. **Duplicate** remains the way to copy a surface with content.
- **Transform active surface** provides independent X/Y scale (5–1000%), rotation, horizontal/vertical mirroring, quarter-turn buttons, and reset. It transforms the complete mask and its content around the surface center. Rotation uses output pixel proportions. Values describe transforms applied since the surface was created/joined; direct point edits remain independent.
- Content layers also have their own rotation, mirroring, scale, and position controls, so media can be changed inside a fixed projection zone.
- **Perimeter outline** sets color, width (1–100 output pixels), and projector visibility. New surfaces have an enabled 3-pixel mint outline. The stroke follows the actual perimeter of traces, ellipses, joined islands, cutouts, and warped boundaries, with round joins. Width stays constant in output pixels. It is independent of content and remains visible after clearing media. Editor guides use the same color and can still be hidden separately.
- Outlines follow surface stacking and opacity. Blackout hides content and outlines together. Legacy surfaces without saved outline settings use the default outline until configured.

## Off-canvas handles and media sizing

- Handles can extend outside the projection rectangle into the dotted workspace and remain draggable. The projector still clips content to its actual output resolution.
- Points outside the visible workspace appear as light **edge indicators**. Drag one into view to recover the actual point; clicking alone does not move it. Indicators are spread along the viewport edge to reduce overlap.
- **Fit handles** or **Home** zooms out to include the canvas and every selected surface's corners, warp nodes, and trace boundary. **Fit canvas** returns to the normal projector framing. Zoom and pan continue to work in both full and minimal interface modes. With Guides off, editing handles and indicators are hidden as before.
- For an image/video layer, **Media width (%)** and **Media height (%)** resize the content inside the fixed mask (5–1000%). **Keep media proportions** links the two values; disable it for independent sizing. **Media zoom** remains an additional uniform multiplier.
- **Fit mask to media** changes the mask itself. It keeps the current width, center, trace, cutouts, and warp topology, and adjusts height along the mask's own frame to the selected source's aspect ratio. This works for images and videos, including portrait media. It resets the selected layer's placement, zoom, X/Y size, and rotation so the source fits completely; other layers retain their settings. It is undoable. Perspective faces use their average frame axes as the aspect reference.

## LED strips and Bézier paths

1. Select **LED path**, click two or more points, then press Enter for an open strip. Shift+Enter closes a loop; clicking the first point also closes it. Alternatively, create a normal Trace and choose **Apply LEDSTRIP** in its inspector.
2. Select a point and choose **Make Bézier**, or press Ctrl/Cmd + B. Drag the gold tangent handles to bend the path. **Linked tangents** keeps both sides smooth; disable it to adjust them independently. Choose **Make corner** for a straight joint. Anchors and tangents remain editable, including off-canvas edge indicators. Inserting a point splits the curve without changing its shape.
3. Choose **Individual LED dots**, **Individual LED blocks**, or **Continuous solid strip**. Set strip width in output pixels. Coverage controls the dark gap between discrete LEDs; glow applies to dots and blocks.
4. Measure the projected centerline and enter **Measured path length (in)**. Then set **LEDs per inch**. The initial 96 output pixels/inch is only an estimate; physical density requires this calibration. Recalibrate after changing the strip's projected dimensions. LEDs are spaced uniformly by distance along the curve. Each strip is limited to 4096 LEDs; the count shows when capped.
5. Select an effect, palette, speed, and intensity. Grouping, spacing, reverse, and mirror operate along LED order. Custom colors uses three color controls. Global Play/Pause and Restart control LED effects and videos; editor and output use a shared animation clock. Projects reopen with animation time reset.

The 20 local effects are Solid, Blink, Breathe, Wipe, Rainbow, Color loop, Chase, Comet, Scanner, Fire, Twinkle, Sparkle, Theater chase, Running lights, Gradient, Meteor, Noise, Candle, Waves, and Strobe. Palettes include Custom, Rainbow, Fire, Ocean, Party, Sunset, Forest, and Ice. Continuous rendering and the Solid effect are separate settings: a continuous strip can still animate.

Applying LEDSTRIP retains previous content. **Restore mask content** brings it back; closed curves retain their edited perimeter. An open path restores its enclosing area mask. Copy/paste keeps strip geometry and LED settings; Duplicate also keeps any retained content. Transforms, warp, opacity, stacking, isolation, calibration, and blackout work with strips.

These are independently implemented projection effects inspired by [WLED effects](https://kno.wled.ge/features/effects/) and [segment controls](https://kno.wled.ge/features/segments/), with no firmware code port. They are not firmware-identical or the complete WLED catalog. No physical WLED controller, network control, or sound-reactive input is included. Each strip uses one open or closed path with at most 512 anchors. Connected joined masks, including older saved projects, can become strips directly. Disconnected multi-region masks require a separate connected path for each strip. Area cutouts do not cut the strip centerline.

Closed Bézier paths also work as ordinary media masks. Use the same point controls before or after restoring mask content.

## Current capabilities

- Independent surfaces with four-corner perspective mapping, polygon and elliptical masks, and editable warp meshes.
- Polygon exclusion masks, surface isolation, visibility, locking, duplication, and stacking.
- Image, video, multiline text, color, and grid content layers.
- Fit/fill/stretch, layer position/scale/opacity, surface brightness, and text appearance controls.
- Traced LED strips, editable Bézier tangents, calibrated density, and 20 WLED-style local effects.
- Global animation play/pause/restart; video looping and speed controls.
- Undo/redo for project edits; zoom, fit view, and middle-button panning.
- Native file dialogs, portable project/media saves, missing-file detection and relinking.
- Separate fullscreen projector window, output display selection, custom output resolution, calibration, and blackout.

## Limits of this first build

- One projector; surfaces visible from that projector's viewpoint. No 3D model import, camera calibration, multi-projector edge blending, timeline, or synchronized show cues.
- Videos are **silent**. Repeated uses of one imported video share playback and settings. Output playback is periodically aligned to the editor, but this is not frame-locked playback.
- MP4 H.264 and WebM are the intended video formats. Other containers/codecs depend on Electron support; MOV does not guarantee codec compatibility. Decode errors are reported in the workspace.
- Surface content defaults to 1280 × 720 per surface before GPU warping. Fitting a mask to media uses that media’s aspect ratio with a maximum texture edge of 1280 pixels, so portrait sources are not first cropped through a landscape texture. The output canvas supports larger resolutions, but this is not native 4K content rendering.
- For a flat quad, perspective is projectively correct. A warp mesh uses piecewise interpolation; curved geometry needs manual mesh alignment.
- No automatic project recovery, surface groups, edge feathering, audio mixing, or packaged media deletion yet. Save frequently. Unused copied media may remain in the project's assets folder after later saves.
- Linux desktop integration and automated rendering checks are available here. A Windows installer has been cross-built on Linux, but it still needs installation and hardware testing on Windows. Builds are unsigned.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| V / R / P / M | Select / quad / trace / warp |
| Enter / Shift + Enter | Finish tracing / close an LED loop |
| Ctrl/Cmd + B | Toggle selected path point between corner and Bézier |
| Escape | Cancel tracing; close output when output is focused |
| Arrow / Shift + Arrow | Nudge by 1 / 10 output pixels |
| Ctrl/Cmd + S | Save |
| Ctrl/Cmd + Shift + S | Save As |
| Ctrl/Cmd + O | Open |
| Ctrl/Cmd + Z / Shift + Z | Undo / redo |
| Ctrl/Cmd + C / V | Copy / paste masks without content |
| Ctrl/Cmd + D | Duplicate surface with content |
| Shift-click | Add/remove a shape from selection |
| Ctrl/Cmd + J | Join selected shapes using the active shape’s content |
| Tab | Toggle minimal interface |
| Double-click outline edge | Insert a vertex |
| Delete | Remove selected outline point; otherwise remove the selected content layer when its layer row is active, or delete the selected unlocked surface |
| Space | Play/pause videos and LED effects |
| B | Blackout |
| Home / Fit handles | Reveal the canvas and selected offscreen handles |
| Scroll / middle drag | Zoom / pan editor |

## Checks and builds

```sh
npm test                 # Geometry, validation, and undo/redo
npm run test:desktop     # Real Electron UI, media, persistence, and output checks (desktop + ffmpeg required)
npm run pack             # Unpacked app for the current OS
npm run dist:linux       # Linux AppImage
npm run dist:windows     # Windows NSIS installer (run on Windows)
```

The workspace also includes `launch-linux.sh` and `launch-windows.cmd` launchers. The Linux launcher prefers an existing packaged build.

Build outputs go in `release/0.5.2/`. Older builds are preserved. Dependencies are development-only; no web server, account, or cloud service is required to use the app.

## Structure

- `electron/main.cjs`: window lifecycle, displays, constrained IPC, local media protocol, and portable project persistence.
- `electron/preload.cjs`: narrow desktop bridge, with renderer Node access disabled and isolation/sandboxing enabled.
- `src/core.mjs`: project data, homography, warp geometry, validation, and history.
- `src/renderer.mjs`: content compositing and shared WebGL projection renderer.
- `src/led.mjs`, `src/led-shaders.mjs`: curve geometry, strip density, shared animation clock, and independent LED effect shaders.
- `src/app.mjs`: editing interactions and workspace state.
- `src/output.mjs`: clean projector output using the same rendering pipeline.

The bundled polygon boolean library is generated with `npm run vendor`. Its source and license are included in `src/vendor/`.
