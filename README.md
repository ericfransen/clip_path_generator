# ClipPath Generator

An interactive, multi-layer CSS `clip-path` generator designed for precision tracing and complex shape creation.

Check out a live demo here:

[CLIP PATH GENERATOR](https://ericfransen.github.io/clip_path_generator/)

## Key Features

- **Multi-Layer Support:** Create, rename, reorder, and toggle visibility for multiple overlapping clip-paths.
- **Image Tracing:** Upload a background image to trace precise paths over. The canvas automatically adjusts to the image's natural dimensions.
- **Interactive Editor:**
    - Drag coordinates to move them.
    - Drag canvas edges or corners to resize (including a proportional resize handle in the bottom-left and top-right).
    - Lock clip-path shapes to resize canvas without shape distortion.
- **Point Precision:** Select individual nodes to add new points before/after or delete them.
- **Real-time CSS:** Generates standard and `-webkit-` prefixed CSS instantly.
- **Real-time HTML:** Generates div wrapper for canvas dimensions for easy portability.
- **Smart History:** Full Undo/Redo support for all actions.
- **Live Code Editing:** Paste `polygon()` coordinates directly into the output box to update the shapes visually.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

4. **Preview the production build:**
   ```bash
   npm run preview
   ```

## Tech Stack

- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
