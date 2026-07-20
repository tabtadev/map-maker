---
name: map-dmtool-add-feature
description: 'Guide l''ajout d''une nouvelle fonctionnalité dans map-dmtool.js / map-dmtool.html : nouvel outil build/play, nouvel onglet, nouvelle modal, nouvelle couche de données, ou nouvel effet visuel. Use when: extending Map DmTool, adding tools, adding UI panels, or adding game mechanics.'
user-invocable: true
disable-model-invocation: false
---

# Map DmTool — Ajouter une fonctionnalité

Ce skill fournit une checklist pour étendre [map-dmtool.html](map-dmtool.html) et [js/map-dmtool.js](js/map-dmtool.js) sans casser l'architecture existante.

## Avant de commencer

1. Identifier si la feature concerne le mode `build`, le mode `play`, ou les deux.
2. Décider si elle nécessite :
   - un nouvel état (layer, variable globale)
   - une nouvelle UI (bouton, sidebar, modal)
   - un nouvel handler souris
   - une mise à jour du rendu
   - une mise à jour de l'historique
   - une mise à jour de l'export/import JSON
   - une mise à jour du Player View et/ou de l'export PNG

## Checklist générale

### 1. État (js/map-dmtool.js §1)

Ajouter les variables globales dans la section `GLOBALS & STATE` :

```js
let myNewState = defaultValue;
```

Si c'est une nouvelle couche de cellules, utiliser le pattern `"x,y"` :

```js
let myNewLayer = {};
```

### 2. UI (map-dmtool.html)

- Ajouter le bouton / panneau / modal dans le bon conteneur (`build-only`, `play-only`, ou commun).
- Utiliser les classes existantes : `toolbar-btn`, `sidebar-section`, `panel-title`, `modal-overlay`, `modal-card`.
- Donner un `id` unique et un `onclick="myNewFunction()"`.

### 3. Fonctions de contrôle (js/map-dmtool.js)

Créer les fonctions d'activation / désactivation :

```js
function setMyNewTool(active) {
  // Mettre à jour l'état
  // Mettre à jour les classes .active des boutons
  updateHUD();
  requestRedraw();
}
```

### 4. Handlers souris (js/map-dmtool.js §23)

Selon le mode, modifier :

- `handleBuildMouseDown(cell, e)`
- `handleBuildMouseMove(cell, e)`
- `handleBuildMouseUp(e)`
- `handlePlayMouseDown(cell, e)`
- `handlePlayMouseMove(cell, e)`
- `handlePlayMouseUp(e)`

Exemple de pattern pour un outil de placement :

```js
if (buildTool === 'myTool') {
  const k = `${cell.x},${cell.y}`;
  myNewLayer[k] = { /* données */ };
  saveHistory('✨ My tool');
  requestRedraw();
  return;
}
```

### 5. Rendu (js/map-dmtool.js §15)

Ajouter l'affichage dans `_doRedraw()` à l'endroit logique (sol → murs → objets → lumières → notes/labels → grid → fog → tokens).

```js
for (const [k, v] of Object.entries(myNewLayer)) {
  const [x, y] = k.split(',').map(Number);
  // dessiner
}
```

Si une prévisualisation est nécessaire, l'ajouter dans `drawOverlay()`.

### 6. Historique (js/map-dmtool.js §19)

Modifier `saveHistory()` pour inclure la nouvelle couche :

```js
history.push({
  // ... champs existants ...
  myNewLayer: JSON.parse(JSON.stringify(myNewLayer)),
});
```

Modifier `_restoreState(s)` pour la restaurer :

```js
myNewLayer = JSON.parse(JSON.stringify(s.myNewLayer || {}));
```

### 7. Export / Import JSON (js/map-dmtool.js §20)

Dans `exportJSON()`, ajouter au payload :

```js
const data = {
  // ... champs existants ...
  myNewLayer,
};
```

Dans `importJSON()`, lire et appliquer :

```js
if (data.myNewLayer) myNewLayer = data.myNewLayer;
```

### 8. Player View (js/map-dmtool.js §16)

Si la feature doit être visible des joueurs, mettre à jour `redrawPlayer()` en dupliquant la logique de rendu ajoutée à `_doRedraw()`.

### 9. Export PNG (js/map-dmtool.js §21)

Si la feature doit apparaître sur l'export, mettre à jour `doExportPNG()`.

### 10. HUD et raccourcis clavier

- Mettre à jour `updateHUD()` si l'outil a un nom / couleur à afficher.
- Ajouter un raccourci dans le listener `keydown` (§29) si pertinent.

## Patterns par type de feature

### Nouvel outil Build

1. Ajouter un bouton dans `#buildSidebar`.
2. Ajouter `case 'myTool':` dans `setBuildTool()`.
3. Gérer `handleBuildMouseDown/Move/Up`.
4. Dessiner dans `_doRedraw()`.
5. Sauvegarder dans l'historique.

### Nouvel outil Play

1. Ajouter un bouton dans `#playSidebar`.
2. Ajouter `case 'myTool':` dans `setPlayTool()`.
3. Gérer `handlePlayMouseDown/Move/Up`.
4. Dessiner dans `_doRedraw()` (souvent après le fog).

### Nouvelle modal

1. Copier la structure d'une modal existante (ex: `#noteModal`).
2. Créer `openMyModal()`, `closeMyModal()`, `saveMyModal()`.
3. Fermer sur clic extérieur dans le listener `document.addEventListener('click', ...)`.

### Nouvel effet visuel

1. Ajouter une case dans `fxState`.
2. Ajouter une checkbox dans la section FX de `#buildSidebar`.
3. Implémenter le rendu dans `applyFX()`.
4. Démarrer/arrêter la boucle via `toggleFX()`.

## Anti-patterns à éviter

- Ne pas modifier `cols` / `rows` sans appeler `updateCanvasSize()` et `ensureFog()`.
- Ne pas oublier `requestRedraw()` après un changement d'état visuel.
- Ne pas stocker de références mutables dans l'historique : toujours cloner (`JSON.parse(JSON.stringify(...))`).
- Ne pas ajouter de logique de rendu lourde directement dans les handlers souris.
