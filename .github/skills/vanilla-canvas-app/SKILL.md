---
name: vanilla-canvas-app
description: 'Patterns et bonnes pratiques senior dev pour une application vanilla JavaScript + Canvas 2D monolithique. Use when: refactoring map-dmtool.js, adding rendering logic, managing state, or improving performance of a canvas-based web app.'
user-invocable: true
disable-model-invocation: false
---

# Vanilla Canvas App — Patterns senior dev

Ce skill regroupe les patterns et anti-patterns pour maintenir une application vanilla JS + Canvas 2D comme [js/map-dmtool.js](js/map-dmtool.js).

## Organisation du code

### Sections thématiques

Dans un fichier monolithique, regrouper le code par domaine :

1. **Globals & State** — toutes les variables d'état en haut
2. **Textures / Assets** — génération procédurale ou chargement
3. **Canvas init & sizing** — initialisation et redimensionnement
4. **Zoom & Pan** — interactions de navigation
5. **Coordinate helpers** — conversion souris ↔ monde
6. **App mode / Tools** — changement de mode et d'outil
7. **Layers logic** — manipulation des données (sol, murs, etc.)
8. **Render engine** — fonctions de dessin
9. **Player view / Minimap / FX** — fonctionnalités annexes
10. **History / Export / Import** — persistance
11. **Mouse / Keyboard events** — entrées utilisateur
12. **Init** — démarrage

### Exemple de structure

```js
/* §1 GLOBALS & STATE */
let state = {};

/* §2 TEXTURES */
const textures = {};

/* §3 CANVAS INIT */
function updateCanvasSize() { /* ... */ }

/* §4 RENDER */
function requestRedraw() { /* ... */ }
function _doRedraw() { /* ... */ }

/* §5 EVENTS */
// mouse / keyboard

/* §6 INIT */
(function init() { /* ... */ })();
```

## Patterns de rendu

### Dirty flag + requestAnimationFrame

Éviter de redessiner à chaque frame si rien n'a changé :

```js
let renderDirty = true;
let _rafId = null;

function requestRedraw() {
  renderDirty = true;
  if (!_rafId) _rafId = requestAnimationFrame(renderLoop);
}

function renderLoop() {
  _rafId = null;
  if (renderDirty) {
    renderDirty = false;
    _doRedraw();
  }
}
```

### Cache de tuiles

Pour les textures procédurales, pré-rendre chaque tuile une fois par taille de cellule :

```js
const _tileCache = new Map();
let _tileCellSize = 0;

function _invalidateTileCache() {
  _tileCache.clear();
  _tileCellSize = cellSize;
}

function _getOrRenderTile(textureName, x, y, s) {
  if (_tileCellSize !== s) _invalidateTileCache();
  const key = `${textureName}:${x}:${y}`;
  if (_tileCache.has(key)) return _tileCache.get(key);
  const oc = document.createElement('canvas');
  oc.width = s; oc.height = s;
  // dessiner la texture
  _tileCache.set(key, oc);
  return oc;
}
```

### Séparation rendering / UI

- Le rendu dessine l'état.
- Les handlers modifient l'état puis appellent `requestRedraw()`.
- Jamais de logique métier complexe dans `_doRedraw()`.

## Gestion de l'état

### Centraliser l'état

Toutes les variables globales en haut du fichier. Éviter les états cachés dans le DOM.

### Cloner avant de stocker

Pour l'historique ou l'export, toujours cloner pour éviter les références partagées :

```js
history.push({
  layer: JSON.parse(JSON.stringify(layer)),
});
```

### Clés de cellule

Utiliser une convention simple et cohérente :

```js
const key = `${x},${y}`;
const [x, y] = key.split(',').map(Number);
```

## Gestion des événements

### Souris

```js
element.addEventListener('mousedown', e => {
  const cell = getCellFromMouse(e);
  if (cell.x < 0 || cell.x >= cols || cell.y < 0 || cell.y >= rows) return;
  isDrawing = true;
  // action
});

element.addEventListener('mousemove', e => {
  if (!isDrawing) return;
  const cell = getCellFromMouse(e);
  // action
});

element.addEventListener('mouseup', () => {
  isDrawing = false;
  saveHistory('action');
});
```

### Clavier

```js
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
});
```

## Anti-patterns à éviter

| Anti-pattern | Pourquoi c'est problématique | Solution |
|--------------|------------------------------|----------|
| Redessiner dans chaque handler | Surcharge CPU, rendu incohérent | `requestRedraw()` + dirty flag |
| Stocker l'état dans le DOM | Difficile à synchroniser | Variables globales + fonctions de mise à jour |
| Muter l'historique | Undo/redo corrompu | Cloner avec `JSON.parse(JSON.stringify(...))` |
| Calculer les coordonnées à plusieurs endroits | Décalages souris | `getCellFromMouse(e)` centralisé |
| Mélanger rendering et logique métier | Code difficile à tester | Séparer `_doRedraw()` des handlers |
| Oublier `ensureFog()` après resize | Fog désynchronisé | Toujours appeler après changement de grille |
| Utiliser `setInterval` pour l'animation | Saccades, batterie | `requestAnimationFrame` |

## Performance

- Limiter le nombre de couches de canvas (3 maximum si possible).
- Invalider le cache de texture uniquement quand `cellSize` change.
- Éviter les allocations dans la boucle de rendu (créer les objets réutilisables en amont).
- Pour le line-of-sight, pré-calculer ou limiter le rayon d'action.

## Testabilité

Même sans framework, on peut isoler les fonctions pures :

```js
function getCellFromMouse(e) { /* pure */ }
function calculateLighting(lights, walls) { /* pure */ }
function fogRect(c1, r1, c2, r2) { /* pure */ }
```

Ces fonctions peuvent être testées dans la console ou dans un petit fichier de test.

## Refactoring progressif

1. Identifier une fonction trop longue.
2. Extraire les helpers purs.
3. Regrouper l'état lié dans un objet (ex: `fxState`).
4. Introduire des modules ES si le projet grossit (`type="module"`).
5. Ajouter des tests sur les fonctions pures avant de refactorer le rendu.

## Ressources

- [map-dmtool-context](../map-dmtool-context/SKILL.md) — contexte spécifique du projet
- [map-dmtool-add-feature](../map-dmtool-add-feature/SKILL.md) — ajouter une feature dans Map DmTool
- [map-dmtool-debug](../map-dmtool-debug/SKILL.md) — diagnostiquer les problèmes
