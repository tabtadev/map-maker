# Map DmTool

Browser-based tool for creating and managing interactive TTRPG battle maps. Demo: https://tabtadev.github.io/map-maker/index.html

![Example](/Animation.gif)

---

## Map DmTool — Unified Map Studio

The all-in-one map creation and play tool for Dungeon Masters.

**Build Mode**
- Draw terrain with 15 procedural textures (stone, wood, water, grass, etc.)
- Place walls, doors, windows, and stairs along cell edges (full-edge rendering)

- Room builder: draw freeform rooms with auto-walls
- Add 6 types of light sources with dynamic glow, flicker, and line-of-sight
- Place emojis from 10 categories with adjustable size
- Notes and labels on any cell
- Shared color palette accessible from floor and wall tools
- Full undo/redo history, minimap, background image support

**Play Mode**
- Fog of war with brush and rectangle reveal/fog tools
- Token system: place, move, edit HP, labels, tags, visibility
- Initiative tracker with round counter
- Dice roller (d4–d20 + custom)
- Tabbed right panel (Tokens / Initiative / Dice) for a clean UI
- DM peek, player view window, distance measurement

**Visual Effects**
- Fog overlay with animated wisps
- Particles: rain, snow, embers
- Vignette with color and intensity controls
-  Lightning with configurable frequency and intensity
-  Sunrays with angle, color, and intensity

**Controls**
- Ctrl+scroll to zoom, Space+drag to pan
- Ctrl+Z / Ctrl+Y for undo/redo
- Full export/import (JSON)

---

## Structure

```
index.html          Landing page
map-dmtool.html     Map DmTool (unified app)
css/
  shared.css        Shared styles
  map-dmtool.css    Map DmTool styles
js/
  map-dmtool.js     Map DmTool engine
```


