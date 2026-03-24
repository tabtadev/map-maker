/* ═══════════════════════════════════════════════════════════
   MAP-BETA.JS — Unified map creation + fog of war engine
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ─────────────────────────────────────────────────────────
   §1  GLOBALS & STATE
   ───────────────────────────────────────────────────────── */
const canvas = document.getElementById('mainCanvas'),
      ctx    = canvas.getContext('2d');
const overlay = document.getElementById('overlayCanvas'),
      ox     = overlay.getContext('2d');
const fxCanvas = document.getElementById('fxCanvas'),
      fxCtx   = fxCanvas.getContext('2d');
const miniCanvas = document.getElementById('minimapCanvas'),
      miniCtx   = miniCanvas.getContext('2d');

let cellSize = 40, cols = 20, rows = 15, zoom = 1, showGrid = true;

// App mode: 'build' or 'play'
let appMode = 'build';

// Build mode state
let buildTool = 'floor';     // floor | wall | object | light | erase | note | label
let wallSub = null;           // door-top, window-left, stairs-up, etc.
let selectedColor = '#f5f5dc';
let selectedTexture = '';
let selectedEmoji = '🎮';
let emojiSizeVal = 1.0;
let objTool = 'place';       // place | moveEmoji
let currentLightType = 'torch';
let ambientLight = 1.0;
let floorMode = 'brush';     // brush | fillRect
let eraseMode = 'brush';     // brush | fillRect

// Play mode state
let playTool = 'fogBrush';   // fogBrush | fogRect | token | moveToken | measure
let fogAction = 'reveal';    // reveal | fog
let dmPeek = false;

// Layers (build)
let floorLayer = {};
let objectLayer = {};
let emojiLayer = {};
let lightLayer = {};
let noteLayer = {};
let labelLayer = {};

// Fog layer (play) — 2D boolean array
let fog = [];
let fogCols = 0, fogRows = 0;

// Tokens (play)
let tokens = [];
let selectedToken = null;  // library selection
let editTokenIdx = null;   // placed token being edited

// Initiative
let initList = [], initCur = 0, initRound = 1;

// Player view
let playerWin = null;
let playerShowGrid = false;

// Measure
let measureA = null, measureB = null;

// Background image
let bgImage = null, bgImageDataURL = null;

// Drawing state
let isDrawing = false;
let fillStartCell = null, rectStart = null, rectCur = null;
let movingEmojiKey = null;
let movingTokenIdx = null, movingTokenOffset = {x:0,y:0};
let lastPos = null;
let currentRightClickCell = null;

// House draw (room builder)
let houseDrawActive = false;
let houseCells = new Set();
let houseIsDrawing = false;
let houseErasing = false;

// History
let history = [], historyIndex = -1;
const MAX_HISTORY = 50;

// Light defs (6 types)
const lightTypes = {
  torch:     {color:'#ffaa00', range:3, intensity:0.75, flicker:true},
  candle:    {color:'#ffe4b5', range:1, intensity:0.5,  flicker:true},
  lantern:   {color:'#fff8dc', range:5, intensity:0.85, flicker:false},
  bonfire:   {color:'#ff4400', range:7, intensity:0.95, flicker:true},
  moonlight: {color:'#b8c8ff', range:6, intensity:0.6,  flicker:false},
  daylight:  {color:'#ffffff', range:8, intensity:1.0,  flicker:false}
};
let flickerOffsets = {};

// Colors
let colorPalette = ['#f5f5dc','#8B4513','#228B22','#4169E1','#808080','#DAA520','#2F4F4F','#D2691E','#4B0082','#DC143C','#00CED1','#FFD700','#FF6347','#9370DB','#20B2AA','#FF69B4','#32CD32','#FF8C00','#BA55D3','#1E90FF'];

// Emojis
const emojiCategories = {
  characters: ['🧙','🧝','🧛','🧟','🧜','🦸','🦹','👤','👥','🤴','👸','💂','�','🏃','🎤'],
  monsters:   ['👹','👺','💀','👻','🐉','🐊','🕷️','🦇','🐺','🐍','🦎','👿','🦂','👾','🐲'],
  weapons:    ['⚔️','🗡️','🏹','🔫','🪓','🛡️','💣','🔱','🏴‍☠️','⛏️'],
  treasures:  ['💰','💎','👑','🏆','📿','💍','🪙','🧿','📦','🎁'],
  magic:      ['✨','🔮','📜','🧪','⚡','🌟','💫','🎭','🌀','🔥'],
  environment:['🏰','🏚️','⛺','🗿','⛩️','🕳️','🪨','🏛️','🗻','🌋'],
  furniture:  ['🪑','🛏️','🪞','🕯️','🏮','📚','🗄️','⚱️','🧱','🔒'],
  food:       ['🍖','🍺','🧀','🍷','🍞','🥩','🍎','🧃','🍶','🍄'],
  symbols:    ['⭐','❌','⚠️','🔑','❓','💠','🎯','🚩','📍','🏴'],
  nature:     ['🌳','🌲','🌵','🌊','🍃','🪶','🌸','🍂','🪵','🌿']
};
let allEmojis = Object.values(emojiCategories).flat();
let filteredEmojis = [...allEmojis];

// Default token library presets
const defaultTokenPresets = [
  // Heroes
  {e:'⚔️', l:'Warrior', s:1},
  {e:'🧙', l:'Mage', s:1},
  {e:'🏹', l:'Archer', s:1},
  {e:'🛡️', l:'Paladin', s:1},
  {e:'🗡️', l:'Rogue', s:1},
  {e:'🎵', l:'Bard', s:1},
  {e:'🌿', l:'Druid', s:1},
  {e:'✝️', l:'Cleric', s:1},
  {e:'👊', l:'Monk', s:1},
  {e:'🔮', l:'Warlock', s:1},
  // Monsters
  {e:'💀', l:'Skeleton', s:1},
  {e:'🧟', l:'Zombie', s:1},
  {e:'👹', l:'Ogre', s:2},
  {e:'🐉', l:'Dragon', s:3},
  {e:'🕷️', l:'Spider', s:1},
  {e:'🐺', l:'Wolf', s:1},
  {e:'👻', l:'Ghost', s:1},
  {e:'🦇', l:'Bat', s:1},
  {e:'🐍', l:'Snake', s:1},
  {e:'🐗', l:'Boar', s:1},
  {e:'👿', l:'Demon', s:2},
  {e:'🧌', l:'Troll', s:2},
  {e:'🐻', l:'Bear', s:2},
  {e:'🦅', l:'Griffin', s:2},
  // NPCs & Objects
  {e:'👑', l:'King', s:1},
  {e:'👤', l:'NPC', s:1},
  {e:'💰', l:'Treasure', s:1},
  {e:'🔥', l:'Fire', s:1},
  {e:'🚪', l:'Door', s:1},
  {e:'⚠️', l:'Trap', s:1},
  {e:'🗝️', l:'Key', s:1},
  {e:'📦', l:'Crate', s:1},
];
let tokenLibrary = [...defaultTokenPresets];

// FX state
const fxState = { fog: false, particles: false, vignette: false, lightning: false, sunrays: false };
let particles = [];
let _fxAnimLoop = null;

// Minimap
let showMinimap = false;

// Tile cache for textures
const _tileCache = new Map();
let _tileCellSize = 0;

// Note modal state
let selectedNoteIcon = '📝';
let currentNoteCellKey = null;
let currentLabelCellKey = null;

// Dirty flag for rendering
let renderDirty = true;
let _rafId = null;

/* ─────────────────────────────────────────────────────────
   §2  TEXTURES (procedural, ported from map-maker)
   ───────────────────────────────────────────────────────── */
function seededRandom(x, y, o = 0) {
  const s = x * 73856093 ^ y * 19349663 ^ o * 83492791;
  const t = Math.sin(s) * 10000;
  return t - Math.floor(t);
}

function _invalidateTileCache() { _tileCache.clear(); _tileCellSize = cellSize; }

function _getOrRenderTile(textureName, x, y, s) {
  if (_tileCellSize !== s) { _tileCache.clear(); _tileCellSize = s; }
  const key = `${textureName}:${x}:${y}`;
  if (_tileCache.has(key)) return _tileCache.get(key);
  const oc = document.createElement('canvas');
  oc.width = s; oc.height = s;
  const octx = oc.getContext('2d');
  const def = textures[textureName];
  if (def) def.draw(octx, 0, 0, s, x, y);
  _tileCache.set(key, oc);
  return oc;
}

const textures = {
  'texture-water': {
    draw: (c,px,py,s,x,y) => {
      c.save();
      for(let i=0;i<3;i++){c.globalAlpha=0.3-i*0.08;c.strokeStyle=i%2?'#0077be':'#005a8f';c.lineWidth=2;c.beginPath();const o=seededRandom(x,y,i)*20;c.moveTo(px,py+i*13+o/5);c.quadraticCurveTo(px+s/2,py+i*13+5+o/5,px+s,py+i*13+o/5);c.stroke();}
      c.globalAlpha=0.2;c.fillStyle='#87CEEB';for(let i=0;i<2;i++){c.beginPath();c.arc(px+10+i*20,py+10+i*15,2,0,Math.PI*2);c.fill();}
      c.restore();
    }
  },
  'texture-grass': {
    draw: (c,px,py,s,x,y) => {
      c.save();const col=['#1a5a1a','#2d7b2d','#3a9a3a'];
      for(let gx=0;gx<3;gx++)for(let gy=0;gy<3;gy++){const bX=px+(gx*s/3)+5,bY=py+(gy*s/3)+5;const seed=x*1000+y*100+gx*10+gy;const n=5+Math.floor(seededRandom(x,y,seed)*3);for(let b=0;b<n;b++){c.globalAlpha=0.4+seededRandom(x,y,seed+b)*0.2;c.strokeStyle=col[Math.floor(seededRandom(x,y,seed+b*10)*col.length)];c.lineWidth=1;const oX=(seededRandom(x,y,seed+b*100)-0.5)*6;const oY=(seededRandom(x,y,seed+b*200)-0.5)*6;const bx=bX+oX,by=bY+oY;c.beginPath();c.moveTo(bx,by+2);c.quadraticCurveTo(bx+(seededRandom(x,y,seed+b*300)-0.5)*3,by-2,bx+(seededRandom(x,y,seed+b*400)-0.5)*4,by-5);c.stroke();}}
      c.restore();
    }
  },
  'texture-stone': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.3;c.strokeStyle='#444';c.lineWidth=1;
      for(let i=0;i<2;i++){c.beginPath();c.moveTo(px+seededRandom(x,y,i)*s,py);c.lineTo(px+seededRandom(x,y,i+10)*s,py+s);c.stroke();}
      for(let i=0;i<8;i++){c.fillStyle=i%2?'#555':'#666';c.beginPath();c.arc(px+seededRandom(x,y,i+20)*s,py+seededRandom(x,y,i+30)*s,1.5,0,Math.PI*2);c.fill();}
      c.restore();
    }
  },
  'texture-sand': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.25;
      for(let i=0;i<2;i++){c.fillStyle='#c9a06a';c.beginPath();c.ellipse(px+s/2,py+i*20,s/3,3,0,0,Math.PI*2);c.fill();}
      for(let i=0;i<12;i++){c.fillStyle='#d4a574';c.beginPath();c.arc(px+seededRandom(x,y,i)*s,py+seededRandom(x,y,i+50)*s,0.7,0,Math.PI*2);c.fill();}
      c.restore();
    }
  },
  'texture-lava': {
    draw: (c,px,py,s,x,y) => {
      c.save();const col=['#ff4500','#ff6347','#ff8c00'];
      for(let i=0;i<3;i++){c.globalAlpha=0.35;c.strokeStyle=col[i%col.length];c.lineWidth=2.5;c.beginPath();c.moveTo(px,py+i*13);c.bezierCurveTo(px+s/3,py+i*13+8,px+2*s/3,py+i*13-2,px+s,py+i*13+5);c.stroke();}
      c.globalAlpha=0.5;for(let i=0;i<3;i++){c.fillStyle='#ffaa00';c.beginPath();c.arc(px+10+i*12,py+15+i*8,2.5,0,Math.PI*2);c.fill();}
      c.restore();
    }
  },
  'texture-ice': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.3;c.strokeStyle='#a0d8e6';c.lineWidth=1.5;
      for(let i=0;i<4;i++){const cx=px+10+i*8,cy=py+10+(i%2)*15;c.beginPath();c.moveTo(cx-3,cy);c.lineTo(cx+3,cy);c.moveTo(cx,cy-3);c.lineTo(cx,cy+3);c.moveTo(cx-2,cy-2);c.lineTo(cx+2,cy+2);c.moveTo(cx-2,cy+2);c.lineTo(cx+2,cy-2);c.stroke();}
      c.restore();
    }
  },
  'texture-wood': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.3;
      for(let i=0;i<6;i++){c.strokeStyle=i%2?'#5c4033':'#6b4423';c.lineWidth=1+seededRandom(x,y,i);c.beginPath();const offset=seededRandom(x,y,i+10)*s;c.moveTo(px+offset,py);c.lineTo(px+offset,py+s);c.stroke();}
      c.restore();
    }
  },
  'texture-marble': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.2;
      for(let i=0;i<3;i++){c.strokeStyle='#ccc';c.lineWidth=2;c.beginPath();c.moveTo(px+seededRandom(x,y,i*5)*s,py);c.quadraticCurveTo(px+seededRandom(x,y,i*10)*s,py+s/2,px+seededRandom(x,y,i*15)*s,py+s);c.stroke();}
      c.restore();
    }
  },
  'texture-brick': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.strokeStyle='#8B4513';c.lineWidth=1.5;c.globalAlpha=0.4;
      for(let i=0;i<2;i++){c.beginPath();c.moveTo(px,py+i*s/2);c.lineTo(px+s,py+i*s/2);c.stroke();}
      for(let i=0;i<2;i++){c.beginPath();c.moveTo(px+s/2,py+i*s/2);c.lineTo(px+s/2,py+(i+1)*s/2);c.stroke();}
      c.restore();
    }
  },
  'texture-dirt': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.25;
      for(let i=0;i<15;i++){c.fillStyle=['#654321','#7a5230','#8b6239'][Math.floor(seededRandom(x,y,i)*3)];c.beginPath();c.arc(px+seededRandom(x,y,i+100)*s,py+seededRandom(x,y,i+200)*s,seededRandom(x,y,i+300)*2+0.5,0,Math.PI*2);c.fill();}
      c.restore();
    }
  },
  'texture-moss': {
    draw: (c,px,py,s,x,y) => {
      c.save();const col=['#2d5016','#3a6b1e','#4a7c2a'];
      for(let i=0;i<20;i++){c.globalAlpha=0.3+seededRandom(x,y,i)*0.2;c.fillStyle=col[Math.floor(seededRandom(x,y,i+50)*col.length)];c.beginPath();c.arc(px+seededRandom(x,y,i+100)*s,py+seededRandom(x,y,i+200)*s,seededRandom(x,y,i+300)*3+1,0,Math.PI*2);c.fill();}
      c.restore();
    }
  },
  'texture-snow': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.5;c.fillStyle='#fff';
      for(let i=0;i<8;i++){c.beginPath();c.arc(px+seededRandom(x,y,i)*s,py+seededRandom(x,y,i+50)*s,seededRandom(x,y,i+100)*2+0.5,0,Math.PI*2);c.fill();}
      c.restore();
    }
  },
  'texture-swamp': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.3;const col=['#3d5c2a','#4a6b35','#2d4a1e'];
      for(let i=0;i<3;i++){c.strokeStyle=col[i%col.length];c.lineWidth=2;c.beginPath();c.moveTo(px,py+i*12+seededRandom(x,y,i)*10);c.quadraticCurveTo(px+s/2,py+i*12+5,px+s,py+i*12+seededRandom(x,y,i+10)*10);c.stroke();}
      for(let i=0;i<5;i++){c.fillStyle='#2d3a1e';c.beginPath();c.arc(px+seededRandom(x,y,i+100)*s,py+seededRandom(x,y,i+200)*s,1,0,Math.PI*2);c.fill();}
      c.restore();
    }
  },
  'texture-crystal': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.4;
      for(let i=0;i<4;i++){c.strokeStyle=['#9966ff','#bb99ff','#dd66ff'][i%3];c.lineWidth=2;const cx=px+seededRandom(x,y,i*10)*s,cy=py+seededRandom(x,y,i*20)*s;c.beginPath();c.moveTo(cx,cy-5);c.lineTo(cx-3,cy+5);c.lineTo(cx+3,cy+5);c.closePath();c.stroke();}
      c.restore();
    }
  },
  'texture-metal': {
    draw: (c,px,py,s,x,y) => {
      c.save();c.globalAlpha=0.25;c.strokeStyle='#666';c.lineWidth=1;
      for(let i=0;i<5;i++){c.beginPath();c.moveTo(px,py+i*8);c.lineTo(px+s,py+i*8);c.stroke();}
      for(let i=0;i<5;i++){c.beginPath();c.moveTo(px+i*8,py);c.lineTo(px+i*8,py+s);c.stroke();}
      c.fillStyle='#888';for(let i=0;i<3;i++){c.beginPath();c.arc(px+10+i*12,py+10,1.5,0,Math.PI*2);c.fill();}
      c.restore();
    }
  }
};

/* ─────────────────────────────────────────────────────────
   §3  CANVAS INIT & SIZING
   ───────────────────────────────────────────────────────── */
function updateCanvasSize() {
  const w = cols * cellSize, h = rows * cellSize;
  canvas.width = overlay.width = fxCanvas.width = w;
  canvas.height = overlay.height = fxCanvas.height = h;
  document.getElementById('canvasHint').style.display = 'none';
  ensureFog();
  _invalidateTileCache();
  requestRedraw();
}

function resizeGrid() {
  const w = Math.max(10, Math.min(50, +document.getElementById('gridWidth').value || 20));
  const h = Math.max(10, Math.min(50, +document.getElementById('gridHeight').value || 15));
  cols = w; rows = h;
  document.getElementById('gridWidth').value = cols;
  document.getElementById('gridHeight').value = rows;
  updateCanvasSize();
  saveHistory('📐 Resize');
}

/* ─────────────────────────────────────────────────────────
   §4  ZOOM & PAN
   ───────────────────────────────────────────────────────── */
const canvasArea = document.getElementById('canvasArea');
const canvasWrapper = document.getElementById('canvasWrapper');
let spaceHeld = false, panOrigin = null;

function _applyZoom() {
  canvasWrapper.style.transform = `scale(${zoom})`;
  document.getElementById('zoomDisplay').textContent = Math.round(zoom * 100) + '%';
}
function zoomIn() { zoom = Math.min(3, zoom * 1.2); _applyZoom(); }
function zoomOut() { zoom = Math.max(0.3, zoom / 1.2); _applyZoom(); }
function resetZoom() { zoom = 1; _applyZoom(); }

canvasArea.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoom = Math.min(3, Math.max(0.3, zoom * (e.deltaY < 0 ? 1.15 : 1/1.15)));
  _applyZoom();
}, {passive: false});

canvasArea.addEventListener('mousedown', e => {
  if (!spaceHeld) return;
  e.preventDefault(); e.stopPropagation();
  panOrigin = {x: e.clientX, y: e.clientY, sl: canvasArea.scrollLeft, st: canvasArea.scrollTop};
  canvasArea.style.cursor = 'grabbing';
});
document.addEventListener('mousemove', e => {
  if (!panOrigin) return;
  canvasArea.scrollLeft = panOrigin.sl - (e.clientX - panOrigin.x);
  canvasArea.scrollTop = panOrigin.st - (e.clientY - panOrigin.y);
});
document.addEventListener('mouseup', () => {
  if (panOrigin) { panOrigin = null; canvasArea.style.cursor = spaceHeld ? 'grab' : ''; }
});

/* ─────────────────────────────────────────────────────────
   §5  COORDINATE HELPERS
   ───────────────────────────────────────────────────────── */
function getCellFromMouse(e) {
  const r = overlay.getBoundingClientRect();
  const sx = overlay.width / r.width, sy = overlay.height / r.height;
  const px = (e.clientX - r.left) * sx, py = (e.clientY - r.top) * sy;
  return { x: Math.floor(px / cellSize), y: Math.floor(py / cellSize), px, py };
}

/* ─────────────────────────────────────────────────────────
   §6  APP MODE (BUILD / PLAY)
   ───────────────────────────────────────────────────────── */
function setAppMode(mode) {
  appMode = mode;
  const app = document.getElementById('app');
  app.classList.remove('mode-build', 'mode-play');
  app.classList.add('mode-' + mode);

  document.getElementById('modeBuildBtn').classList.toggle('active', mode === 'build');
  document.getElementById('modePlayBtn').classList.toggle('active', mode === 'play');

  // When switching to play for the first time, init fog if needed
  if (mode === 'play' && fog.length === 0 && canvas.width > 0) {
    initFog();
  }

  updateHUD();
  requestRedraw();
}

function setPlayTab(tab) {
  ['tokens','init','dice'].forEach(t => {
    const btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    const content = document.getElementById('tabContent' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
    if (content) content.style.display = (t === tab) ? '' : 'none';
  });
}

/* ─────────────────────────────────────────────────────────
   §7  BUILD TOOLS
   ───────────────────────────────────────────────────────── */
function setBuildTool(tool) {
  buildTool = tool;
  wallSub = null;
  // Update sidebar buttons
  document.querySelectorAll('.sidebar-mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + tool);
  if (btn) btn.classList.add('active');
  // Show/hide tool panels
  ['floor','wall','object','light','erase'].forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.style.display = (p === tool) ? '' : 'none';
  });
  // Shared color section visible for floor & wall
  const sharedCol = document.getElementById('sharedColorSection');
  if (sharedCol) sharedCol.style.display = (tool === 'floor' || tool === 'wall') ? '' : 'none';
  // Note and label are special
  if (tool === 'note' || tool === 'label') {
    ['floor','wall','object','light','erase'].forEach(p => {
      const el = document.getElementById('panel-' + p);
      if (el) el.style.display = 'none';
    });
    if (sharedCol) sharedCol.style.display = 'none';
    document.querySelectorAll('.sidebar-mode-btn').forEach(b => b.classList.remove('active'));
  }
  if (houseDrawActive && tool !== 'wall') cancelHouseDrawMode();
  updateHUD();
}

function setFloorMode(mode) {
  floorMode = mode;
  const b = document.getElementById('floorBrushBtn');
  const r = document.getElementById('floorRectBtn');
  if (b) b.classList.toggle('active', mode === 'brush');
  if (r) r.classList.toggle('active', mode === 'fillRect');
}

function setEraseMode(mode) {
  eraseMode = mode;
  const b = document.getElementById('eraseBrushBtn');
  const r = document.getElementById('eraseRectBtn');
  if (b) b.classList.toggle('active', mode === 'brush');
  if (r) r.classList.toggle('active', mode === 'fillRect');
}

function setWallSub(sub) { wallSub = sub; updateHUD(); }

function setObjTool(t) {
  objTool = t;
  document.getElementById('objToolPlace').classList.toggle('active', t === 'place');
  document.getElementById('objToolMove').classList.toggle('active', t === 'moveEmoji');
  updateHUD();
}

function selectTexture(tex, btn) {
  selectedTexture = tex;
  document.querySelectorAll('.texture-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function selectLightType(type, btn) {
  currentLightType = type;
  document.querySelectorAll('.light-option').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  updateHUD();
}

function updateAmbientLight(v) {
  ambientLight = v / 100;
  document.getElementById('ambientValue').textContent = v + '%';
  requestRedraw();
}

function clearLights() { lightLayer = {}; requestRedraw(); }

function updateEmojiLightOptions() {
  document.getElementById('emojiLightType').style.display =
    document.getElementById('emojiEmitsLight').checked ? '' : 'none';
}

/* ─────────────────────────────────────────────────────────
   §8  PLAY TOOLS
   ───────────────────────────────────────────────────────── */
function setPlayTool(t) {
  playTool = t;
  if (t !== 'measure') { measureA = null; measureB = null; }
  ['fogBrush','fogRect','token','moveToken','measure'].forEach(id => {
    const btn = document.getElementById(id === 'fogBrush' ? 'fogBrushBtn' :
                                        id === 'fogRect' ? 'fogRectBtn' :
                                        id === 'token' ? 'playTokenBtn' :
                                        id === 'moveToken' ? 'playMoveBtn' :
                                        'measureBtn');
    if (btn) btn.classList.toggle('active', id === t);
  });
  document.getElementById('brushSizeSection').style.display = (t === 'fogBrush') ? '' : 'none';
  updateHUD();
  drawOverlay();
}

function setFogAction(a) {
  fogAction = a;
  document.getElementById('fogRevealBtn').classList.toggle('active', a === 'reveal');
  document.getElementById('fogHideBtn').classList.toggle('active', a === 'fog');
  updateHUD();
}

/* ─────────────────────────────────────────────────────────
   §9  FOG OF WAR
   ───────────────────────────────────────────────────────── */
function initFog() {
  fogCols = cols; fogRows = rows;
  fog = Array.from({length: rows}, () => new Array(cols).fill(true));
}

function ensureFog() {
  fogCols = cols; fogRows = rows;
  if (fog.length === 0) return;
  while (fog.length < rows) fog.push(new Array(cols).fill(true));
  fog.forEach(r => { while (r.length < cols) r.push(true); });
}

function clearFog() {
  saveHistory('☁️ Full fog');
  initFog();
  requestRedraw();
}

function revealAllFog() {
  saveHistory('☀️ Reveal all');
  fog.forEach(r => r.fill(false));
  requestRedraw();
}

function fogBrush(col, row) {
  const bs = +document.getElementById('brushSize').value || 3;
  const h = Math.floor(bs / 2);
  const f = fogAction === 'fog';
  for (let dr = -h; dr < bs - h; dr++) {
    for (let dc = -h; dc < bs - h; dc++) {
      const r2 = row + dr, c2 = col + dc;
      if (r2 >= 0 && r2 < rows && c2 >= 0 && c2 < cols) fog[r2][c2] = f;
    }
  }
}

function fogRect(c1, r1, c2, r2) {
  const f = fogAction === 'fog';
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      if (r >= 0 && r < rows && c >= 0 && c < cols) fog[r][c] = f;
}

function togglePeek() {
  dmPeek = !dmPeek;
  document.getElementById('peekBtn').classList.toggle('peek-on', dmPeek);
  requestRedraw();
}

/* ─────────────────────────────────────────────────────────
   §10  TOKENS
   ───────────────────────────────────────────────────────── */
function addTokenToLibrary() {
  const e = document.getElementById('tokenEmoji').value || '❓';
  const l = document.getElementById('tokenLabel').value || '';
  const s = parseFloat(document.getElementById('tokenSize').value) || 1;
  tokenLibrary.push({e, l, s});
  document.getElementById('tokenEmoji').value = '';
  document.getElementById('tokenLabel').value = '';
  renderTokenLibrary();
}

function renderTokenLibrary() {
  const lib = document.getElementById('tokenLibrary');
  lib.innerHTML = '';
  tokenLibrary.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'token-item' + (selectedToken === i ? ' active' : '');
    el.textContent = t.e + ' ' + t.l;
    el.onclick = () => { selectedToken = i; renderTokenLibrary(); document.getElementById('selectedTokenLabel').textContent = t.e + ' ' + t.l; setPlayTool('token'); };
    lib.appendChild(el);
  });
}

function updatePlacedTokensList() {
  const list = document.getElementById('placedTokensList');
  list.innerHTML = '';
  const hint = document.getElementById('noTokensHint');
  if (hint) hint.style.display = tokens.length === 0 ? '' : 'none';
  tokens.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'placed-token-item' + (editTokenIdx === i ? ' active' : '');
    let hpHtml = '';
    if (t.maxHp && t.maxHp > 0) {
      const pct = Math.min(100, Math.max(0, ((t.hp || 0) / t.maxHp) * 100));
      const col = pct > 50 ? '#22c55e' : pct > 25 ? '#eab308' : '#ef4444';
      hpHtml = `<div class="tok-hp-bar"><div class="tok-hp-fill" style="width:${pct}%;background:${col}"></div></div>`;
    }
    el.innerHTML = `<span>${t.e} ${t.l || ''}${t.visible === false ? ' 👁‍🗨' : ''}</span>${hpHtml}<button class="db" onclick="event.stopPropagation();deleteToken(${i})">✕</button>`;
    el.onclick = () => selectPlacedToken(i);
    list.appendChild(el);
  });
}

function selectPlacedToken(i) {
  editTokenIdx = i;
  const t = tokens[i];
  const ed = document.getElementById('tokenEditor');
  ed.style.display = '';
  document.getElementById('tokenEditName').textContent = t.e + ' ' + (t.l || '');
  document.getElementById('editHP').value = t.hp || 0;
  document.getElementById('editMaxHP').value = t.maxHp || 0;
  document.getElementById('editLabel').value = t.l || '';
  document.getElementById('editVisible').checked = t.visible !== false;
  document.getElementById('editTags').value = t.tags || '';
  renderTagPills(t.tags || '');
  updatePlacedTokensList();
}

function editTokenProp(prop, val) {
  if (editTokenIdx === null || !tokens[editTokenIdx]) return;
  tokens[editTokenIdx][prop] = val;
  if (prop === 'tags') renderTagPills(val);
  updatePlacedTokensList();
  requestRedraw();
}

function renderTagPills(tags) {
  const el = document.getElementById('tagPills');
  el.innerHTML = '';
  if (!tags) return;
  tags.split(',').filter(t => t.trim()).forEach(t => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = t.trim();
    el.appendChild(pill);
  });
}

function closeTokenEditor() {
  editTokenIdx = null;
  document.getElementById('tokenEditor').style.display = 'none';
  updatePlacedTokensList();
}

function deleteToken(i) {
  tokens.splice(i, 1);
  if (editTokenIdx === i) closeTokenEditor();
  else if (editTokenIdx !== null && editTokenIdx > i) editTokenIdx--;
  // Update initiative links
  initList.forEach(it => {
    if (it.tokIdx === i) it.tokIdx = null;
    else if (it.tokIdx !== null && it.tokIdx > i) it.tokIdx--;
  });
  saveHistory('🗑️ Delete token');
  updatePlacedTokensList();
  renderInitList();
  requestRedraw();
}

/* ─────────────────────────────────────────────────────────
   §11  INITIATIVE TRACKER
   ───────────────────────────────────────────────────────── */
function addInitiative() {
  const name = document.getElementById('initName').value.trim();
  const score = +document.getElementById('initScore').value || 0;
  if (!name) return;
  initList.push({name, score, tokIdx: null});
  initList.sort((a, b) => b.score - a.score);
  document.getElementById('initName').value = '';
  document.getElementById('initScore').value = '';
  renderInitList();
}

function renderInitList() {
  const el = document.getElementById('initList');
  el.innerHTML = '';
  initList.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = 'init-item' + (i === initCur ? ' init-active' : '');
    let linkSel = '<select onchange="linkInitToken(' + i + ',this.value)" style="width:52px;font-size:9px;background:#2a2a45;border:1px solid #3a3a60;color:#ddd;border-radius:3px;padding:1px 2px">';
    linkSel += '<option value="-1">—</option>';
    tokens.forEach((t, ti) => { linkSel += `<option value="${ti}"${it.tokIdx === ti ? ' selected' : ''}>${t.e}${t.l ? ' ' + t.l : ''}</option>`; });
    linkSel += '</select>';
    d.innerHTML = `<span class="init-score">${it.score}</span><span class="init-name">${it.name}</span>${linkSel}<button class="db" onclick="deleteInit(${i})" style="background:none;border:none;color:#555;cursor:pointer;font-size:10px">✕</button>`;
    el.appendChild(d);
  });
  document.getElementById('initRound').textContent = 'Round ' + initRound;
}

function linkInitToken(initIdx, tokIdx) {
  initList[initIdx].tokIdx = +tokIdx >= 0 ? +tokIdx : null;
  requestRedraw();
}

function nextInitiative() {
  if (!initList.length) return;
  initCur++;
  if (initCur >= initList.length) { initCur = 0; initRound++; }
  renderInitList();
  requestRedraw();
}

function resetInitiative() {
  initCur = 0; initRound = 1;
  renderInitList();
  requestRedraw();
}

function deleteInit(i) {
  initList.splice(i, 1);
  if (initCur >= initList.length) initCur = Math.max(0, initList.length - 1);
  renderInitList();
  requestRedraw();
}

/* ─────────────────────────────────────────────────────────
   §12  DICE ROLLER
   ───────────────────────────────────────────────────────── */
function rollDice(faces) {
  const count = Math.max(1, +(document.getElementById('diceCount').value) || 1);
  const mod = +(document.getElementById('diceMod').value) || 0;
  document.getElementById('diceFaces').value = faces;
  doRoll(count, faces, mod);
}

function rollCustomDice() {
  const count = Math.max(1, +(document.getElementById('diceCount').value) || 1);
  const faces = Math.max(2, +(document.getElementById('diceFaces').value) || 20);
  const mod = +(document.getElementById('diceMod').value) || 0;
  doRoll(count, faces, mod);
}

function doRoll(count, faces, mod) {
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * faces) + 1);
  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + mod;
  let label = count + 'd' + faces;
  if (mod > 0) label += '+' + mod;
  else if (mod < 0) label += mod;
  let cls = '';
  if (count === 1 && faces === 20) {
    if (rolls[0] === 20) cls = ' dice-crit';
    else if (rolls[0] === 1) cls = ' dice-fail';
  }
  let detail = '';
  if (count > 1 || mod !== 0) {
    detail = '[' + rolls.join(', ') + ']';
    if (mod !== 0) detail += (mod > 0 ? ' + ' : ' − ') + Math.abs(mod);
  }
  const log = document.getElementById('diceLog');
  const el = document.createElement('div');
  el.className = 'dice-entry' + cls;
  el.innerHTML = '<span class="dice-label">' + label + '</span><span class="dice-total">' + total + '</span>' +
    (detail ? '<div class="dice-detail">' + detail + '</div>' : '');
  log.prepend(el);
  while (log.children.length > 50) log.lastChild.remove();

  // Board popup animation
  const popup = document.getElementById('dicePopup');
  if (popup) {
    popup.className = 'dice-popup';
    popup.textContent = '🎲 ' + total;
    if (cls === ' dice-crit') popup.classList.add('dice-popup-crit');
    else if (cls === ' dice-fail') popup.classList.add('dice-popup-fail');
    void popup.offsetWidth;
    popup.classList.add('show');
    setTimeout(() => { popup.classList.remove('show'); popup.classList.add('fade'); }, 600);
    setTimeout(() => { popup.className = 'dice-popup'; popup.textContent = ''; }, 1100);
  }
}

/* ─────────────────────────────────────────────────────────
   §13  HOUSE DRAW (ROOM BUILDER)
   ───────────────────────────────────────────────────────── */
function toggleHouseDrawMode() {
  if (houseDrawActive) { cancelHouseDrawMode(); return; }
  houseDrawActive = true;
  houseCells.clear();
  document.getElementById('houseDrawBtn').textContent = '🏠 Active — paint cells…';
  document.getElementById('houseDrawBtn').classList.add('active');
  document.getElementById('houseBtnGroup').style.display = '';
  if (buildTool !== 'wall') setBuildTool('wall');
  requestRedraw();
}

function cancelHouseDrawMode() {
  houseDrawActive = false;
  houseCells.clear();
  document.getElementById('houseDrawBtn').textContent = '🏠 Paint → Generate Walls';
  document.getElementById('houseDrawBtn').classList.remove('active');
  document.getElementById('houseBtnGroup').style.display = 'none';
  requestRedraw();
}

function validateHouseDraw() {
  if (houseCells.size === 0) { cancelHouseDrawMode(); return; }
  saveHistory('🏠 Room builder');
  const wallColor = selectedColor;
  const cellSides = {};
  houseCells.forEach(key => {
    const [x, y] = key.split(',').map(Number);
    [{dx:0,dy:-1,side:'top'},{dx:0,dy:1,side:'bottom'},{dx:-1,dy:0,side:'left'},{dx:1,dy:0,side:'right'}].forEach(n => {
      const nk = `${x + n.dx},${y + n.dy}`;
      if (!houseCells.has(nk)) {
        const k = `${x},${y}`;
        if (!cellSides[k]) cellSides[k] = {x, y, top: false, bottom: false, left: false, right: false};
        cellSides[k][n.side] = true;
      }
    });
  });
  Object.values(cellSides).forEach(({x, y, top, bottom, left, right}) => {
    const k = `${x},${y}`;
    const existing = objectLayer[k];
    if (existing && existing.type && !existing.type.startsWith('wall')) return;
    objectLayer[k] = { type: 'wall-edge', color: wallColor, edgeSides: {top, bottom, left, right} };
  });
  saveHistory('🏠 Room generated');
  cancelHouseDrawMode();
  requestRedraw();
}

function paintHouseCell(x, y) {
  if (x < 0 || x >= cols || y < 0 || y >= rows) return;
  const k = `${x},${y}`;
  if (houseErasing) houseCells.delete(k);
  else houseCells.add(k);
  document.getElementById('houseCellCount').textContent = houseCells.size + ' cell' + (houseCells.size > 1 ? 's' : '');
}

/* ─────────────────────────────────────────────────────────
   §14  LIGHTING SYSTEM
   ───────────────────────────────────────────────────────── */
function isOpaqueTile(x, y) {
  if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
  const obj = objectLayer[`${x},${y}`];
  if (!obj || !obj.type) return false;
  const t = obj.type;
  if (t.startsWith('window-edge-') && !t.includes('barricaded')) return false;
  return t.startsWith('wall') || t.startsWith('door') || t.includes('barricaded');
}

function lineOfSight(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx - dy, x = x1, y = y1;
  while (true) {
    if (x === x2 && y === y2) return true;
    if ((x !== x1 || y !== y1) && isOpaqueTile(x, y)) return false;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

function getFalloff(dist, range) {
  const t = Math.max(0, 1 - dist / range);
  return t * t; // quadratic
}

function calculateLighting() {
  const lightMap = new Array(cols * rows).fill(0);
  const wallLightMap = new Array(cols * rows).fill(0);
  const allLights = [];
  for (let key in lightLayer) {
    const [lx, ly] = key.split(',').map(Number);
    allLights.push({key, lx, ly, ltype: lightLayer[key].type});
  }
  for (let key in emojiLayer) {
    const obj = emojiLayer[key];
    if (!obj.emitsLight) continue;
    const [lx, ly] = key.split(',').map(Number);
    allLights.push({key: 'obj_' + key, lx, ly, ltype: obj.lightType || 'torch'});
  }
  for (const {key, lx, ly, ltype} of allLights) {
    const ldef = lightTypes[ltype];
    if (!ldef) continue;
    const range = ldef.range;
    let intensity = ldef.intensity;
    if (flickerOffsets[key]) intensity = Math.max(0, Math.min(1, intensity + flickerOffsets[key]));
    for (let y = Math.max(0, ly - range); y <= Math.min(rows - 1, ly + range); y++) {
      for (let x = Math.max(0, lx - range); x <= Math.min(cols - 1, lx + range); x++) {
        const dist = Math.sqrt((x - lx) ** 2 + (y - ly) ** 2);
        if (dist <= range && lineOfSight(lx, ly, x, y)) {
          const falloff = getFalloff(dist, range);
          const value = falloff * intensity;
          const idx = y * cols + x;
          const ck = `${x},${y}`, co = objectLayer[ck];
          if (co && co.type && (co.type.startsWith('wall') || co.type.startsWith('door') || co.type.includes('barricaded'))) {
            wallLightMap[idx] = Math.max(wallLightMap[idx], value);
            if (co.type === 'wall-edge' && co.edgeSides) {
              const s = co.edgeSides, dx = x - lx, dy = y - ly;
              let hitsExterior = false;
              if (dx < 0 && s.right) hitsExterior = true;
              if (dx > 0 && s.left) hitsExterior = true;
              if (dy < 0 && s.bottom) hitsExterior = true;
              if (dy > 0 && s.top) hitsExterior = true;
              if (!hitsExterior) lightMap[idx] = Math.max(lightMap[idx], value);
            } else {
              lightMap[idx] = Math.max(lightMap[idx], Math.min(value, 0.1));
            }
          } else {
            lightMap[idx] = Math.max(lightMap[idx], value);
          }
        }
      }
    }
  }
  return {lightMap, wallLightMap};
}

/* ─────────────────────────────────────────────────────────
   §15  RENDER ENGINE
   ───────────────────────────────────────────────────────── */
function requestRedraw() {
  renderDirty = true;
  if (!_rafId) _rafId = requestAnimationFrame(renderLoop);
}

function renderLoop() {
  _rafId = null;
  if (renderDirty) {
    renderDirty = false;
    _doRedraw();
    drawMinimap();
    redrawPlayer();
  }
}

function _doRedraw() {
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;
  ctx.clearRect(0, 0, w, h);

  // Background image (if any)
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, w, h);
  }

  // Floor layer
  for (const [k, v] of Object.entries(floorLayer)) {
    const [x, y] = k.split(',').map(Number);
    const px = x * cellSize, py = y * cellSize;
    ctx.fillStyle = v.color || selectedColor;
    ctx.fillRect(px, py, cellSize, cellSize);
    if (v.texture && textures[v.texture]) {
      const tile = _getOrRenderTile(v.texture, x, y, cellSize);
      ctx.drawImage(tile, px, py);
    }
  }

  // Wall/object layer
  for (const [k, v] of Object.entries(objectLayer)) {
    const [x, y] = k.split(',').map(Number);
    const px = x * cellSize, py = y * cellSize;
    if (v.type === 'wall-edge' && v.edgeSides) {
      drawEdgeWall(x, y, v.color, v.edgeSides);
      // Draw merged doors/windows on wall
      if (v.doors) for (const [side, on] of Object.entries(v.doors)) { if (on) drawEdgeDoor(x, y, {type:'door-edge-'+side}); }
      if (v.windows) for (const [side, on] of Object.entries(v.windows)) { if (on) drawEdgeWindow(x, y, {type:'window-edge-'+side}); }
    } else if (v.type && v.type.startsWith('door-edge-')) {
      drawEdgeDoor(x, y, v);
    } else if (v.type && v.type.startsWith('window-edge-')) {
      drawEdgeWindow(x, y, v);
    } else if (v.type === 'stairs-up') {
      ctx.fillStyle = '#8888aa';
      ctx.fillRect(px + 4, py + 4, cellSize - 8, cellSize - 8);
      ctx.font = Math.floor(cellSize * 0.5) + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('🔼', px + cellSize/2, py + cellSize/2);
    } else if (v.type === 'stairs-down') {
      ctx.fillStyle = '#6666aa';
      ctx.fillRect(px + 4, py + 4, cellSize - 8, cellSize - 8);
      ctx.font = Math.floor(cellSize * 0.5) + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('🔽', px + cellSize/2, py + cellSize/2);
    }
  }

  // Emoji layer
  for (const [k, v] of Object.entries(emojiLayer)) {
    const [x, y] = k.split(',').map(Number);
    const px = x * cellSize, py = y * cellSize;
    const sz = v.emojiSize || 1;
    const fs = Math.floor(cellSize * sz * 0.7);
    ctx.font = fs + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(v.emoji, px + cellSize * sz / 2, py + cellSize * sz / 2);
  }

  // House preview
  if (houseDrawActive) {
    ctx.save();
    houseCells.forEach(key => {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = 'rgba(245,158,11,0.25)';
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      ctx.strokeStyle = 'rgba(245,158,11,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
    });
    ctx.restore();
  }

  // Lighting
  const hasLights = Object.keys(lightLayer).length > 0 || Object.values(emojiLayer).some(e => e.emitsLight);
  if (hasLights || ambientLight < 1) {
    const {lightMap, wallLightMap} = calculateLighting();
    // 1) Darken floor cells
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (appMode === 'play' && fog.length > 0 && fog[y] && fog[y][x]) continue;
        const idx = y * cols + x;
        const totalLight = Math.min(1, ambientLight + lightMap[idx]);
        const darkness = 1 - totalLight;
        if (darkness > 0) {
          ctx.fillStyle = `rgba(0,0,0,${darkness})`;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // 2) Redraw wall-edge faces with separate wall lighting
    const th = 6;
    for (let k in objectLayer) {
      const c = objectLayer[k];
      if (c.type !== 'wall-edge') continue;
      const [wx, wy] = k.split(',').map(Number);
      const s = c.edgeSides || {};
      const px = wx * cellSize, py = wy * cellSize;
      const wLight = Math.min(1, ambientLight + wallLightMap[wy * cols + wx]);
      const wDark = 1 - wLight;
      ctx.fillStyle = c.color || selectedColor;
      if (s.top)    ctx.fillRect(px, py, cellSize, th);
      if (s.bottom) ctx.fillRect(px, py + cellSize - th, cellSize, th);
      if (s.left)   ctx.fillRect(px, py, th, cellSize);
      if (s.right)  ctx.fillRect(px + cellSize - th, py, th, cellSize);
      if (wDark > 0) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgba(0,0,0,${wDark})`;
        if (s.top)    ctx.fillRect(px, py, cellSize, th);
        if (s.bottom) ctx.fillRect(px, py + cellSize - th, cellSize, th);
        if (s.left)   ctx.fillRect(px, py, th, cellSize);
        if (s.right)  ctx.fillRect(px + cellSize - th, py, th, cellSize);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // 3) Colored light glows
    ctx.globalCompositeOperation = 'screen';
    for (let key in lightLayer) {
      const [lx, ly] = key.split(',').map(Number);
      const lt = lightLayer[key], ldef = lightTypes[lt.type];
      if (!ldef) continue;
      const cpx = lx * cellSize + cellSize / 2, cpy = ly * cellSize + cellSize / 2;
      const r = ldef.range * cellSize;
      const grad = ctx.createRadialGradient(cpx, cpy, 0, cpx, cpy, r);
      grad.addColorStop(0, ldef.color + '66');
      grad.addColorStop(0.5, ldef.color + '22');
      grad.addColorStop(1, ldef.color + '00');
      ctx.fillStyle = grad;
      ctx.fillRect(cpx - r, cpy - r, r * 2, r * 2);
    }
    for (let key in emojiLayer) {
      const obj = emojiLayer[key];
      if (!obj.emitsLight) continue;
      const [lx, ly] = key.split(',').map(Number);
      const ldef = lightTypes[obj.lightType || 'torch'];
      if (!ldef) continue;
      const cpx = lx * cellSize + cellSize / 2, cpy = ly * cellSize + cellSize / 2;
      const r = ldef.range * cellSize;
      const grad = ctx.createRadialGradient(cpx, cpy, 0, cpx, cpy, r);
      grad.addColorStop(0, ldef.color + '55');
      grad.addColorStop(0.5, ldef.color + '18');
      grad.addColorStop(1, ldef.color + '00');
      ctx.fillStyle = grad;
      ctx.fillRect(cpx - r, cpy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // Notes & Labels
  _drawNotesAndLabels();

  // Grid
  if (showGrid) {
    const go = (+document.getElementById('gridOpacity').value || 20) / 100;
    const gc = document.getElementById('gridColor').value || '#ffffff';
    ctx.save();
    ctx.strokeStyle = gc;
    ctx.globalAlpha = go;
    ctx.lineWidth = 1;
    for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, h); ctx.stroke(); }
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * cellSize); ctx.lineTo(w, r * cellSize); ctx.stroke(); }
    ctx.restore();
  }

  // Fog of War (play mode only)
  if (appMode === 'play' && fog.length > 0) {
    const fo = dmPeek ? (+document.getElementById('peekOpacity').value || 15) / 100 : (+document.getElementById('fogDmOpacity').value || 95) / 100;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (fog[r] && fog[r][c]) {
          ctx.fillStyle = `rgba(0,0,0,${fo})`;
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // Tokens (play mode)
  if (appMode === 'play') {
    const gs = cellSize;
    tokens.forEach((t, ti) => {
      const fs = Math.floor(gs * t.s * 0.65), tw = gs * t.s;
      const cx = t.x + tw / 2, cy = t.y + tw / 2;
      ctx.save();
      if (t.visible === false) ctx.globalAlpha = (+document.getElementById('dmTokenOpacity').value || 60) / 100;
      // Initiative glow
      if (initList.length > 0 && initList[initCur] && initList[initCur].tokIdx === ti) {
        ctx.shadowColor = '#667eea';
        ctx.shadowBlur = 16;
      }
      ctx.font = fs + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.e, cx, cy);
      ctx.shadowBlur = 0;
      // Label
      if (t.l) {
        const ls = Math.max(9, Math.floor(gs * 0.26));
        ctx.font = 'bold ' + ls + 'px sans-serif';
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        const ly = cy + fs * 0.58;
        ctx.strokeText(t.l, cx, ly); ctx.fillText(t.l, cx, ly);
      }
      // HP bar
      if (t.maxHp && t.maxHp > 0) {
        const hp = Math.max(0, t.hp || 0);
        const pct = Math.min(1, hp / t.maxHp);
        const bw = tw * 0.8, bh = Math.max(3, gs * 0.08);
        const bx = cx - bw / 2, by = t.y + tw - bh - 2;
        ctx.fillStyle = '#00000088';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(bx, by, bw * pct, bh);
      }
      // Tag dots
      if (t.tags) {
        const tagList = t.tags.split(',').filter(tg => tg.trim());
        if (tagList.length > 0) {
          const dotR = Math.max(2, gs * 0.06);
          tagList.forEach((_, ci) => {
            const angle = (-Math.PI / 2) + (ci * Math.PI * 2 / tagList.length);
            const orbitR = tw / 2 + dotR + 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(angle) * orbitR, cy + Math.sin(angle) * orbitR, dotR, 0, Math.PI * 2);
            ctx.fillStyle = '#667eea'; ctx.fill();
            ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
          });
        }
      }
      ctx.restore();
    });
  }

  // FX
  applyFX();
}

/* ─── WALL DRAWING HELPERS ─── */
function drawEdgeWall(x, y, color, sides) {
  const px = x * cellSize, py = y * cellSize, th = 6;
  ctx.fillStyle = color || selectedColor;
  if (sides.top) ctx.fillRect(px, py, cellSize, th);
  if (sides.bottom) ctx.fillRect(px, py + cellSize - th, cellSize, th);
  if (sides.left) ctx.fillRect(px, py, th, cellSize);
  if (sides.right) ctx.fillRect(px + cellSize - th, py, th, cellSize);
}

function drawEdgeDoor(x, y, obj) {
  const px = x * cellSize, py = y * cellSize, th = 6;
  const side = obj.type.replace('door-edge-', '');
  ctx.fillStyle = '#a0522d';
  if (side === 'top') { ctx.fillRect(px, py, cellSize, th + 2); }
  else if (side === 'bottom') { ctx.fillRect(px, py + cellSize - th - 2, cellSize, th + 2); }
  else if (side === 'left') { ctx.fillRect(px, py, th + 2, cellSize); }
  else if (side === 'right') { ctx.fillRect(px + cellSize - th - 2, py, th + 2, cellSize); }
}

function drawEdgeWindow(x, y, obj) {
  const px = x * cellSize, py = y * cellSize, th = 6;
  const side = obj.type.replace('window-edge-', '');
  ctx.fillStyle = '#87CEEB';
  ctx.globalAlpha = 0.6;
  if (side === 'top') { ctx.fillRect(px, py, cellSize, th); }
  else if (side === 'bottom') { ctx.fillRect(px, py + cellSize - th, cellSize, th); }
  else if (side === 'left') { ctx.fillRect(px, py, th, cellSize); }
  else if (side === 'right') { ctx.fillRect(px + cellSize - th, py, th, cellSize); }
  ctx.globalAlpha = 1;
}

/* ─── NOTES & LABELS DRAWING ─── */
function _drawNotesAndLabels() {
  // Notes
  for (const [k, v] of Object.entries(noteLayer)) {
    const [x, y] = k.split(',').map(Number);
    ctx.font = '12px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(v.icon || '📝', x * cellSize + cellSize - 2, y * cellSize + 2);
  }
  // Labels
  for (const [k, v] of Object.entries(labelLayer)) {
    const [x, y] = k.split(',').map(Number);
    const px = x * cellSize + cellSize / 2, py = y * cellSize + cellSize * 0.7;
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(v.text, px + 1, py + 1);
    ctx.fillStyle = v.color || '#fff';
    ctx.fillText(v.text, px, py);
  }
  // Light icons
  if (appMode === 'build') {
    for (const [k, v] of Object.entries(lightLayer)) {
      const [x, y] = k.split(',').map(Number);
      const lt = lightTypes[v.type];
      ctx.font = Math.floor(cellSize * 0.4) + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(lt && lt.flicker ? '🔥' : '💡', x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
    }
  }
}

/* ─── OVERLAY (tool previews) ─── */
function drawOverlay() {
  ox.clearRect(0, 0, overlay.width, overlay.height);
  const gs = cellSize;

  // Floor fill-rect preview
  if (appMode === 'build' && buildTool === 'floor' && floorMode === 'fillRect' && isDrawing && rectStart && rectCur) {
    const x1 = Math.min(rectStart.x, rectCur.x), y1 = Math.min(rectStart.y, rectCur.y);
    const x2 = Math.max(rectStart.x, rectCur.x), y2 = Math.max(rectStart.y, rectCur.y);
    ox.save();
    ox.strokeStyle = '#22c55eaa'; ox.lineWidth = 2; ox.setLineDash([6, 4]);
    ox.strokeRect(x1 * gs, y1 * gs, (x2 - x1 + 1) * gs, (y2 - y1 + 1) * gs);
    ox.fillStyle = 'rgba(34,197,94,0.08)';
    ox.fillRect(x1 * gs, y1 * gs, (x2 - x1 + 1) * gs, (y2 - y1 + 1) * gs);
    ox.setLineDash([]);
    ox.restore();
  }

  // Erase fill-rect preview
  if (appMode === 'build' && buildTool === 'erase' && eraseMode === 'fillRect' && isDrawing && rectStart && rectCur) {
    const x1 = Math.min(rectStart.x, rectCur.x), y1 = Math.min(rectStart.y, rectCur.y);
    const x2 = Math.max(rectStart.x, rectCur.x), y2 = Math.max(rectStart.y, rectCur.y);
    ox.save();
    ox.strokeStyle = '#ef4444aa'; ox.lineWidth = 2; ox.setLineDash([6, 4]);
    ox.strokeRect(x1 * gs, y1 * gs, (x2 - x1 + 1) * gs, (y2 - y1 + 1) * gs);
    ox.fillStyle = 'rgba(239,68,68,0.08)';
    ox.fillRect(x1 * gs, y1 * gs, (x2 - x1 + 1) * gs, (y2 - y1 + 1) * gs);
    ox.setLineDash([]);
    ox.restore();
  }

  // Fog brush preview
  if (appMode === 'play' && playTool === 'fogBrush' && lastPos) {
    const bs = +document.getElementById('brushSize').value || 3;
    const h = Math.floor(bs / 2);
    ox.save();
    ox.strokeStyle = fogAction === 'reveal' ? '#22c55e88' : '#ef444488';
    ox.lineWidth = 2;
    ox.setLineDash([4, 4]);
    ox.strokeRect((lastPos.x - h) * gs, (lastPos.y - h) * gs, bs * gs, bs * gs);
    ox.setLineDash([]);
    ox.restore();
  }

  // Fog rect preview
  if (appMode === 'play' && playTool === 'fogRect' && rectStart && rectCur) {
    const x1 = Math.min(rectStart.x, rectCur.x), y1 = Math.min(rectStart.y, rectCur.y);
    const x2 = Math.max(rectStart.x, rectCur.x), y2 = Math.max(rectStart.y, rectCur.y);
    ox.save();
    ox.strokeStyle = fogAction === 'reveal' ? '#22c55eaa' : '#ef4444aa';
    ox.lineWidth = 2; ox.setLineDash([6, 4]);
    ox.strokeRect(x1 * gs, y1 * gs, (x2 - x1 + 1) * gs, (y2 - y1 + 1) * gs);
    ox.fillStyle = fogAction === 'reveal' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
    ox.fillRect(x1 * gs, y1 * gs, (x2 - x1 + 1) * gs, (y2 - y1 + 1) * gs);
    ox.setLineDash([]);
    ox.restore();
  }

  // Measure tool
  if ((appMode === 'play' && playTool === 'measure') && measureA) {
    ox.save();
    const ax = measureA.x * gs + gs / 2, ay = measureA.y * gs + gs / 2;
    ox.beginPath(); ox.arc(ax, ay, 6, 0, Math.PI * 2);
    ox.fillStyle = '#667eea'; ox.fill();
    ox.strokeStyle = '#fff'; ox.lineWidth = 2; ox.stroke();
    if (measureB) {
      const bx = measureB.x * gs + gs / 2, by = measureB.y * gs + gs / 2;
      ox.beginPath(); ox.moveTo(ax, ay); ox.lineTo(bx, by);
      ox.strokeStyle = '#667eeaaa'; ox.lineWidth = 2; ox.setLineDash([6, 4]); ox.stroke(); ox.setLineDash([]);
      ox.beginPath(); ox.arc(bx, by, 6, 0, Math.PI * 2);
      ox.fillStyle = '#667eea'; ox.fill(); ox.strokeStyle = '#fff'; ox.lineWidth = 2; ox.stroke();
      const dc = Math.abs(measureB.x - measureA.x), dr = Math.abs(measureB.y - measureA.y);
      const diag = Math.sqrt(dc * dc + dr * dr);
      const midX = (ax + bx) / 2, midY = (ay + by) / 2;
      const txt = `${diag.toFixed(1)} cases (${dc + dr} Manhattan)`;
      ox.font = 'bold 13px sans-serif';
      const tw = ox.measureText(txt).width;
      ox.fillStyle = '#1e1e35ee';
      ox.fillRect(midX - tw / 2 - 8, midY - 22, tw + 16, 26);
      ox.strokeStyle = '#667eea88'; ox.lineWidth = 1;
      ox.strokeRect(midX - tw / 2 - 8, midY - 22, tw + 16, 26);
      ox.fillStyle = '#a5b4fc'; ox.textAlign = 'center'; ox.textBaseline = 'middle';
      ox.fillText(txt, midX, midY - 9);
    }
    ox.restore();
  }
}

/* ─────────────────────────────────────────────────────────
   §16  PLAYER VIEW
   ───────────────────────────────────────────────────────── */
function openPlayerView() {
  if (playerWin && !playerWin.closed) { playerWin.focus(); return; }
  playerWin = window.open('', '_blank', 'width=1024,height=768,menubar=no,toolbar=no,location=no,status=no');
  if (!playerWin) return;
  playerWin.document.write(`<!DOCTYPE html><html><head><title>Map Beta — Player View</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
canvas{max-width:100vw;max-height:100vh;object-fit:contain}
.pv-toolbar{position:fixed;top:10px;right:10px;z-index:100;display:flex;gap:6px}
.pv-btn{padding:5px 12px;background:#25253ecc;border:1px solid #4a4a6a;color:#c0c0d8;border-radius:5px;font-size:12px;cursor:pointer;backdrop-filter:blur(6px);transition:all .15s}
.pv-btn:hover{background:#38385a;border-color:#667eea;color:#fff}
.pv-btn.pv-on{background:#667eea33;border-color:#667eea;color:#a5b4fc}</style></head>
<body><canvas id="pc"></canvas>
<div class="pv-toolbar"><button id="pv-grid" class="pv-btn" onclick="window.opener.togglePlayerGrid()">▦ Grid</button></div>
</body></html>`);
  playerWin.document.close();
  setTimeout(() => redrawPlayer(), 200);
}

function togglePlayerGrid() {
  playerShowGrid = !playerShowGrid;
  if (playerWin && !playerWin.closed) {
    const btn = playerWin.document.getElementById('pv-grid');
    if (btn) btn.className = 'pv-btn' + (playerShowGrid ? ' pv-on' : '');
  }
  redrawPlayer();
}

function redrawPlayer() {
  if (!playerWin || playerWin.closed) return;
  const pc = playerWin.document.getElementById('pc');
  if (!pc) return;
  const px = pc.getContext('2d');
  pc.width = canvas.width; pc.height = canvas.height;
  px.clearRect(0, 0, pc.width, pc.height);

  // Background
  if (bgImage) px.drawImage(bgImage, 0, 0, pc.width, pc.height);

  // Floor
  for (const [k, v] of Object.entries(floorLayer)) {
    const [x, y] = k.split(',').map(Number);
    const ppx = x * cellSize, ppy = y * cellSize;
    px.fillStyle = v.color || '#f5f5dc';
    px.fillRect(ppx, ppy, cellSize, cellSize);
    if (v.texture && textures[v.texture]) {
      const tile = _getOrRenderTile(v.texture, x, y, cellSize);
      px.drawImage(tile, ppx, ppy);
    }
  }

  // Walls + doors/windows
  for (const [k, v] of Object.entries(objectLayer)) {
    const [x, y] = k.split(',').map(Number);
    if (v.type === 'wall-edge' && v.edgeSides) {
      const ppx = x * cellSize, ppy = y * cellSize, th = 6;
      px.fillStyle = v.color || selectedColor;
      if (v.edgeSides.top) px.fillRect(ppx, ppy, cellSize, th);
      if (v.edgeSides.bottom) px.fillRect(ppx, ppy + cellSize - th, cellSize, th);
      if (v.edgeSides.left) px.fillRect(ppx, ppy, th, cellSize);
      if (v.edgeSides.right) px.fillRect(ppx + cellSize - th, ppy, th, cellSize);
      // Merged doors
      if (v.doors) for (const [side, on] of Object.entries(v.doors)) {
        if (!on) continue;
        px.fillStyle = '#a0522d';
        if (side === 'top') px.fillRect(ppx, ppy, cellSize, th + 2);
        else if (side === 'bottom') px.fillRect(ppx, ppy + cellSize - th - 2, cellSize, th + 2);
        else if (side === 'left') px.fillRect(ppx, ppy, th + 2, cellSize);
        else if (side === 'right') px.fillRect(ppx + cellSize - th - 2, ppy, th + 2, cellSize);
      }
      // Merged windows
      if (v.windows) for (const [side, on] of Object.entries(v.windows)) {
        if (!on) continue;
        px.fillStyle = '#87CEEB'; px.globalAlpha = 0.6;
        if (side === 'top') px.fillRect(ppx, ppy, cellSize, th);
        else if (side === 'bottom') px.fillRect(ppx, ppy + cellSize - th, cellSize, th);
        else if (side === 'left') px.fillRect(ppx, ppy, th, cellSize);
        else if (side === 'right') px.fillRect(ppx + cellSize - th, ppy, th, cellSize);
        px.globalAlpha = 1;
      }
    } else if (v.type && v.type.startsWith('door-edge-')) {
      const side = v.type.replace('door-edge-', '');
      const ppx = x * cellSize, ppy = y * cellSize, th = 6;
      px.fillStyle = '#a0522d';
      if (side === 'top') px.fillRect(ppx, ppy, cellSize, th + 2);
      else if (side === 'bottom') px.fillRect(ppx, ppy + cellSize - th - 2, cellSize, th + 2);
      else if (side === 'left') px.fillRect(ppx, ppy, th + 2, cellSize);
      else if (side === 'right') px.fillRect(ppx + cellSize - th - 2, ppy, th + 2, cellSize);
    } else if (v.type && v.type.startsWith('window-edge-')) {
      const side = v.type.replace('window-edge-', '');
      const ppx = x * cellSize, ppy = y * cellSize, th = 6;
      px.fillStyle = '#87CEEB'; px.globalAlpha = 0.6;
      if (side === 'top') px.fillRect(ppx, ppy, cellSize, th);
      else if (side === 'bottom') px.fillRect(ppx, ppy + cellSize - th, cellSize, th);
      else if (side === 'left') px.fillRect(ppx, ppy, th, cellSize);
      else if (side === 'right') px.fillRect(ppx + cellSize - th, ppy, th, cellSize);
      px.globalAlpha = 1;
    }
  }

  // Emojis
  for (const [k, v] of Object.entries(emojiLayer)) {
    const [x, y] = k.split(',').map(Number);
    const sz = v.emojiSize || 1;
    const fs = Math.floor(cellSize * sz * 0.7);
    px.font = fs + 'px serif'; px.textAlign = 'center'; px.textBaseline = 'middle';
    px.fillText(v.emoji, x * cellSize + cellSize * sz / 2, y * cellSize + cellSize * sz / 2);
  }

  // Labels
  for (const [k, v] of Object.entries(labelLayer)) {
    const [x, y] = k.split(',').map(Number);
    const lx = x * cellSize + cellSize / 2, ly = y * cellSize + cellSize * 0.7;
    px.font = 'bold 11px sans-serif'; px.textAlign = 'center'; px.textBaseline = 'middle';
    px.fillStyle = 'rgba(0,0,0,0.7)'; px.fillText(v.text, lx + 1, ly + 1);
    px.fillStyle = v.color || '#fff'; px.fillText(v.text, lx, ly);
  }

  // Lighting (same as DM view)
  const hasLightsP = Object.keys(lightLayer).length > 0 || Object.values(emojiLayer).some(e => e.emitsLight);
  if (hasLightsP || ambientLight < 1) {
    const {lightMap, wallLightMap} = calculateLighting();
    px.save();
    // 1) Darken floor cells
    px.globalCompositeOperation = 'multiply';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (fog.length > 0 && fog[y] && fog[y][x]) continue;
        const idx = y * cols + x;
        const totalLight = Math.min(1, ambientLight + lightMap[idx]);
        const darkness = 1 - totalLight;
        if (darkness > 0) {
          px.fillStyle = `rgba(0,0,0,${darkness})`;
          px.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }
    px.globalCompositeOperation = 'source-over';
    // 2) Redraw wall-edge faces with wall lighting
    const th = 6;
    for (let k in objectLayer) {
      const c = objectLayer[k];
      if (c.type !== 'wall-edge') continue;
      const [wx, wy] = k.split(',').map(Number);
      const s = c.edgeSides || {};
      const ppx = wx * cellSize, ppy = wy * cellSize;
      const wLight = Math.min(1, ambientLight + wallLightMap[wy * cols + wx]);
      const wDark = 1 - wLight;
      px.fillStyle = c.color || selectedColor;
      if (s.top)    px.fillRect(ppx, ppy, cellSize, th);
      if (s.bottom) px.fillRect(ppx, ppy + cellSize - th, cellSize, th);
      if (s.left)   px.fillRect(ppx, ppy, th, cellSize);
      if (s.right)  px.fillRect(ppx + cellSize - th, ppy, th, cellSize);
      if (wDark > 0) {
        px.globalCompositeOperation = 'multiply';
        px.fillStyle = `rgba(0,0,0,${wDark})`;
        if (s.top)    px.fillRect(ppx, ppy, cellSize, th);
        if (s.bottom) px.fillRect(ppx, ppy + cellSize - th, cellSize, th);
        if (s.left)   px.fillRect(ppx, ppy, th, cellSize);
        if (s.right)  px.fillRect(ppx + cellSize - th, ppy, th, cellSize);
        px.globalCompositeOperation = 'source-over';
      }
    }
    // 3) Colored light glows
    px.globalCompositeOperation = 'screen';
    for (let key in lightLayer) {
      const [lx, ly] = key.split(',').map(Number);
      const lt = lightLayer[key], ldef = lightTypes[lt.type];
      if (!ldef) continue;
      const cpx = lx * cellSize + cellSize / 2, cpy = ly * cellSize + cellSize / 2;
      const r = ldef.range * cellSize;
      const grad = px.createRadialGradient(cpx, cpy, 0, cpx, cpy, r);
      grad.addColorStop(0, ldef.color + '66');
      grad.addColorStop(0.5, ldef.color + '22');
      grad.addColorStop(1, ldef.color + '00');
      px.fillStyle = grad;
      px.fillRect(cpx - r, cpy - r, r * 2, r * 2);
    }
    for (let key in emojiLayer) {
      const obj = emojiLayer[key];
      if (!obj.emitsLight) continue;
      const [lx, ly] = key.split(',').map(Number);
      const ldef = lightTypes[obj.lightType || 'torch'];
      if (!ldef) continue;
      const cpx = lx * cellSize + cellSize / 2, cpy = ly * cellSize + cellSize / 2;
      const r = ldef.range * cellSize;
      const grad = px.createRadialGradient(cpx, cpy, 0, cpx, cpy, r);
      grad.addColorStop(0, ldef.color + '55');
      grad.addColorStop(0.5, ldef.color + '18');
      grad.addColorStop(1, ldef.color + '00');
      px.fillStyle = grad;
      px.fillRect(cpx - r, cpy - r, r * 2, r * 2);
    }
    px.globalCompositeOperation = 'source-over';
    px.restore();
  }

  // Grid
  if (playerShowGrid) {
    const go = (+document.getElementById('gridOpacity').value || 20) / 100;
    const gc = document.getElementById('gridColor').value || '#ffffff';
    px.save(); px.strokeStyle = gc; px.globalAlpha = go; px.lineWidth = 1;
    for (let c = 0; c <= cols; c++) { px.beginPath(); px.moveTo(c * cellSize, 0); px.lineTo(c * cellSize, pc.height); px.stroke(); }
    for (let r = 0; r <= rows; r++) { px.beginPath(); px.moveTo(0, r * cellSize); px.lineTo(pc.width, r * cellSize); px.stroke(); }
    px.restore();
  }

  // Fog: 100% opaque for players
  if (fog.length > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (fog[r] && fog[r][c]) {
          px.fillStyle = '#000';
          px.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // VFX overlay — draw fxCanvas onto player view
  if (fxState.fog || fxState.particles || fxState.vignette || fxState.lightning || fxState.sunrays) {
    px.drawImage(fxCanvas, 0, 0);
  }

  // Visible tokens only
  const gs = cellSize;
  tokens.forEach(t => {
    if (t.visible === false) return;
    const fs = Math.floor(gs * t.s * 0.65), tw = gs * t.s;
    const cx = t.x + tw / 2, cy = t.y + tw / 2;
    px.save();
    px.font = fs + 'px serif'; px.textAlign = 'center'; px.textBaseline = 'middle';
    px.fillText(t.e, cx, cy);
    if (t.l) {
      const ls = Math.max(9, Math.floor(gs * 0.26));
      px.font = 'bold ' + ls + 'px sans-serif';
      px.fillStyle = '#fff'; px.strokeStyle = '#000'; px.lineWidth = 3;
      const ly = cy + fs * 0.58;
      px.strokeText(t.l, cx, ly); px.fillText(t.l, cx, ly);
    }
    if (t.maxHp && t.maxHp > 0) {
      const hp = Math.max(0, t.hp || 0), pct = Math.min(1, hp / t.maxHp);
      const bw = tw * 0.8, bh = Math.max(3, gs * 0.08);
      const bx = cx - bw / 2, by = t.y + tw - bh - 2;
      px.fillStyle = '#00000088'; px.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      px.fillStyle = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#eab308' : '#ef4444';
      px.fillRect(bx, by, bw * pct, bh);
    }
    px.restore();
  });
}

/* ─────────────────────────────────────────────────────────
   §17  MINIMAP
   ───────────────────────────────────────────────────────── */
function drawMinimap() {
  if (!showMinimap) return;
  const W = miniCanvas.width, H = miniCanvas.height;
  miniCtx.clearRect(0, 0, W, H);
  miniCtx.fillStyle = '#111'; miniCtx.fillRect(0, 0, W, H);
  const sx = W / cols, sy = H / rows;
  for (const [k, v] of Object.entries(floorLayer)) {
    const [x, y] = k.split(',').map(Number);
    miniCtx.fillStyle = v.color || '#f5f5dc';
    miniCtx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
  }
  for (const [k, v] of Object.entries(objectLayer)) {
    const [x, y] = k.split(',').map(Number);
    miniCtx.fillStyle = v.type && v.type.startsWith('wall') ? '#555' : '#a0522d';
    miniCtx.fillRect(x * sx, y * sy, sx, sy);
  }
  if (appMode === 'play' && fog.length > 0) {
    miniCtx.fillStyle = 'rgba(0,0,0,0.6)';
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (fog[r] && fog[r][c]) miniCtx.fillRect(c * sx, r * sy, sx, sy);
  }
  tokens.forEach(t => {
    miniCtx.fillStyle = '#667eea';
    const tx = (t.x / cellSize) * sx, ty = (t.y / cellSize) * sy;
    miniCtx.fillRect(tx, ty, sx * t.s, sy * t.s);
  });
}

function toggleMinimap() {
  showMinimap = !showMinimap;
  document.getElementById('minimapContainer').style.display = showMinimap ? '' : 'none';
  document.getElementById('minimapBtn').classList.toggle('active', showMinimap);
  if (showMinimap) drawMinimap();
}

/* ─────────────────────────────────────────────────────────
   §18  FX (FOG, PARTICLES, VIGNETTE)
   ───────────────────────────────────────────────────────── */
function toggleFX(name) {
  fxState[name] = document.getElementById('fx' + name.charAt(0).toUpperCase() + name.slice(1)).checked;
  const ctrl = document.getElementById('fx' + name.charAt(0).toUpperCase() + name.slice(1) + 'Controls');
  if (ctrl) ctrl.style.display = fxState[name] ? '' : 'none';
  const needsLoop = fxState.particles || fxState.fog || fxState.lightning || fxState.sunrays;
  if (needsLoop && !_fxAnimLoop) startFxLoop();
  if (!needsLoop) stopFxLoop();
  requestRedraw();
}

function applyFX() {
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  if (!fxState.fog && !fxState.particles && !fxState.vignette && !fxState.lightning && !fxState.sunrays) return;
  const w = fxCanvas.width, h = fxCanvas.height;

  // Ambient fog
  if (fxState.fog) {
    const density = (+document.getElementById('fxFogDensity').value || 40) / 100;
    const color = document.getElementById('fxFogColor').value || '#888888';
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    fxCtx.fillStyle = `rgba(${r},${g},${b},${density * 0.5})`;
    fxCtx.fillRect(0, 0, w, h);
    // Wisps
    const t = Date.now() / 3000;
    fxCtx.save();
    for (let i = 0; i < 6; i++) {
      const cx = (w / 2) + Math.sin(t + i * 1.2) * w * 0.3;
      const cy = (h / 2) + Math.cos(t + i * 0.8) * h * 0.25;
      const rad = Math.max(w, h) * 0.15;
      const grad = fxCtx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `rgba(${r},${g},${b},${density * 0.25})`);
      grad.addColorStop(1, 'transparent');
      fxCtx.fillStyle = grad;
      fxCtx.fillRect(0, 0, w, h);
    }
    fxCtx.restore();
  }

  // Particles
  if (fxState.particles) {
    const style = document.getElementById('fxParticleStyle').value || 'rain';
    const count = +document.getElementById('fxParticleCount').value || 100;
    const speed = +document.getElementById('fxParticleSpeed').value || 5;
    while (particles.length < count) {
      particles.push({ x: Math.random() * w, y: Math.random() * h, speed: (0.5 + Math.random()) * speed, size: 1 + Math.random() * 2 });
    }
    while (particles.length > count) particles.pop();
    fxCtx.save();
    particles.forEach(p => {
      if (style === 'rain') {
        p.y += p.speed * 2; p.x += p.speed * 0.3;
        if (p.y > h) { p.y = -5; p.x = Math.random() * w; }
        fxCtx.strokeStyle = 'rgba(150,180,255,0.4)'; fxCtx.lineWidth = 1;
        fxCtx.beginPath(); fxCtx.moveTo(p.x, p.y); fxCtx.lineTo(p.x + 1, p.y + 6); fxCtx.stroke();
      } else if (style === 'snow') {
        p.y += p.speed * 0.5; p.x += Math.sin(Date.now() / 1000 + p.speed) * 0.3;
        if (p.y > h) { p.y = -5; p.x = Math.random() * w; }
        fxCtx.fillStyle = 'rgba(255,255,255,0.6)';
        fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2); fxCtx.fill();
      } else if (style === 'embers') {
        p.y -= p.speed * 0.8; p.x += Math.sin(Date.now() / 800 + p.speed) * 0.5;
        if (p.y < 0) { p.y = h + 5; p.x = Math.random() * w; }
        fxCtx.fillStyle = `rgba(255,${100 + Math.floor(Math.random() * 100)},0,0.7)`;
        fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2); fxCtx.fill();
      }
    });
    fxCtx.restore();
  }

  // Vignette
  if (fxState.vignette) {
    const intensity = (+document.getElementById('fxVignetteIntensity').value || 50) / 100;
    const color = document.getElementById('fxVignetteColor').value || '#000000';
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    const grad = fxCtx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, `rgba(${r},${g},${b},${intensity})`);
    fxCtx.fillStyle = grad;
    fxCtx.fillRect(0, 0, w, h);
  }

  // Lightning
  if (fxState.lightning) {
    const freq = (+document.getElementById('fxLightningFreq').value || 3) / 10;
    const intensity = (+document.getElementById('fxLightningIntensity').value || 60) / 100;
    if (Math.random() < freq * 0.15) {
      fxCtx.save();
      fxCtx.fillStyle = `rgba(255,255,255,${intensity * 0.4})`;
      fxCtx.fillRect(0, 0, w, h);
      // Draw a bolt
      fxCtx.strokeStyle = `rgba(200,220,255,${intensity})`;
      fxCtx.lineWidth = 2;
      fxCtx.shadowColor = '#aaccff';
      fxCtx.shadowBlur = 15;
      fxCtx.beginPath();
      let bx = w * (0.2 + Math.random() * 0.6), by = 0;
      fxCtx.moveTo(bx, by);
      const segs = 6 + Math.floor(Math.random() * 6);
      for (let s = 0; s < segs; s++) {
        bx += (Math.random() - 0.5) * 60;
        by += h / segs;
        fxCtx.lineTo(bx, by);
      }
      fxCtx.stroke();
      fxCtx.restore();
    }
  }

  // Sunrays
  if (fxState.sunrays) {
    const intensity = (+document.getElementById('fxSunraysIntensity').value || 40) / 100;
    const color = document.getElementById('fxSunraysColor').value || '#fff8dc';
    const angle = (+document.getElementById('fxSunraysAngle').value || 45) * Math.PI / 180;
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    fxCtx.save();
    const t = Date.now() / 5000;
    const rayCount = 8;
    for (let i = 0; i < rayCount; i++) {
      const ox = w * ((i + 0.5) / rayCount) + Math.sin(t + i) * 30;
      const rw = 30 + Math.sin(t * 1.3 + i * 2) * 15;
      fxCtx.save();
      fxCtx.translate(ox, 0);
      fxCtx.rotate(angle - Math.PI / 2);
      const grad = fxCtx.createLinearGradient(0, 0, 0, Math.max(w, h) * 1.4);
      grad.addColorStop(0, `rgba(${r},${g},${b},${intensity * 0.5})`);
      grad.addColorStop(1, 'transparent');
      fxCtx.fillStyle = grad;
      fxCtx.fillRect(-rw, 0, rw * 2, Math.max(w, h) * 1.4);
      fxCtx.restore();
    }
    fxCtx.restore();
  }
}

function startFxLoop() {
  if (_fxAnimLoop) return;
  _fxAnimLoop = setInterval(() => requestRedraw(), 33);
}
function stopFxLoop() {
  if (_fxAnimLoop) { clearInterval(_fxAnimLoop); _fxAnimLoop = null; }
}

/* ─────────────────────────────────────────────────────────
   §19  HISTORY (UNDO / REDO)
   ───────────────────────────────────────────────────────── */
function saveHistory(label) {
  history = history.slice(0, historyIndex + 1);
  history.push({
    floor: JSON.parse(JSON.stringify(floorLayer)),
    objects: JSON.parse(JSON.stringify(objectLayer)),
    emojis: JSON.parse(JSON.stringify(emojiLayer)),
    lights: JSON.parse(JSON.stringify(lightLayer)),
    notes: JSON.parse(JSON.stringify(noteLayer)),
    labels: JSON.parse(JSON.stringify(labelLayer)),
    fog: fog.length > 0 ? fog.map(r => [...r]) : [],
    tokens: JSON.parse(JSON.stringify(tokens)),
    label: label || '—',
    time: Date.now()
  });
  historyIndex++;
  if (history.length > MAX_HISTORY) { history.shift(); historyIndex--; }
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) undoBtn.disabled = historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = true;
}

function _restoreState(s) {
  floorLayer = JSON.parse(JSON.stringify(s.floor));
  objectLayer = JSON.parse(JSON.stringify(s.objects));
  emojiLayer = JSON.parse(JSON.stringify(s.emojis || {}));
  lightLayer = JSON.parse(JSON.stringify(s.lights || {}));
  noteLayer = JSON.parse(JSON.stringify(s.notes || {}));
  labelLayer = JSON.parse(JSON.stringify(s.labels || {}));
  if (s.fog && s.fog.length > 0) fog = s.fog.map(r => [...r]);
  if (s.tokens) tokens = JSON.parse(JSON.stringify(s.tokens));
  updatePlacedTokensList();
  renderInitList();
  requestRedraw();
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  _restoreState(history[historyIndex]);
  document.getElementById('undoBtn').disabled = historyIndex <= 0;
  document.getElementById('redoBtn').disabled = historyIndex >= history.length - 1;
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  _restoreState(history[historyIndex]);
  document.getElementById('undoBtn').disabled = historyIndex <= 0;
  document.getElementById('redoBtn').disabled = historyIndex >= history.length - 1;
}

/* ─────────────────────────────────────────────────────────
   §20  EXPORT / IMPORT
   ───────────────────────────────────────────────────────── */
function exportJSON() {
  const data = {
    version: 1,
    format: 'map-beta',
    cols, rows, cellSize,
    colorPalette,
    mapName: document.getElementById('mapName').value || 'map-beta',
    bgImageDataURL: bgImageDataURL || null,
    floorLayer, objectLayer, emojiLayer, lightLayer, noteLayer, labelLayer,
    ambientLight,
    fog: fog.length > 0 ? fog : null,
    tokens, tokenLibrary,
    initList, initCur, initRound,
    settings: {
      gridColor: document.getElementById('gridColor').value,
      gridOpacity: +document.getElementById('gridOpacity').value,
      fogDmOpacity: +document.getElementById('fogDmOpacity').value,
      peekOpacity: +document.getElementById('peekOpacity').value,
      dmTokenOpacity: +document.getElementById('dmTokenOpacity').value
    },
    fxState
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const name = (data.mapName || 'map-beta').replace(/[^a-z0-9]/gi, '_');
  a.download = `${name}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJSON(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const d = JSON.parse(e.target.result);

      // Support map-beta format
      if (d.format === 'map-beta') {
        cols = d.cols || 20; rows = d.rows || 15; cellSize = d.cellSize || 40;
        floorLayer = d.floorLayer || {};
        objectLayer = d.objectLayer || {};
        emojiLayer = d.emojiLayer || {};
        lightLayer = d.lightLayer || {};
        noteLayer = d.noteLayer || {};
        labelLayer = d.labelLayer || {};
        if (d.fog) fog = d.fog;
        if (d.tokens) tokens = d.tokens;
        if (d.tokenLibrary) tokenLibrary = d.tokenLibrary;
        if (d.initList) { initList = d.initList; initCur = d.initCur || 0; initRound = d.initRound || 1; }
        if (d.ambientLight !== undefined) ambientLight = d.ambientLight;
        if (d.colorPalette) { colorPalette = d.colorPalette; initColorPalette(); }
        if (d.mapName) document.getElementById('mapName').value = d.mapName;
        if (d.settings) {
          if (d.settings.gridColor) document.getElementById('gridColor').value = d.settings.gridColor;
          if (d.settings.gridOpacity != null) document.getElementById('gridOpacity').value = d.settings.gridOpacity;
          if (d.settings.fogDmOpacity != null) document.getElementById('fogDmOpacity').value = d.settings.fogDmOpacity;
          if (d.settings.peekOpacity != null) document.getElementById('peekOpacity').value = d.settings.peekOpacity;
          if (d.settings.dmTokenOpacity != null) document.getElementById('dmTokenOpacity').value = d.settings.dmTokenOpacity;
        }
        if (d.fxState) {
          Object.assign(fxState, d.fxState);
          ['fog','particles','vignette'].forEach(fx => {
            const cb = document.getElementById('fx' + fx.charAt(0).toUpperCase() + fx.slice(1));
            if (cb) cb.checked = fxState[fx];
            const ctrl = document.getElementById('fx' + fx.charAt(0).toUpperCase() + fx.slice(1) + 'Controls');
            if (ctrl) ctrl.style.display = fxState[fx] ? '' : 'none';
          });
        }
        // Restore background image
        if (d.bgImageDataURL) {
          bgImageDataURL = d.bgImageDataURL;
          const img = new Image();
          img.onload = () => { bgImage = img; updateCanvasSize(); saveHistory('📂 Import'); };
          img.src = bgImageDataURL;
        } else {
          bgImage = null; bgImageDataURL = null;
          updateCanvasSize();
          saveHistory('📂 Import');
        }
      }
      // Support old map-maker format (v13)
      else if (d.version && d.planes) {
        cols = d.cols || 20; rows = d.rows || 15; cellSize = d.cellSize || 40;
        // Load first plane
        const planes = d.planes;
        const firstKey = Object.keys(planes)[0];
        if (firstKey && planes[firstKey]) {
          const p = planes[firstKey];
          floorLayer = p.floorLayer || {};
          objectLayer = p.objectLayer || {};
          emojiLayer = p.emojiLayer || {};
          lightLayer = p.lightLayer || {};
          noteLayer = p.noteLayer || {};
          labelLayer = p.labelLayer || {};
          if (p.ambientLight !== undefined) ambientLight = p.ambientLight;
        }
        if (d.colorPalette) { colorPalette = d.colorPalette; initColorPalette(); }
        if (d.mapName) document.getElementById('mapName').value = d.mapName;
        updateCanvasSize();
        saveHistory('📂 Import (map-maker)');
      }
      // Support old map-hider session format
      else if (d.version && d.imageData) {
        bgImageDataURL = d.imageData;
        const img = new Image();
        img.onload = () => {
          bgImage = img;
          cols = Math.ceil(img.width / (d.gridSize || 40));
          rows = Math.ceil(img.height / (d.gridSize || 40));
          cellSize = d.gridSize || 40;
          if (d.fog) fog = d.fog;
          if (d.toks) {
            tokens = d.toks.map(t => ({...t, tags: (t.conditions || []).join(',')}));
          }
          if (d.initList) { initList = d.initList; initCur = d.initCur || 0; initRound = d.initRound || 1; }
          updateCanvasSize();
          saveHistory('📂 Import (fog-of-war)');
        };
        img.src = bgImageDataURL;
      }

      document.getElementById('gridWidth').value = cols;
      document.getElementById('gridHeight').value = rows;
      document.getElementById('ambientLight').value = Math.round(ambientLight * 100);
      document.getElementById('ambientValue').textContent = Math.round(ambientLight * 100) + '%';
      updatePlacedTokensList();
      renderInitList();
      renderTokenLibrary();

    } catch (err) {
      console.error('Import error:', err);
      alert('Error: invalid file');
    }
  };
  reader.readAsText(f);
  ev.target.value = '';
}

/* ─────────────────────────────────────────────────────────
   §21  EXPORT PNG
   ───────────────────────────────────────────────────────── */
function exportPNG() {
  if (canvas.width === 0) return;
  document.getElementById('exportModal').classList.add('visible');
}

function doExportPNG(mode) {
  document.getElementById('exportModal').classList.remove('visible');
  const tc = document.createElement('canvas');
  tc.width = canvas.width; tc.height = canvas.height;
  const tx = tc.getContext('2d');

  // Background
  tx.fillStyle = '#fff';
  tx.fillRect(0, 0, tc.width, tc.height);
  if (bgImage) tx.drawImage(bgImage, 0, 0, tc.width, tc.height);

  // Floor
  for (const [k, v] of Object.entries(floorLayer)) {
    const [x, y] = k.split(',').map(Number);
    tx.fillStyle = v.color || '#f5f5dc';
    tx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    if (v.texture && textures[v.texture]) {
      const tile = _getOrRenderTile(v.texture, x, y, cellSize);
      tx.drawImage(tile, x * cellSize, y * cellSize);
    }
  }

  // Walls & emojis
  for (const [k, v] of Object.entries(objectLayer)) {
    const [x, y] = k.split(',').map(Number);
    if (v.type === 'wall-edge' && v.edgeSides) {
      const px = x * cellSize, py = y * cellSize, th = 6;
      tx.fillStyle = v.color || selectedColor;
      if (v.edgeSides.top) tx.fillRect(px, py, cellSize, th);
      if (v.edgeSides.bottom) tx.fillRect(px, py + cellSize - th, cellSize, th);
      if (v.edgeSides.left) tx.fillRect(px, py, th, cellSize);
      if (v.edgeSides.right) tx.fillRect(px + cellSize - th, py, th, cellSize);
    }
  }
  for (const [k, v] of Object.entries(emojiLayer)) {
    const [x, y] = k.split(',').map(Number);
    const sz = v.emojiSize || 1;
    const fs = Math.floor(cellSize * sz * 0.7);
    tx.font = fs + 'px serif'; tx.textAlign = 'center'; tx.textBaseline = 'middle';
    tx.fillText(v.emoji, x * cellSize + cellSize * sz / 2, y * cellSize + cellSize * sz / 2);
  }

  // Labels
  for (const [k, v] of Object.entries(labelLayer)) {
    const [x, y] = k.split(',').map(Number);
    const lx = x * cellSize + cellSize / 2, ly = y * cellSize + cellSize * 0.7;
    tx.font = 'bold 11px sans-serif'; tx.textAlign = 'center'; tx.textBaseline = 'middle';
    tx.fillStyle = 'rgba(0,0,0,0.7)'; tx.fillText(v.text, lx + 1, ly + 1);
    tx.fillStyle = v.color || '#fff'; tx.fillText(v.text, lx, ly);
  }

  // Fog
  if (fog.length > 0) {
    const fo = mode === 'player' ? 1 : (+document.getElementById('fogDmOpacity').value || 95) / 100;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (fog[r] && fog[r][c]) {
          tx.fillStyle = mode === 'player' ? '#000' : `rgba(0,0,0,${fo})`;
          tx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
  }

  // Tokens
  const gs = cellSize;
  tokens.forEach(t => {
    if (mode === 'player' && t.visible === false) return;
    const fs = Math.floor(gs * t.s * 0.65), tw = gs * t.s;
    const cx = t.x + tw / 2, cy = t.y + tw / 2;
    tx.save();
    if (mode === 'dm' && t.visible === false) tx.globalAlpha = 0.35;
    tx.font = fs + 'px serif'; tx.textAlign = 'center'; tx.textBaseline = 'middle';
    tx.fillText(t.e, cx, cy);
    if (t.l) {
      const ls = Math.max(9, Math.floor(gs * 0.26));
      tx.font = 'bold ' + ls + 'px sans-serif';
      tx.fillStyle = '#fff'; tx.strokeStyle = '#000'; tx.lineWidth = 3;
      tx.strokeText(t.l, cx, cy + fs * 0.58); tx.fillText(t.l, cx, cy + fs * 0.58);
    }
    if (t.maxHp && t.maxHp > 0) {
      const hp = Math.max(0, t.hp || 0), pct = Math.min(1, hp / t.maxHp);
      const bw = tw * 0.8, bh = Math.max(3, gs * 0.08);
      const bx = cx - bw / 2, by = t.y + tw - bh - 2;
      tx.fillStyle = '#00000088'; tx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      tx.fillStyle = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#eab308' : '#ef4444';
      tx.fillRect(bx, by, bw * pct, bh);
    }
    tx.restore();
  });

  const name = (document.getElementById('mapName').value || 'map-beta').replace(/[^a-z0-9]/gi, '_');
  const a = document.createElement('a');
  a.href = tc.toDataURL('image/png');
  a.download = `${name}-${mode}-${Date.now()}.png`;
  a.click();
}

function closeExportModal() { document.getElementById('exportModal').classList.remove('visible'); }

/* ─────────────────────────────────────────────────────────
   §22  BACKGROUND IMAGE
   ───────────────────────────────────────────────────────── */
function loadBackgroundImage(ev) {
  const file = ev ? ev.target.files[0] : null;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = re => {
    bgImageDataURL = re.target.result;
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      // Adjust grid to fit image
      cols = Math.ceil(img.width / cellSize);
      rows = Math.ceil(img.height / cellSize);
      document.getElementById('gridWidth').value = cols;
      document.getElementById('gridHeight').value = rows;
      updateCanvasSize();
      if (appMode === 'play' && fog.length === 0) initFog();
      saveHistory('🖼️ Image loaded');
    };
    img.src = bgImageDataURL;
  };
  reader.readAsDataURL(file);
  if (ev) ev.target.value = '';
}

// Drag & drop
let dragCounter = 0;
const dropOverlay = document.getElementById('dropOverlay');
canvasArea.addEventListener('dragenter', e => { e.preventDefault(); dragCounter++; dropOverlay.classList.add('visible'); });
canvasArea.addEventListener('dragleave', e => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove('visible'); } });
canvasArea.addEventListener('dragover', e => e.preventDefault());
canvasArea.addEventListener('drop', e => {
  e.preventDefault(); dragCounter = 0; dropOverlay.classList.remove('visible');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) {
    // Simulate file input
    const dt = new DataTransfer();
    dt.items.add(f);
    const input = document.getElementById('imgInput');
    input.files = dt.files;
    loadBackgroundImage({target: input});
  }
});

/* ─────────────────────────────────────────────────────────
   §23  MOUSE EVENTS
   ───────────────────────────────────────────────────────── */
overlay.addEventListener('mousedown', e => {
  if (spaceHeld) return;
  if (e.button === 2) return; // right-click handled separately
  const cell = getCellFromMouse(e);
  if (cell.x < 0 || cell.x >= cols || cell.y < 0 || cell.y >= rows) return;

  if (appMode === 'build') {
    handleBuildMouseDown(cell, e);
  } else {
    handlePlayMouseDown(cell, e);
  }
});

overlay.addEventListener('mousemove', e => {
  if (spaceHeld) return;
  const cell = getCellFromMouse(e);

  if (appMode === 'build') {
    handleBuildMouseMove(cell, e);
  } else {
    handlePlayMouseMove(cell, e);
  }
});

overlay.addEventListener('mouseup', e => {
  if (appMode === 'build') {
    handleBuildMouseUp(e);
  } else {
    handlePlayMouseUp(e);
  }
});

overlay.addEventListener('dblclick', e => {
  if (appMode !== 'play') return;
  const cell = getCellFromMouse(e);
  const gs = cellSize;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i], tw = gs * t.s;
    if (cell.px >= t.x && cell.px <= t.x + tw && cell.py >= t.y && cell.py <= t.y + tw) {
      selectPlacedToken(i);
      return;
    }
  }
});

overlay.addEventListener('mouseleave', () => {
  lastPos = null;
  ox.clearRect(0, 0, overlay.width, overlay.height);
});

/* ─── BUILD MOUSE HANDLERS ─── */
function handleBuildMouseDown(cell, e) {
  const k = `${cell.x},${cell.y}`;

  if (houseDrawActive) {
    houseIsDrawing = true;
    houseErasing = houseCells.has(k);
    paintHouseCell(cell.x, cell.y);
    requestRedraw();
    return;
  }

  if (buildTool === 'floor') {
    if (floorMode === 'fillRect') {
      rectStart = cell; rectCur = cell; isDrawing = true;
      drawOverlay();
    } else {
      isDrawing = true;
      floorLayer[k] = { color: selectedColor, texture: selectedTexture || null };
      requestRedraw();
    }
  }
  else if (buildTool === 'wall') {
    if (wallSub) {
      // Place door/window/stairs — merge into existing wall if present
      const existing = objectLayer[k];
      if (wallSub.startsWith('door-')) {
        const side = wallSub.replace('door-', '');
        if (existing && existing.type === 'wall-edge' && existing.edgeSides) {
          if (!existing.doors) existing.doors = {};
          existing.doors[side] = true;
          existing.edgeSides[side] = false;
        } else {
          objectLayer[k] = { type: 'door-edge-' + side, color: '#a0522d' };
        }
      } else if (wallSub.startsWith('window-')) {
        const side = wallSub.replace('window-', '');
        if (existing && existing.type === 'wall-edge' && existing.edgeSides) {
          if (!existing.windows) existing.windows = {};
          existing.windows[side] = true;
          existing.edgeSides[side] = false;
        } else {
          objectLayer[k] = { type: 'window-edge-' + side, color: '#87CEEB' };
        }
      } else if (wallSub === 'stairs-up' || wallSub === 'stairs-down') {
        objectLayer[k] = { type: wallSub };
      }
    } else {
      const existing = objectLayer[k];
      if (existing && existing.type === 'wall-edge') {
        // Toggle sides
      } else {
        objectLayer[k] = { type: 'wall-edge', color: selectedColor, edgeSides: {top:true, bottom:true, left:true, right:true} };
      }
    }
    saveHistory('🧱 Wall');
    requestRedraw();
  }
  else if (buildTool === 'object') {
    if (objTool === 'place') {
      const emitsLight = document.getElementById('emojiEmitsLight').checked;
      const lightType = document.getElementById('emojiLightType').value;
      emojiLayer[k] = { emoji: selectedEmoji, emojiSize: emojiSizeVal, emitsLight, lightType };
      saveHistory('😀 Object');
      requestRedraw();
    } else if (objTool === 'moveEmoji') {
      // Find emoji at cell
      if (emojiLayer[k]) { movingEmojiKey = k; }
    }
  }
  else if (buildTool === 'light') {
    if (lightLayer[k]) { delete lightLayer[k]; }
    else { lightLayer[k] = { type: currentLightType }; }
    saveHistory('💡 Light');
    requestRedraw();
  }
  else if (buildTool === 'erase') {
    if (eraseMode === 'fillRect') {
      rectStart = cell; rectCur = cell; isDrawing = true;
      drawOverlay();
    } else {
      isDrawing = true;
      delete floorLayer[k]; delete objectLayer[k]; delete emojiLayer[k];
      delete lightLayer[k]; delete noteLayer[k]; delete labelLayer[k];
      requestRedraw();
    }
  }
  else if (buildTool === 'note') {
    openNoteModal(k);
  }
  else if (buildTool === 'label') {
    openLabelModal(k);
  }
}

function handleBuildMouseMove(cell, e) {
  if (houseDrawActive && houseIsDrawing) {
    paintHouseCell(cell.x, cell.y);
    requestRedraw();
    return;
  }

  if (buildTool === 'floor' && isDrawing) {
    if (floorMode === 'fillRect') {
      rectCur = cell; drawOverlay();
    } else {
      const k = `${cell.x},${cell.y}`;
      floorLayer[k] = { color: selectedColor, texture: selectedTexture || null };
      requestRedraw();
    }
  }

  if (buildTool === 'erase' && isDrawing) {
    if (eraseMode === 'fillRect') {
      rectCur = cell; drawOverlay();
    } else {
      const k = `${cell.x},${cell.y}`;
      delete floorLayer[k]; delete objectLayer[k]; delete emojiLayer[k];
      delete lightLayer[k]; delete noteLayer[k]; delete labelLayer[k];
      requestRedraw();
    }
  }

  if (buildTool === 'object' && objTool === 'moveEmoji' && movingEmojiKey) {
    const newK = `${cell.x},${cell.y}`;
    if (newK !== movingEmojiKey) {
      emojiLayer[newK] = emojiLayer[movingEmojiKey];
      delete emojiLayer[movingEmojiKey];
      movingEmojiKey = newK;
      requestRedraw();
    }
  }
}

function handleBuildMouseUp(e) {
  if (houseIsDrawing) { houseIsDrawing = false; return; }
  // Fill-rect completion for floor
  if (buildTool === 'floor' && floorMode === 'fillRect' && isDrawing && rectStart && rectCur) {
    const x1 = Math.min(rectStart.x, rectCur.x), y1 = Math.min(rectStart.y, rectCur.y);
    const x2 = Math.max(rectStart.x, rectCur.x), y2 = Math.max(rectStart.y, rectCur.y);
    for (let fy = y1; fy <= y2; fy++)
      for (let fx = x1; fx <= x2; fx++)
        floorLayer[`${fx},${fy}`] = { color: selectedColor, texture: selectedTexture || null };
    rectStart = null; rectCur = null;
    saveHistory('🎨 Floor (rect)');
    requestRedraw(); drawOverlay();
  }
  // Fill-rect completion for erase
  else if (buildTool === 'erase' && eraseMode === 'fillRect' && isDrawing && rectStart && rectCur) {
    const x1 = Math.min(rectStart.x, rectCur.x), y1 = Math.min(rectStart.y, rectCur.y);
    const x2 = Math.max(rectStart.x, rectCur.x), y2 = Math.max(rectStart.y, rectCur.y);
    for (let fy = y1; fy <= y2; fy++)
      for (let fx = x1; fx <= x2; fx++) {
        const ek = `${fx},${fy}`;
        delete floorLayer[ek]; delete objectLayer[ek]; delete emojiLayer[ek];
        delete lightLayer[ek]; delete noteLayer[ek]; delete labelLayer[ek];
      }
    rectStart = null; rectCur = null;
    saveHistory('🧹 Erase (rect)');
    requestRedraw(); drawOverlay();
  }
  // Brush saves
  else if (buildTool === 'floor' && isDrawing) { saveHistory('🎨 Floor'); }
  else if (buildTool === 'erase' && isDrawing) { saveHistory('🧹 Erase'); }
  isDrawing = false;
  if (movingEmojiKey) { saveHistory('✋ Move emoji'); movingEmojiKey = null; }
}

/* ─── PLAY MOUSE HANDLERS ─── */
function handlePlayMouseDown(cell, e) {
  const gs = cellSize;

  // Click on a note icon → open it regardless of current tool
  const noteKey = cell.x + ',' + cell.y;
  if (noteLayer[noteKey]) {
    openNoteModal(noteKey);
    return;
  }

  if (playTool === 'fogBrush') {
    isDrawing = true;
    lastPos = cell;
    fogBrush(cell.x, cell.y);
    requestRedraw();
    return;
  }

  if (playTool === 'fogRect') {
    rectStart = cell;
    rectCur = cell;
    isDrawing = true;
    drawOverlay();
    return;
  }

  if (playTool === 'token') {
    if (selectedToken === null) return;
    // If a token already exists at this cell, switch to move/inspect it instead
    const gs = cellSize;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const tk = tokens[i], tw = gs * tk.s;
      if (cell.px >= tk.x && cell.px <= tk.x + tw && cell.py >= tk.y && cell.py <= tk.y + tw) {
        setPlayTool('moveToken');
        selectPlacedToken(i);
        movingTokenIdx = i;
        movingTokenOffset = {x: cell.px - tk.x, y: cell.py - tk.y};
        overlay.style.cursor = 'grabbing';
        return;
      }
    }
    const t = tokenLibrary[selectedToken];
    const hp = +document.getElementById('tokenHP').value || 0;
    const maxHp = +document.getElementById('tokenMaxHP').value || 0;
    const vis = document.getElementById('tokenVisible').checked;
    tokens.push({e: t.e, l: t.l, x: cell.x * gs, y: cell.y * gs, s: t.s, hp, maxHp, visible: vis, tags: ''});
    saveHistory('📌 Token');
    updatePlacedTokensList();
    renderInitList();
    requestRedraw();
    return;
  }

  if (playTool === 'moveToken') {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i], tw = gs * t.s;
      if (cell.px >= t.x && cell.px <= t.x + tw && cell.py >= t.y && cell.py <= t.y + tw) {
        movingTokenIdx = i;
        movingTokenOffset = {x: cell.px - t.x, y: cell.py - t.y};
        selectPlacedToken(i);
        overlay.style.cursor = 'grabbing';
        return;
      }
    }
    return;
  }

  if (playTool === 'measure') {
    if (!measureA) { measureA = cell; }
    else { measureB = cell; }
    drawOverlay();
    return;
  }
}

function handlePlayMouseMove(cell, e) {
  if (playTool === 'fogBrush' && isDrawing) {
    lastPos = cell;
    fogBrush(cell.x, cell.y);
    requestRedraw();
    return;
  }

  if (playTool === 'fogBrush') {
    lastPos = cell;
    drawOverlay();
    return;
  }

  if (playTool === 'fogRect' && isDrawing && rectStart) {
    rectCur = cell;
    drawOverlay();
    return;
  }

  if (movingTokenIdx !== null) {
    tokens[movingTokenIdx].x = cell.px - movingTokenOffset.x;
    tokens[movingTokenIdx].y = cell.py - movingTokenOffset.y;
    requestRedraw();
    return;
  }

  if (playTool === 'measure' && measureA && !measureB) {
    measureB = cell;
    drawOverlay();
    measureB = null;
  }
}

function handlePlayMouseUp(e) {
  if (playTool === 'fogRect' && isDrawing && rectStart && rectCur) {
    const x1 = Math.min(rectStart.x, rectCur.x), y1 = Math.min(rectStart.y, rectCur.y);
    const x2 = Math.max(rectStart.x, rectCur.x), y2 = Math.max(rectStart.y, rectCur.y);
    fogRect(x1, y1, x2, y2);
    saveHistory('⬜ Fog rect');
    rectStart = null; rectCur = null;
    isDrawing = false;
    requestRedraw();
    drawOverlay();
    return;
  }

  if (playTool === 'fogBrush' && isDrawing) {
    saveHistory('🖌️ Fog brush');
  }

  if (movingTokenIdx !== null) {
    const gs = cellSize;
    const t = tokens[movingTokenIdx];
    t.x = Math.round(t.x / gs) * gs;
    t.y = Math.round(t.y / gs) * gs;
    saveHistory('✋ Move token');
    movingTokenIdx = null;
    overlay.style.cursor = '';
    updatePlacedTokensList();
    requestRedraw();
  }

  isDrawing = false;
  lastPos = null;
}

/* ─── CONTEXT MENU ─── */
overlay.addEventListener('contextmenu', e => {
  e.preventDefault();
  const cell = getCellFromMouse(e);
  currentRightClickCell = `${cell.x},${cell.y}`;
  const menu = document.getElementById('contextMenu');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.add('visible');
});

document.addEventListener('click', () => {
  document.getElementById('contextMenu').classList.remove('visible');
});

function ctxNote() { if (currentRightClickCell) openNoteModal(currentRightClickCell); }
function ctxLabel() { if (currentRightClickCell) openLabelModal(currentRightClickCell); }
function ctxErase() {
  if (!currentRightClickCell) return;
  saveHistory('🧹 Erase');
  delete floorLayer[currentRightClickCell]; delete objectLayer[currentRightClickCell];
  delete emojiLayer[currentRightClickCell]; delete lightLayer[currentRightClickCell];
  delete noteLayer[currentRightClickCell]; delete labelLayer[currentRightClickCell];
  requestRedraw();
}
function ctxMeasure() {
  if (!currentRightClickCell) return;
  const [x, y] = currentRightClickCell.split(',').map(Number);
  setAppMode('play');
  setPlayTool('measure');
  measureA = {x, y};
  drawOverlay();
}

/* ─────────────────────────────────────────────────────────
   §24  NOTES & LABELS MODALS
   ───────────────────────────────────────────────────────── */
function openNoteModal(cellKey) {
  currentNoteCellKey = cellKey;
  const [x, y] = cellKey.split(',');
  document.getElementById('noteModalTitle').textContent = `📝 DM Note — Cell (${x},${y})`;
  const existing = noteLayer[cellKey] || {};
  document.getElementById('noteText').value = existing.text || '';
  selectedNoteIcon = existing.icon || '📝';
  document.querySelectorAll('.note-icon-btn').forEach(b => b.classList.toggle('selected', b.dataset.icon === selectedNoteIcon));
  document.getElementById('noteModal').classList.add('visible');
}
function closeNoteModal() { document.getElementById('noteModal').classList.remove('visible'); }
function selectNoteIcon(btn) {
  document.querySelectorAll('.note-icon-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedNoteIcon = btn.dataset.icon;
}
function saveNote() {
  const text = document.getElementById('noteText').value.trim();
  if (text) noteLayer[currentNoteCellKey] = {text, icon: selectedNoteIcon};
  else delete noteLayer[currentNoteCellKey];
  closeNoteModal();
  saveHistory('📝 Note');
  requestRedraw();
}
function deleteNote() {
  delete noteLayer[currentNoteCellKey];
  closeNoteModal();
  saveHistory('🗑️ Delete note');
  requestRedraw();
}

function openLabelModal(cellKey) {
  currentLabelCellKey = cellKey;
  const [x, y] = cellKey.split(',');
  document.getElementById('labelCellCoord').textContent = `${x},${y}`;
  const existing = labelLayer[cellKey] || {};
  document.getElementById('labelText').value = existing.text || '';
  document.getElementById('labelColor').value = existing.color || '#ffffff';
  updateLabelPreview();
  document.getElementById('labelModal').classList.add('visible');
}
function closeLabelModal() { document.getElementById('labelModal').classList.remove('visible'); }
function updateLabelPreview() {
  const text = document.getElementById('labelText').value || 'Label';
  const color = document.getElementById('labelColor').value;
  const prev = document.getElementById('labelPreview');
  prev.textContent = text;
  prev.style.color = color;
}
function saveLabel() {
  const text = document.getElementById('labelText').value.trim();
  const color = document.getElementById('labelColor').value;
  if (text) labelLayer[currentLabelCellKey] = {text, color};
  else delete labelLayer[currentLabelCellKey];
  closeLabelModal();
  saveHistory('🏷️ Label');
  requestRedraw();
}
function deleteLabel() {
  delete labelLayer[currentLabelCellKey];
  closeLabelModal();
  saveHistory('🗑️ Delete label');
  requestRedraw();
}

/* ─────────────────────────────────────────────────────────
   §25  MODALS & SETTINGS
   ───────────────────────────────────────────────────────── */
function showSettings() { document.getElementById('settingsModal').classList.add('visible'); }
function closeSettings() { document.getElementById('settingsModal').classList.remove('visible'); requestRedraw(); }
function toggleShortcuts() { document.getElementById('shortcutsModal').classList.toggle('visible'); }
function closeShortcuts() { document.getElementById('shortcutsModal').classList.remove('visible'); }
function toggleGrid() {
  showGrid = !showGrid;
  document.getElementById('toggleGridBtn').classList.toggle('active', showGrid);
  requestRedraw();
}

/* ─────────────────────────────────────────────────────────
   §26  CLEAR / RESET
   ───────────────────────────────────────────────────────── */
function clearAll() {
  if (!confirm('Clear the entire map?')) return;
  floorLayer = {}; objectLayer = {}; emojiLayer = {};
  lightLayer = {}; noteLayer = {}; labelLayer = {};
  fog = []; tokens = [];
  initList = []; initCur = 0; initRound = 1;
  bgImage = null; bgImageDataURL = null;
  saveHistory('🗑️ Clear');
  updatePlacedTokensList();
  renderInitList();
  requestRedraw();
}

/* ─────────────────────────────────────────────────────────
   §27  HUD
   ───────────────────────────────────────────────────────── */
function updateHUD() {
  document.getElementById('hudMode').textContent = appMode === 'build' ? 'BUILD' : 'PLAY';
  let toolLabel = '';
  if (appMode === 'build') {
    const labels = {floor:'Floor', wall:'Walls', object:'Objects', light:'Lights', erase:'Erase', note:'DM Note', label:'Zone Label'};
    toolLabel = labels[buildTool] || buildTool;
    if (buildTool === 'wall' && wallSub) toolLabel += ' → ' + wallSub;
    if (buildTool === 'object') toolLabel += ' → ' + (objTool === 'place' ? 'Place' : 'Move');
    if (buildTool === 'light') toolLabel += ' → ' + currentLightType;
  } else {
    const labels = {fogBrush:'Fog Brush', fogRect:'Fog Rectangle', token:'Place Token', moveToken:'Move / Inspect', measure:'Measure'};
    toolLabel = labels[playTool] || playTool;
    if (playTool === 'fogBrush' || playTool === 'fogRect') toolLabel += ' (' + (fogAction === 'reveal' ? 'Reveal' : 'Hide') + ')';
  }
  document.getElementById('hudTool').textContent = toolLabel;
  document.getElementById('hudColor').style.background = selectedColor;
}

/* ─────────────────────────────────────────────────────────
   §28  COLOR PALETTE & EMOJI PICKER
   ───────────────────────────────────────────────────────── */
function initColorPalette() {
  const grid = document.getElementById('colorPalette');
  grid.innerHTML = '';
  colorPalette.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'color-swatch' + (c === selectedColor ? ' active' : '');
    el.style.background = c;
    el.onclick = () => {
      selectedColor = c;
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      el.classList.add('active');
      updateHUD();
    };
    grid.appendChild(el);
  });
}

function addCustomColor() {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = selectedColor;
  input.onchange = () => {
    colorPalette.push(input.value);
    selectedColor = input.value;
    initColorPalette();
    updateHUD();
  };
  input.click();
}

function initEmojiPicker() {
  filterEmojis();
}

function filterEmojis() {
  const cat = document.getElementById('emojiCategory').value;
  filteredEmojis = cat === 'all' ? allEmojis : (emojiCategories[cat] || allEmojis);
  renderEmojiGrid();
}

function renderEmojiGrid() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  filteredEmojis.forEach(e => {
    const el = document.createElement('div');
    el.className = 'emoji-item' + (e === selectedEmoji ? ' active' : '');
    el.textContent = e;
    el.onclick = () => {
      selectedEmoji = e;
      document.querySelectorAll('.emoji-item').forEach(i => i.classList.remove('active'));
      el.classList.add('active');
    };
    grid.appendChild(el);
  });
}

/* ─────────────────────────────────────────────────────────
   §29  KEYBOARD SHORTCUTS
   ───────────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  // Ignore if typing in input
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

  if (e.code === 'Space') { spaceHeld = true; canvasArea.style.cursor = 'grab'; e.preventDefault(); return; }

  if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); exportJSON(); return; }

  const k = e.key.toLowerCase();

  // Escape: close modals, cancel actions
  if (k === 'escape') {
    closeNoteModal(); closeLabelModal(); closeSettings(); closeShortcuts(); closeExportModal();
    if (houseDrawActive) cancelHouseDrawMode();
    measureA = null; measureB = null; drawOverlay();
    return;
  }

  if (k === 'g') { toggleGrid(); return; }
  if (k === 'b') { setAppMode('build'); return; }
  if (k === 'p') { setAppMode('play'); return; }

  if (appMode === 'build') {
    if (k === '1') setBuildTool('floor');
    else if (k === '2') setBuildTool('wall');
    else if (k === '3') setBuildTool('object');
    else if (k === '4') setBuildTool('light');
    else if (k === '5') setBuildTool('erase');
  }

  if (appMode === 'play') {
    if (k === 'r') setPlayTool('fogBrush');
    else if (k === 'x') setPlayTool('fogRect');
    else if (k === 't') setPlayTool('token');
    else if (k === 'm') setPlayTool('moveToken');
    else if (k === 'i') setPlayTool('moveToken');
    else if (k === 'd') setPlayTool('measure');
    else if (k === 'v') togglePeek();
    else if (k === 'n') nextInitiative();
    else if (k === 'f') {
      setFogAction(fogAction === 'reveal' ? 'fog' : 'reveal');
    }
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'Space') { spaceHeld = false; canvasArea.style.cursor = ''; }
});

/* ─────────────────────────────────────────────────────────
   §30  FLICKER ANIMATION
   ───────────────────────────────────────────────────────── */
setInterval(() => {
  let anyFlicker = false;
  for (const k in lightLayer) {
    const lt = lightLayer[k];
    if (lightTypes[lt.type] && lightTypes[lt.type].flicker) {
      flickerOffsets[k] = (Math.random() * 2 - 1) * 0.15;
      anyFlicker = true;
    }
  }
  if (anyFlicker) requestRedraw();
}, 80);

/* ─────────────────────────────────────────────────────────
   §31  INIT
   ───────────────────────────────────────────────────────── */
(function init() {
  setAppMode('build');
  initColorPalette();
  initEmojiPicker();
  renderTokenLibrary();
  renderInitList();
  updateCanvasSize();
  saveHistory('🆕 New');
  updateHUD();

  // Minimap refresh
  setInterval(() => { if (showMinimap) drawMinimap(); }, 1000);
})();
