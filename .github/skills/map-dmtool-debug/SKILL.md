---
name: map-dmtool-debug
description: 'Diagnostiquer et corriger les bugs dans map-dmtool.js / map-dmtool.html : rendu canvas, coordonnées souris, historique, fog, tokens, initiative, export/import. Use when: Map DmTool behaves unexpectedly, canvas is blank, tools do not respond, undo/redo breaks, or fog/tokens disappear.'
user-invocable: true
disable-model-invocation: false
---

# Map DmTool — Debug

Ce skill aide à diagnostiquer les problèmes courants dans [js/map-dmtool.js](js/map-dmtool.js) et [map-dmtool.html](map-dmtool.html).

## Premier diagnostic

1. Ouvrir la console du navigateur (F12).
2. Vérifier s'il y a une erreur JS avec un numéro de ligne.
3. Vérifier que `cols`, `rows`, `cellSize` et `canvas.width` sont cohérents :

```js
cols; rows; cellSize; canvas.width; canvas.height;
```

4. Vérifier que `appMode` vaut bien `'build'` ou `'play'`.

## Problèmes courants et solutions

### Le canvas est vide / noir

- Vérifier `updateCanvasSize()` : `canvas.width` et `canvas.height` doivent valoir `cols * cellSize`.
- Vérifier que `_doRedraw()` n'a pas retourné tôt (`if (w === 0 || h === 0) return;`).
- Vérifier que `requestRedraw()` est bien appelé après un changement d'état.
- Vérifier que `_rafId` n'est pas bloqué (le flag `renderDirty` doit passer à `true`).

### Les outils ne répondent pas

- Vérifier `buildTool` / `playTool` dans la console.
- Vérifier que `spaceHeld` n'est pas `true` (la barre d'espace active le pan).
- Vérifier que `isDrawing` est bien mis à `true` dans `handleBuildMouseDown` / `handlePlayMouseDown`.
- Vérifier que `getCellFromMouse(e)` retourne des coordonnées valides (`0 <= x < cols`, `0 <= y < rows`).

### Les coordonnées souris sont décalées

- `getCellFromMouse(e)` utilise `overlay.getBoundingClientRect()` et le ratio `overlay.width / r.width`.
- Si le CSS `transform: scale(zoom)` est appliqué sur `canvasWrapper`, le rectangle CSS change mais le ratio gère la conversion.
- Vérifier que `canvasWrapper` et `overlay` ont les mêmes dimensions logiques.

### Le fog disparaît ou est mal dimensionné

- Vérifier `fog.length`, `fogRows`, `fogCols`.
- Après `resizeGrid()` ou `fitGridToImage()`, `ensureFog()` doit être appelé.
- Le fog est un tableau 2D : `fog[row][col]`.

### Les textures ne s'affichent pas

- Vérifier `_tileCache` : il est invalidé par `_invalidateTileCache()` quand `cellSize` change.
- Vérifier que le nom de texture correspond à une clé de l'objet `textures`.

### Undo/Redo ne fonctionne pas

- Vérifier que `saveHistory(label)` est appelé après chaque action utilisateur.
- Vérifier que `historyIndex` est bien décrémenté/incrémenté dans `undo()` / `redo()`.
- Vérifier que `_restoreState()` clone bien les objets (pas de références partagées).

### Les tokens ne s'affichent pas

- Vérifier que `appMode === 'play'`.
- Vérifier `tokens.length` et les propriétés `x`, `y`, `e`, `visible`.
- Vérifier que le rendu des tokens dans `_doRedraw()` n'est pas masqué par le fog (sauf si `dmPeek`).

### L'initiative est bloquée

- Vérifier `initList.length`, `initCur`, `initRound`.
- `nextInitiative()` boucle sur les combattants vivants ; si tous sont `dead`, elle peut boucler.
- Vérifier que `renderInitList()` met bien à jour le DOM.

### Export/Import JSON corrompu

- Vérifier que `exportJSON()` inclut tous les champs nécessaires.
- Vérifier que `importJSON()` gère les anciennes versions (champs manquants).
- Vérifier que `bgImageDataURL` n'est pas trop grand pour `localStorage` (ici export fichier, donc OK).

## Scénarios de test rapides

### Test A — Création minimale

1. Ouvrir [map-dmtool.html](map-dmtool.html).
2. Cliquer sur une couleur, sélectionner l'outil Floor, dessiner quelques cases.
3. Passer en mode Play.
4. Vérifier que le fog couvre toute la grille.
5. Utiliser Reveal pour découvrir les cases.

### Test B — Historique

1. Dessiner un sol.
2. Ajouter un mur.
3. Appuyer sur Ctrl+Z : le mur doit disparaître.
4. Appuyer sur Ctrl+Y : le mur doit réapparaître.

### Test C — Tokens + Initiative

1. Passer en mode Play.
2. Ajouter un token depuis la bibliothèque.
3. Ouvrir l'onglet Initiative, ajouter un combattant.
4. Cliquer sur Next ou appuyer sur N.

### Test D — Export/Import

1. Créer une carte avec sol + mur + token.
2. Exporter en JSON.
3. Recharger la page, importer le JSON.
4. Vérifier que tout est restauré.

## Outils de validation

- `get_errors` sur [js/map-dmtool.js](js/map-dmtool.js) pour détecter les erreurs de syntaxe.
- Console navigateur pour les erreurs d'exécution.
- `console.log` stratégique sur les variables d'état (`buildTool`, `playTool`, `appMode`, `isDrawing`, `tokens`, `initList`).

## Checklist avant de demander de l'aide

- [ ] Aucune erreur dans la console
- [ ] `cols`, `rows`, `cellSize` cohérents
- [ ] `appMode` correct
- [ ] `requestRedraw()` appelé après le changement
- [ ] `saveHistory()` appelé si l'action doit être annulable
- [ ] Export JSON contient les nouvelles données
- [ ] Player View testé si pertinent
