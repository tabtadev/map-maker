---
name: map-dmtool-context
description: 'Contexte architectural minimal pour travailler sur map-dmtool.js et map-dmtool.html. Use when: editing the Map DmTool canvas app, adding features, debugging rendering, modifying layers, or changing build/play modes.'
user-invocable: false
disable-model-invocation: false
---

# Map DmTool — Contexte architectural

Ce skill résume la structure de [map-dmtool.html](map-dmtool.html) et [js/map-dmtool.js](js/map-dmtool.js) pour éviter d'avoir à réexplorer le projet à chaque session.

## Fichiers concernés

- [map-dmtool.html](map-dmtool.html) — UI complète (toolbar, sidebars, modals)
- [js/map-dmtool.js](js/map-dmtool.js) — logique monolithique vanilla JS (~3300 lignes)
- [css/map-beta.css](css/map-beta.css) — styles spécifiques
- [css/shared.css](css/shared.css) — styles communs

## Architecture générale

Application **vanilla JS + Canvas 2D** avec deux modes :

- `build` — création de la carte (sol, murs, objets, lumières, notes, labels)
- `play` — fog of war, tokens, initiative, mesure

Les modes sont mutuellement exclusifs via `setAppMode('build' | 'play')`.

## Canvas

Trois canvas superposés dans [map-dmtool.html](map-dmtool.html) :

- `mainCanvas` — rendu principal (sol, murs, objets, lumières, notes, fog, tokens)
- `overlayCanvas` — prévisualisations d'outils (rectangles, brush, mesure)
- `fxCanvas` — effets visuels (brouillard atmosphérique, particules, vignette, éclairs, rayons de soleil)

Taille des canvas : `cols * cellSize` × `rows * cellSize`.

## Variables d'état principales

```js
let cellSize = 40, cols = 20, rows = 15, zoom = 1, showGrid = true;
let appMode = 'build';
let buildTool = 'floor';   // floor | wall | object | light | erase | note | label
let playTool = 'fogBrush'; // fogBrush | fogRect | token | moveToken | measure
let fogAction = 'reveal';  // reveal | fog
```

## Layers de données

Toutes les couches utilisent des clés de cellule sous forme de chaîne `"x,y"`.

| Layer | Variable | Contenu typique |
|-------|----------|-----------------|
| Sol | `floorLayer` | `{ color, texture }` |
| Murs / portes / fenêtres | `objectLayer` | `{ type, color }` (`wall-edge-*`, `door-edge-*`, `window-edge-*`) |
| Objets décoratifs | `emojiLayer` | `{ emoji, size, emitsLight, lightType }` |
| Lumières | `lightLayer` | `{ type }` (torch, candle, lantern, bonfire, moonlight, daylight) |
| Notes DM | `noteLayer` | `{ icon, text }` |
| Labels de zone | `labelLayer` | `{ text, color }` |

## Fog of War

```js
let fog = [];      // tableau 2D [rows][cols] de booléens
let fogCols = 0, fogRows = 0;
```

- `true` = case dans le brouillard (cachée)
- `false` = case révélée
- Initialisé via `initFog()` et redimensionné via `ensureFog()`

## Tokens

```js
let tokens = [];          // tokens placés sur la carte
let tokenLibrary = [];    // bibliothèque de tokens prédéfinis
let selectedToken = null; // token de la bibliothèque sélectionné
let editTokenIdx = null;  // index du token en cours d'édition
```

Un token possède : `e` (emoji), `l` (label), `s` (taille), `x`, `y`, `hp`, `maxHp`, `visible`, `tags`.

## Initiative

```js
let initList = [], initCur = 0, initRound = 1;
```

Chaque entrée : `name`, `score`, `tokIdx` (lien vers `tokens`), `hp`, `maxHp`, `ac`, `dead`, `conditions`, `exhaustion`, `emoji`, `notes`.

## Historique (undo/redo)

```js
let history = [], historyIndex = -1;
const MAX_HISTORY = 50;
```

- Sauvegarder un état : `saveHistory(label)`
- Restaurer : `_restoreState(history[historyIndex])`
- L'historique capture : `floor`, `objects`, `emojis`, `lights`, `notes`, `labels`, `fog`, `tokens`

## Fonctions de rendu clés

- `updateCanvasSize()` — redimensionne les 3 canvas et invalide le cache de tuiles
- `requestRedraw()` — marque le rendu comme sale et déclenche `renderLoop()`
- `_doRedraw()` — rendu principal complet
- `drawOverlay()` — prévisualisations d'outils
- `calculateLighting()` — calcule la carte d'éclairage avec line-of-sight
- `applyFX()` — rend les effets visuels sur `fxCanvas`
- `drawMinimap()` — rend la minimap

## Conventions UI

- Boutons d'outils build : `setBuildTool('floor' | 'wall' | 'object' | 'light' | 'erase' | 'note' | 'label')`
- Boutons d'outils play : `setPlayTool('fogBrush' | 'fogRect' | 'token' | 'moveToken' | 'measure')`
- Action fog : `setFogAction('reveal' | 'fog')`
- Onglets play : `setPlayTab('tokens' | 'init' | 'dice')`

## Points d'attention

- Les coordonnées souris passent par `getCellFromMouse(e)` qui tient compte du zoom et du rectangle du canvas.
- Le cache de tuiles `_tileCache` est invalidé quand `cellSize` change.
- Le rendu est piloté par un flag `renderDirty` + `requestAnimationFrame` (`_rafId`).
- Le Player View (`openPlayerView()`) duplique une partie du rendu dans une nouvelle fenêtre.
- L'export PNG (`doExportPNG('dm' | 'player')`) reconstruit le rendu sur un canvas temporaire.
