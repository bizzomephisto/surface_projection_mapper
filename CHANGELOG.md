# Changes

## 0.6.2

- Added Auto, Compact, and Detailed animated-item layouts.
- Compact designs use larger integer readouts, fewer ticks/meters, stronger indicators, larger wrapped code rows, and bolder radar/waveform marks.
- Auto layout uses projected item size, accounting for surface geometry, layer scale/rotation, and warp independently of editor zoom.
- Existing animated projects adopt Auto when no layout preference is saved.
- Added small-zone rendering, layout persistence, and matching editor/projector regression checks.

## 0.6.1

- Added trilinear mipmaps and optional anisotropic filtering for animated surfaces to reduce aliasing when shrunk or viewed in perspective.
- Kept translucent strokes bright with premultiplied-alpha filtering and blending.
- Added comparisons against high-quality area-downsampled references for several sizes, transparent backgrounds, and reduced opacity.

## 0.6.0

- Added six built-in animated content layers: analog gauge, rotary dial, control panel, scrolling code, radar, and oscilloscope.
- Added per-item speed, direction, pause/restart, colors, background transparency, labels, detail, and automatic/manual readings.
- Added custom display-only scrolling text and shared editor/projector timing.
- Added animated-item save/reopen support in project format 6, retaining support for formats 1–5.

## 0.5.2

- Removed promotional interface copy, empty-state filler, and redundant inspector descriptions.
- Kept functional controls, editing guidance, and calibration information.
