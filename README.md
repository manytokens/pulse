# Pulse

A small web tool for measuring and verifying the BPM of music, built for
rhythm-game charting workflows. It combines a tap-tempo meter with automatic
audio analysis and a DAW-style spectrum player for aligning a beat grid to the
actual drum hits.

## Features

### Tap tempo
- Tap along (click or `Space`) to measure BPM with live stability feedback.
- Synchronized metronome with selectable time signatures and a beat pad that
  follows the locked tempo.

### Audio analysis
- Upload an audio file (click or drag & drop anywhere), or record the
  microphone / system audio.
- Automatic BPM, beat positions, and confidence via Essentia.js
  (RhythmExtractor2013), running in a Web Worker.
- Editable beat grid: BPM, grid origin (ms), time signature. The grid extends
  before the origin too (bars 0, -1, ...), so you can anchor the origin on a
  clear drum hit later in the song.

### Spectrum player
- Waveform, spectrogram, and live spectrum views with a bar/beat ruler.
- The spectrogram uses an onset-focused palette so drum hits stand out, and is
  rendered once per tile in background workers — seeking never shows an empty
  area.
- The live spectrum follows playback in real time; while paused it shows the
  spectrum at the playhead position, so you can scrub through a song and watch
  it change.
- Synchronized metronome clicks, playback rate control, and a millisecond
  position readout for transferring timing values into chart editors.

### osu! export
- One-click `.osz` export: the current BPM / offset / meter is written as a
  timing point, and the audio is re-encoded to Ogg Vorbis (VBR quality 6.5,
  roughly 208 kbps) in a Web Worker.

## Controls

| Input | Action |
| --- | --- |
| `Space` | Play / pause |
| Mouse wheel | Seek by one beat (snapped to the grid) |
| `Shift` + wheel | Seek by 10 ms |
| `Ctrl` + wheel | Zoom at the mouse position |
| Middle drag / `Alt` + drag | Pan the view |
| Click (main view or ruler) | Seek; drag the ruler to scrub |
| `←` / `→` | Previous / next beat |
| `Shift` + `←` / `→` | Previous / next bar |
| `Ctrl` + `←` / `→` | Nudge the grid origin by 10 ms |
| Drag the orange `1` flag | Move the grid origin |
| Click the BAR / MS readouts | Type an exact position and jump to it |

## Development

```bash
npm install
npm run dev        # start the Vite dev server
npm test           # run unit tests (node --test, TS via native type stripping)
npm run typecheck  # vue-tsc --noEmit
npm run build      # production build into dist/
```

TypeScript + Vue 3 (vapor mode) + Vite. Audio decoding and playback use the Web Audio API;
spectrogram tiles are computed in Web Workers.
