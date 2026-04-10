# Lithophane Generator

Browser-based tool that converts photos into 3D-printable lithophane STL files. Runs entirely client-side — no backend or account required.

## Features

- Upload JPEG or PNG images
- Automatic image suitability scoring (Poor / Marginal / Good / Excellent)
- Three contrast modes: Linear, Quantized (layer steps), Dithered (halftone)
- Interactive 3D preview with orbit controls
- Standard and 2-color AMS/multi-material modes
- Undo / redo with 20-snapshot history
- Binary STL export ready for slicing

## Requirements

- [Node.js](https://nodejs.org) v18 or higher
- npm (included with Node.js)

## Installation

```bash
git clone https://github.com/avinashpai94/lithophane-generator.git
cd lithophane-generator
npm install
```

## Usage

### Development

```bash
npm run dev
```

Opens at `http://localhost:5173` with hot reload.

### Production build

```bash
npm run build
npm run preview
```

The built output is in `dist/` — serve it with any static file host (Netlify, Vercel, GitHub Pages, etc.).

### Tests

```bash
npx vitest run
```

54 tests across image processing, mesh generation, STL export, and history management.

## Recommended print settings (Bambu Lab)

| Setting | Value |
|---|---|
| Nozzle | 0.4mm |
| Layer height | 0.2mm |
| Filament | White PETG or PLA |
| Supports | None |
| Orientation | Face down on bed |

For dithered mode, a pixel pitch of 0.8mm at 2 dither levels gives the best halftone contrast.

## Tech stack

- [React 19](https://react.dev)
- [Three.js](https://threejs.org) — 3D preview
- [Vite](https://vite.dev) — build tool
- [Vitest](https://vitest.dev) — test runner
