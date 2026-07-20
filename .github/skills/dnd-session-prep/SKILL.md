---
name: dnd-session-prep
description: 'Préparer et animer une session D&D avec map-dmtool.js : création de carte, placement des tokens, configuration du fog of war, initiative, player view, et checklist de session. Use when: preparing a D&D session, running combat, managing tokens, or using the player view with Map DmTool.'
user-invocable: true
disable-model-invocation: false
---

# D&D Session Prep — avec Map DmTool

Ce skill aide un MJ à utiliser [map-dmtool.html](map-dmtool.html) pour préparer et animer une session D&D.

## Workflow de préparation

### 1. Créer la carte (mode Build)

1. Ouvrir [map-dmtool.html](map-dmtool.html).
2. Définir la taille de grille (`Grid` → `cols × rows`).
3. Choisir une taille de cellule adaptée (`Cell` → +/-).
4. Importer une image de fond si besoin (`Image`).
5. Dessiner le sol avec l'outil **Floor** et les textures.
6. Ajouter les murs, portes et fenêtres avec l'outil **Walls**.
7. Placer les objets décoratifs avec l'outil **Objects**.
8. Ajouter les lumières avec l'outil **Lights**.
9. Ajouter des notes DM et des labels de zone.

### 2. Préparer les tokens (mode Play)

1. Passer en mode **Play**.
2. Créer les tokens PJ/PNJ/Monstres dans la bibliothèque.
3. Placer les tokens sur la carte avec l'outil **Place**.
4. Régler la visibilité : certains tokens peuvent être cachés aux joueurs (`visible: false`).

### 3. Configurer le Fog of War

1. Utiliser **Full Fog** pour tout cacher.
2. Révéler les zones de départ avec **Reveal**.
3. Ajuster l'opacité DM dans **Settings** si nécessaire.

### 4. Préparer l'initiative

1. Ouvrir l'onglet **Initiative**.
2. Ajouter les combattants manuellement ou via **Quick Add from Tokens**.
3. Trier par score si besoin.
4. Noter les HP/AC et conditions éventuelles.

### 5. Tester avant la session

1. Ouvrir le **Player View**.
2. Vérifier ce que les joueurs voient (fog, tokens visibles).
3. Tester le **Peek mode** (V) pour le MJ.
4. Exporter la carte en JSON et PNG comme backup.

## Pendant la session

### Révéler progressivement la carte

- Outil **Reveal** + brush : découvrir au fur et à mesure.
- Outil **Rectangle** : révéler une grande zone d'un coup.
- Raccourci **F** : basculer reveal/fog.

### Gérer les tokens

- **T** : placer un token.
- **M** : déplacer / inspecter un token.
- Double-cliquer un token pour éditer son nom, ses HP, sa visibilité.
- Les tokens non visibles apparaissent semi-transparents pour le MJ (opacité réglable dans Settings).

### Gérer le combat

- **N** : passer au tour suivant dans l'initiative.
- Utiliser les boutons 🗡️ / 💚 pour appliquer dégâts/soins.
- Utiliser ⚙️ pour ajouter des conditions (aveuglé, empoisonné, etc.) ou des notes DM.
- Glisser-déposer les entrées d'initiative pour réordonner.

### Lancer les dés

- Onglet **Dice** : d4, d6, d8, d10, d12, d20, d100.
- Lancer personnalisé : `count`d`faces`+`mod`.
- Le résultat s'affiche dans le log et en popup sur la carte.

## Conseils de conception de rencontre

| Élément | Recommandation |
|---------|----------------|
| Taille de grille | 20×15 minimum pour un combat classique ; 30×20+ pour les grandes scènes |
| Cell size | 40–60 px pour une lisibilité confortable en Player View |
| Lumière | Utiliser `torch` (R:3) pour les couloirs, `daylight` (R:8) pour l'extérieur |
| Line of sight | Les murs bloquent la lumière ; les fenêtres la laissent passer |
| Fog initial | Tout cacher, révéler seulement le point d'entrée |
| Tokens monstres | Placer en mode invisible, les révéler quand les PJ les découvrent |

## Checklist avant session

- [ ] Carte terminée en mode Build
- [ ] Image de fond importée si nécessaire
- [ ] Tokens PJ et PNJ placés
- [ ] Tokens monstres placés (invisibles si embuscade)
- [ ] Fog configuré (tout caché sauf zone de départ)
- [ ] Initiative pré-remplie
- [ ] Player View testé sur un second écran
- [ ] JSON exporté comme backup
- [ ] PNG exporté pour partage hors ligne

## Raccourcis clavier utiles en session

| Touche | Action |
|--------|--------|
| B | Mode Build |
| P | Mode Play |
| G | Afficher/masquer la grille |
| V | Peek mode (MJ) |
| N | Tour d'initiative suivant |
| F | Basculer reveal/fog |
| R | Brush fog |
| X | Rectangle fog |
| T | Placer token |
| M | Déplacer / inspecter token |
| D | Mesurer |
| Ctrl+S | Sauvegarder JSON |

## Dépannage rapide en session

- **Le Player View ne s'ouvre pas** : vérifier que le navigateur ne bloque pas les popups.
- **Les joueurs voient un token caché** : vérifier `visible` dans l'éditeur de token.
- **Le fog ne se révèle pas** : vérifier que `fogAction` est sur `reveal`.
- **L'initiative ne passe pas au suivant** : vérifier qu'au moins un combattant n'est pas `dead`.
