---
name: map-dmtool-export
description: 'Gérer et étendre les exports/imports de map-dmtool.js : JSON structuré, PNG DM/Player, compatibilité ascendante, et ajout de nouveaux formats. Use when: modifying exportJSON, importJSON, doExportPNG, or adding CSV/JSON export for tokens or initiative.'
user-invocable: true
disable-model-invocation: false
---

# Map DmTool — Export / Import

Ce skill documente la structure des données et les fonctions d'export/import de [js/map-dmtool.js](js/map-dmtool.js).

## Structure du JSON d'export (`exportJSON()`)

```json
{
  "version": 1,
  "format": "map-beta",
  "cols": 20,
  "rows": 15,
  "cellSize": 40,
  "colorPalette": ["#f5f5dc", "#8B4513", ...],
  "mapName": "map-beta",
  "bgImageDataURL": null,
  "floorLayer": { "0,0": { "color": "#f5f5dc", "texture": "" } },
  "objectLayer": { "0,0": { "type": "wall-edge-top", "color": "#8B4513" } },
  "emojiLayer": { "0,0": { "emoji": "🎮", "size": 1, "emitsLight": false } },
  "lightLayer": { "0,0": { "type": "torch" } },
  "noteLayer": { "0,0": { "icon": "📝", "text": "..." } },
  "labelLayer": { "0,0": { "text": "Zone", "color": "#ffffff" } },
  "ambientLight": 1.0,
  "fog": [[true, true, ...], ...],
  "tokens": [{ "e": "⚔️", "l": "Warrior", "s": 1, "x": 0, "y": 0, "hp": 10, "maxHp": 10, "visible": true, "tags": "" }],
  "tokenLibrary": [{ "e": "⚔️", "l": "Warrior", "s": 1 }],
  "initList": [{ "name": "Warrior", "score": 15, "tokIdx": null, "hp": 10, "maxHp": 10, "ac": 15, "dead": false, "conditions": [], "exhaustion": 0, "emoji": "⚔️", "notes": "" }],
  "initCur": 0,
  "initRound": 1,
  "settings": {
    "gridColor": "#ffffff",
    "gridOpacity": 20,
    "fogDmOpacity": 95,
    "peekOpacity": 15,
    "dmTokenOpacity": 60
  },
  "fxState": { "fog": false, "particles": false, "vignette": false, "lightning": false, "sunrays": false }
}
```

## Fonctions principales

- `exportJSON()` — génère un fichier `.json` téléchargeable
- `importJSON(ev)` — lit un fichier `.json` et restaure l'état
- `exportPNG()` — ouvre la modal d'export PNG
- `doExportPNG('dm' | 'player')` — génère un fichier `.png` téléchargeable

## Ajouter un champ sans casser la compatibilité

### 1. Dans `exportJSON()`

Ajouter le champ au payload :

```js
const data = {
  // ... champs existants ...
  myNewField: myNewField,
};
```

### 2. Dans `importJSON()`

Lire le champ avec une valeur par défaut :

```js
myNewField = data.myNewField !== undefined ? data.myNewField : defaultValue;
```

### 3. Dans `_restoreState()` (si le champ fait partie de l'historique)

```js
myNewField = JSON.parse(JSON.stringify(s.myNewField || defaultValue));
```

### 4. Dans `saveHistory()`

```js
history.push({
  // ... champs existants ...
  myNewField: JSON.parse(JSON.stringify(myNewField)),
});
```

## Export PNG

`doExportPNG(mode)` crée un canvas temporaire `tc` et y redessine :

1. Fond blanc
2. Image de fond (`bgImage`)
3. `floorLayer`
4. `objectLayer` + `emojiLayer`
5. `labelLayer`
6. `fog` (opacité différente selon `mode`)
7. `tokens`

### Différences DM vs Player

- **DM** : fog semi-transparent (basé sur `fogDmOpacity`)
- **Player** : fog opaque (100%)

Si une nouvelle couche doit apparaître sur le PNG, l'ajouter entre les étapes existantes.

## Ajouter un export CSV

### Exemple : exporter les tokens

```js
function exportTokensCSV() {
  const rows = [['emoji', 'label', 'x', 'y', 'hp', 'maxHp', 'visible']];
  tokens.forEach(t => rows.push([t.e, t.l, t.x, t.y, t.hp, t.maxHp, t.visible]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tokens.csv';
  a.click();
}
```

### Exemple : exporter l'initiative

```js
function exportInitiativeCSV() {
  const rows = [['name', 'score', 'hp', 'maxHp', 'ac', 'dead', 'conditions', 'exhaustion']];
  initList.forEach(it => rows.push([it.name, it.score, it.hp, it.maxHp, it.ac, it.dead, it.conditions.join(';'), it.exhaustion]));
  // ... téléchargement ...
}
```

## Migration de version

Si le format change de manière incompatible, incrémenter `version` dans `exportJSON()` et ajouter une logique de migration dans `importJSON()` :

```js
if (data.version === 1) {
  // migration vers version 2
  data.myNewField = migrateFromV1(data);
}
```

## Points d'attention

- `bgImageDataURL` peut être très volumineux ; l'export JSON reste un fichier téléchargé, donc c'est acceptable.
- Toujours fournir une valeur par défaut à l'import pour préserver la compatibilité ascendante.
- L'export PNG ne capture pas les effets FX (`fxCanvas`) ni la minimap par défaut ; ajouter si nécessaire.
- Les layers utilisent des clés `"x,y"` ; s'assurer que l'import ne mélange pas les types de clés.
