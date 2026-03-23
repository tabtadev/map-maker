// ═══════════════════════════════════════════════════════════
// FOG OF WAR — DM Tool — js/map-hider.js
// ═══════════════════════════════════════════════════════════

const mc=document.getElementById('mc'),oc=document.getElementById('oc');
const mx=mc.getContext('2d'),ox=oc.getContext('2d');
let img=null,imgDataURL=null,fog=[],toks=[],action='reveal',tool='brush',drawing=false;
let stok=null,didx=null,dox=0,doy=0,cols=0,rows=0;
let rectStart=null,rectCur=null;
let editIdx=null; // index of token being edited in sidebar

// Measure tool state
let measureA=null,measureB=null;

// Initiative tracker
let initList=[],initCur=0,initRound=1;

// Player view
let playerWin=null;
let playerShowGrid=false;

// DM peek mode (see through fog)
let dmPeek=false;

// D&D Conditions
const DND_CONDITIONS=[
  {id:'blinded',label:'Aveuglé',color:'#6b7280'},
  {id:'charmed',label:'Charmé',color:'#ec4899'},
  {id:'deafened',label:'Assourdi',color:'#8b5cf6'},
  {id:'frightened',label:'Effrayé',color:'#f59e0b'},
  {id:'grappled',label:'Agrippé',color:'#ef4444'},
  {id:'incapacitated',label:'Incapable',color:'#78716c'},
  {id:'invisible',label:'Invisible',color:'#67e8f9'},
  {id:'paralyzed',label:'Paralysé',color:'#fbbf24'},
  {id:'petrified',label:'Pétrifié',color:'#a8a29e'},
  {id:'poisoned',label:'Empoisonné',color:'#22c55e'},
  {id:'prone',label:'À terre',color:'#a16207'},
  {id:'restrained',label:'Entravé',color:'#dc2626'},
  {id:'stunned',label:'Étourdi',color:'#eab308'},
  {id:'unconscious',label:'Inconscient',color:'#1f2937'}
];

const GS=()=>+document.getElementById('gs').value||40;
const GO=()=>+document.getElementById('go').value/100;
const GC=()=>document.getElementById('gc').value;
const BR=()=>+document.getElementById('brs').value||1;
const FO=()=>+document.getElementById('fog-opacity').value/100;

// ─── ACTIONS & TOOLS ───
function setAction(a){
  action=a;
  ['reveal','fog'].forEach(x=>document.getElementById('b-'+x).className=(x===a?'active':'sec'));
  updateLabel();
}

function setTool(t){
  tool=t;
  ['brush','rect','token','move','inspect','measure'].forEach(x=>{
    const el=document.getElementById('b-'+x);
    if(el) el.className=(x===t?'active':'sec');
  });
  document.getElementById('brush-ctrl').style.display=t==='brush'?'flex':'none';
  oc.style.cursor=t==='move'?'grab':t==='inspect'?'help':t==='token'?'cell':t==='measure'?'crosshair':'crosshair';
  // Clear measure state when switching tools
  if(t!=='measure'){measureA=null;measureB=null;}
  updateLabel();
}

function updateLabel(){
  const al={reveal:'👁️ Révéler',fog:'🌫️ Cacher'};
  const tl={brush:'🖌️ Pinceau',rect:'⬜ Rectangle',token:'🧩 Token',move:'✋ Move',inspect:'🔍 Inspecter',measure:'📏 Mesure'};
  document.getElementById('ml').textContent=al[action]+' • '+tl[tool];
}

// ─── IMAGE LOADING ───
function loadImgFromFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=re=>{
    imgDataURL=re.target.result;
    const i=new Image();
    i.onload=()=>{
      img=i;mc.width=oc.width=i.width;mc.height=oc.height=i.height;
      document.getElementById('hint').style.display='none';
      initFog();redraw();
    };
    i.src=imgDataURL;
  };
  reader.readAsDataURL(file);
}

function loadImg(e){
  const f=e.target.files[0];if(!f)return;
  loadImgFromFile(f);
}

// ─── DRAG & DROP ───
const canvasArea=document.getElementById('ca');
const dropOverlay=document.getElementById('drop-overlay');
let dragCounter=0;

canvasArea.addEventListener('dragenter',e=>{
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.add('visible');
});
canvasArea.addEventListener('dragleave',e=>{
  e.preventDefault();
  dragCounter--;
  if(dragCounter<=0){dragCounter=0;dropOverlay.classList.remove('visible');}
});
canvasArea.addEventListener('dragover',e=>{e.preventDefault();});
canvasArea.addEventListener('drop',e=>{
  e.preventDefault();
  dragCounter=0;dropOverlay.classList.remove('visible');
  const f=e.dataTransfer.files[0];
  if(f&&f.type.startsWith('image/'))loadImgFromFile(f);
});

// ─── FOG ───
function initFog(){
  const gs=GS();cols=Math.ceil(mc.width/gs);rows=Math.ceil(mc.height/gs);
  fog=Array.from({length:rows},()=>new Array(cols).fill(true));
}

function ensureFog(){
  const gs=GS();cols=Math.ceil(mc.width/gs);rows=Math.ceil(mc.height/gs);
  while(fog.length<rows)fog.push(new Array(cols).fill(true));
  fog.forEach(r=>{while(r.length<cols)r.push(true);});
}

function clearFog(){if(!img)return;saveUndo();initFog();redraw();}
function revealAll(){if(!img)return;saveUndo();fog.forEach(r=>r.fill(false));redraw();}

// ─── MAIN REDRAW ───
function redraw(){
  if(!img)return;
  const gs=GS();ensureFog();
  mx.clearRect(0,0,mc.width,mc.height);
  mx.drawImage(img,0,0);

  // Fog
  const fo=dmPeek?(+(document.getElementById('peek-opacity').value||15)/100):FO();
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      if(fog[r]&&fog[r][c]){
        mx.fillStyle=`rgba(0,0,0,${fo})`;
        mx.fillRect(c*gs,r*gs,gs,gs);
      }
    }
  }

  // Grid
  const go=GO();
  if(go>0){
    mx.save();mx.strokeStyle=GC();mx.globalAlpha=go;mx.lineWidth=1;
    for(let c=0;c<=cols;c++){mx.beginPath();mx.moveTo(c*gs,0);mx.lineTo(c*gs,mc.height);mx.stroke();}
    for(let r=0;r<=rows;r++){mx.beginPath();mx.moveTo(0,r*gs);mx.lineTo(mc.width,r*gs);mx.stroke();}
    mx.restore();
  }

  // Tokens
  toks.forEach((t,ti)=>{
    const fs=Math.floor(gs*t.s*0.65),tw=gs*t.s,cx=t.x+tw/2,cy=t.y+tw/2;
    mx.save();

    // DM-only tokens: semi-transparent but visible to DM
    if(t.visible===false) mx.globalAlpha=(+(document.getElementById('dm-tok-opacity').value||60))/100;

    // Active initiative glow
    if(initList.length>0&&initList[initCur]&&initList[initCur].tokIdx===ti){
      mx.shadowColor='#667eea';
      mx.shadowBlur=16;
    }

    // Emoji
    mx.font=fs+'px serif';mx.textAlign='center';mx.textBaseline='middle';
    mx.fillText(t.e,cx,cy);
    mx.shadowBlur=0;

    // Label
    if(t.l){
      const ls=Math.max(9,Math.floor(gs*0.26));
      mx.font='bold '+ls+'px sans-serif';
      mx.fillStyle='#fff';mx.strokeStyle='#000';mx.lineWidth=3;
      const ly=cy+fs*0.58;mx.strokeText(t.l,cx,ly);mx.fillText(t.l,cx,ly);
    }

    // HP bar
    if(t.maxHp&&t.maxHp>0){
      const hp=Math.max(0,t.hp||0);
      const pct=Math.min(1,hp/t.maxHp);
      const bw=tw*0.8,bh=Math.max(3,gs*0.08);
      const bx=cx-bw/2,by=t.y+tw-bh-2;
      mx.fillStyle='#00000088';
      mx.fillRect(bx-1,by-1,bw+2,bh+2);
      mx.fillStyle=pct>0.5?'#22c55e':pct>0.25?'#eab308':'#ef4444';
      mx.fillRect(bx,by,bw*pct,bh);
    }

    // Condition dots
    if(t.conditions&&t.conditions.length>0){
      const dotR=Math.max(2,gs*0.06);
      t.conditions.forEach((cid,ci)=>{
        const cond=DND_CONDITIONS.find(c=>c.id===cid);
        if(!cond)return;
        const angle=(-Math.PI/2)+(ci*Math.PI*2/t.conditions.length);
        const orbitR=tw/2+dotR+2;
        const dx=cx+Math.cos(angle)*orbitR;
        const dy=cy+Math.sin(angle)*orbitR;
        mx.beginPath();mx.arc(dx,dy,dotR,0,Math.PI*2);
        mx.fillStyle=cond.color;mx.fill();
        mx.strokeStyle='#000';mx.lineWidth=1;mx.stroke();
      });
    }

    mx.restore();
  });

  drawOverlay();
  redrawPlayer();
}

// ─── OVERLAY (rect/brush preview + measure) ───
function drawOverlay(){
  ox.clearRect(0,0,oc.width,oc.height);
  const gs=GS();

  // Rect preview
  if(tool==='rect'&&rectStart&&rectCur){
    const c1=Math.min(rectStart.col,rectCur.col),r1=Math.min(rectStart.row,rectCur.row);
    const c2=Math.max(rectStart.col,rectCur.col),r2=Math.max(rectStart.row,rectCur.row);
    const x=c1*gs,y=r1*gs,w=(c2-c1+1)*gs,h=(r2-r1+1)*gs;
    ox.save();
    ox.strokeStyle=action==='reveal'?'#27ae60':'#e94560';
    ox.lineWidth=2;ox.setLineDash([6,3]);
    ox.strokeRect(x+1,y+1,w-2,h-2);
    ox.fillStyle=action==='reveal'?'rgba(39,174,96,0.15)':'rgba(233,69,96,0.15)';
    ox.fillRect(x+1,y+1,w-2,h-2);
    ox.restore();
  }

  // Brush hover preview (always, not just while drawing)
  if(tool==='brush'&&lastPos){
    const br=BR();
    const r=lastPos.row,c=lastPos.col;
    const half=Math.floor(br/2);
    ox.save();
    ox.strokeStyle=action==='reveal'?'rgba(39,174,96,0.6)':'rgba(233,69,96,0.6)';
    ox.fillStyle=action==='reveal'?'rgba(39,174,96,0.1)':'rgba(233,69,96,0.1)';
    ox.lineWidth=1.5;
    const bx=(c-half)*gs,by=(r-half)*gs,bw=br*gs,bh=br*gs;
    ox.fillRect(bx,by,bw,bh);ox.strokeRect(bx,by,bw,bh);
    ox.restore();
  }

  // Measure tool
  if(tool==='measure'&&measureA){
    ox.save();
    const ax=measureA.col*gs+gs/2,ay=measureA.row*gs+gs/2;
    // Draw A marker
    ox.beginPath();ox.arc(ax,ay,6,0,Math.PI*2);
    ox.fillStyle='#667eea';ox.fill();
    ox.strokeStyle='#fff';ox.lineWidth=2;ox.stroke();

    if(measureB){
      const bx=measureB.col*gs+gs/2,by=measureB.row*gs+gs/2;
      // Line
      ox.beginPath();ox.moveTo(ax,ay);ox.lineTo(bx,by);
      ox.strokeStyle='#667eeaaa';ox.lineWidth=2;ox.setLineDash([6,4]);ox.stroke();
      ox.setLineDash([]);
      // B marker
      ox.beginPath();ox.arc(bx,by,6,0,Math.PI*2);
      ox.fillStyle='#667eea';ox.fill();
      ox.strokeStyle='#fff';ox.lineWidth=2;ox.stroke();
      // Distance label
      const dc=Math.abs(measureB.col-measureA.col);
      const dr=Math.abs(measureB.row-measureA.row);
      const diag=Math.sqrt(dc*dc+dr*dr);
      const midX=(ax+bx)/2,midY=(ay+by)/2;
      const txt=`${diag.toFixed(1)} cases (${dc+dr} Manhattan)`;
      ox.font='bold 13px sans-serif';
      const tw=ox.measureText(txt).width;
      ox.fillStyle='#1e1e35ee';
      ox.fillRect(midX-tw/2-8,midY-22,tw+16,26);
      ox.strokeStyle='#667eea88';ox.lineWidth=1;
      ox.strokeRect(midX-tw/2-8,midY-22,tw+16,26);
      ox.fillStyle='#a5b4fc';ox.textAlign='center';ox.textBaseline='middle';
      ox.fillText(txt,midX,midY-9);
    }
    ox.restore();
  }
}

// ─── PLAYER VIEW ───
function openPlayerView(){
  if(playerWin&&!playerWin.closed){playerWin.focus();return;}
  playerWin=window.open('','_blank','width=1024,height=768,menubar=no,toolbar=no,location=no,status=no');
  if(!playerWin)return;
  playerWin.document.write(`<!DOCTYPE html><html><head><title>Fog of War \u2014 Vue Joueur</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
canvas{max-width:100vw;max-height:100vh;object-fit:contain}
.pv-toolbar{position:fixed;top:10px;right:10px;z-index:100;display:flex;gap:6px}
.pv-btn{padding:5px 12px;background:#25253ecc;border:1px solid #4a4a6a;color:#c0c0d8;border-radius:5px;font-size:12px;cursor:pointer;backdrop-filter:blur(6px);transition:all .15s}
.pv-btn:hover{background:#38385a;border-color:#667eea;color:#fff}
.pv-btn.pv-on{background:#667eea33;border-color:#667eea;color:#a5b4fc;font-weight:bold}
</style></head>
<body><canvas id="pc"></canvas>
<div class="pv-toolbar"><button id="pv-grid" class="pv-btn" onclick="window.opener.togglePlayerGrid()">\u25A6 Grille</button></div>
</body></html>`);
  playerWin.document.close();
  setTimeout(()=>redrawPlayer(),200);
}

function togglePlayerGrid(){
  playerShowGrid=!playerShowGrid;
  if(playerWin&&!playerWin.closed){
    const btn=playerWin.document.getElementById('pv-grid');
    if(btn)btn.className='pv-btn'+(playerShowGrid?' pv-on':'');
  }
  redrawPlayer();
}

function redrawPlayer(){
  if(!playerWin||playerWin.closed||!img)return;
  const pc=playerWin.document.getElementById('pc');
  if(!pc)return;
  const px=pc.getContext('2d');
  pc.width=mc.width;pc.height=mc.height;
  px.clearRect(0,0,pc.width,pc.height);
  px.drawImage(img,0,0);

  const gs=GS();
  // Fog: 100% opaque black for players (they must not see through)
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      if(fog[r]&&fog[r][c]){
        px.fillStyle='#000';
        px.fillRect(c*gs,r*gs,gs,gs);
      }
    }
  }

  // Grid (optional for players)
  if(playerShowGrid){
    const go=GO();
    if(go>0){
      px.save();px.strokeStyle=GC();px.globalAlpha=go;px.lineWidth=1;
      for(let c=0;c<=cols;c++){px.beginPath();px.moveTo(c*gs,0);px.lineTo(c*gs,pc.height);px.stroke();}
      for(let r=0;r<=rows;r++){px.beginPath();px.moveTo(0,r*gs);px.lineTo(pc.width,r*gs);px.stroke();}
      px.restore();
    }
  }

  // Visible tokens only (no DM-only tokens)
  toks.forEach(t=>{
    if(t.visible===false)return;
    const fs=Math.floor(gs*t.s*0.65),tw=gs*t.s,cx=t.x+tw/2,cy=t.y+tw/2;
    px.save();
    px.font=fs+'px serif';px.textAlign='center';px.textBaseline='middle';
    px.fillText(t.e,cx,cy);
    if(t.l){
      const ls=Math.max(9,Math.floor(gs*0.26));
      px.font='bold '+ls+'px sans-serif';
      px.fillStyle='#fff';px.strokeStyle='#000';px.lineWidth=3;
      const ly=cy+fs*0.58;px.strokeText(t.l,cx,ly);px.fillText(t.l,cx,ly);
    }
    // HP bar for players too
    if(t.maxHp&&t.maxHp>0){
      const hp=Math.max(0,t.hp||0);
      const pct=Math.min(1,hp/t.maxHp);
      const bw=tw*0.8,bh=Math.max(3,gs*0.08);
      const bx=cx-bw/2,by=t.y+tw-bh-2;
      px.fillStyle='#00000088';px.fillRect(bx-1,by-1,bw+2,bh+2);
      px.fillStyle=pct>0.5?'#22c55e':pct>0.25?'#eab308':'#ef4444';
      px.fillRect(bx,by,bw*pct,bh);
    }
    px.restore();
  });
}

// ─── COORDINATES ───
function getP(e){
  const r=oc.getBoundingClientRect();
  const sx=oc.width/r.width,sy=oc.height/r.height;
  const x=(e.clientX-r.left)*sx,y=(e.clientY-r.top)*sy;
  const gs=GS();
  return{col:Math.floor(x/gs),row:Math.floor(y/gs),x,y};
}

// ─── BRUSH ───
function brush(col,row){
  const b=BR(),h=Math.floor(b/2),f=action==='fog';
  for(let dr=-h;dr<b-h;dr++)for(let dc=-h;dc<b-h;dc++){
    const r2=row+dr,c2=col+dc;
    if(r2>=0&&r2<rows&&c2>=0&&c2<cols)fog[r2][c2]=f;
  }
}

function applyRect(c1,r1,c2,r2){
  const f=action==='fog';
  for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++){
    if(r>=0&&r<rows&&c>=0&&c<cols)fog[r][c]=f;
  }
}

let lastPos=null;

// ─── MOUSE DOWN ───
function md(e){
  if(!img)return;
  const p=getP(e);const gs=GS();

  // Measure tool
  if(tool==='measure'){
    if(!measureA){measureA={col:p.col,row:p.row};}
    else{measureB={col:p.col,row:p.row};}
    drawOverlay();return;
  }

  if(tool==='move'){
    for(let i=toks.length-1;i>=0;i--){
      const t=toks[i],tw=gs*t.s;
      if(p.x>=t.x&&p.x<=t.x+tw&&p.y>=t.y&&p.y<=t.y+tw){
        saveUndo();
        didx=i;dox=p.x-t.x;doy=p.y-t.y;oc.style.cursor='grabbing';return;
      }
    }return;
  }

  if(tool==='inspect'){
    for(let i=toks.length-1;i>=0;i--){
      const t=toks[i],tw=gs*t.s;
      if(p.x>=t.x&&p.x<=t.x+tw&&p.y>=t.y&&p.y<=t.y+tw){
        selectPlacedTok(i);
        return;
      }
    }return;
  }

  if(tool==='token'){
    if(!stok){alert('Sélectionne un token !');return;}
    saveUndo();
    const hp=+document.getElementById('t-hp').value||0;
    const maxHp=+document.getElementById('t-maxhp').value||0;
    const vis=document.getElementById('t-vis').checked;
    toks.push({e:stok.e,l:stok.l,x:p.col*gs,y:p.row*gs,s:stok.s,
      hp:hp,maxHp:maxHp,visible:vis,conditions:[]});
    updP();redraw();return;
  }

  if(tool==='rect'){
    saveUndo();
    rectStart={col:p.col,row:p.row};
    rectCur={col:p.col,row:p.row};
    drawing=true;drawOverlay();return;
  }

  // brush
  saveUndo();
  drawing=true;lastPos=p;
  brush(p.col,p.row);redraw();
}

// ─── MOUSE MOVE ───
function mm(e){
  if(!img)return;
  const p=getP(e);

  if(didx!==null){
    const t=toks[didx];t.x=p.x-dox;t.y=p.y-doy;redraw();return;
  }

  if(tool==='rect'&&drawing&&rectStart){
    rectCur={col:p.col,row:p.row};
    drawOverlay();return;
  }

  if(tool==='brush'&&drawing){
    lastPos=p;brush(p.col,p.row);redraw();return;
  }

  // hover preview for brush (always visible)
  if(tool==='brush'){lastPos=p;drawOverlay();}

  // Measure hover: update B while holding
  if(tool==='measure'&&measureA&&!measureB){
    // live preview
    measureB={col:p.col,row:p.row};
    drawOverlay();
    measureB=null; // reset so click sets it
  }
}

// ─── MOUSE UP ───
function mu(e){
  if(didx!==null){
    const gs=GS();const t=toks[didx];
    t.x=Math.round(t.x/gs)*gs;t.y=Math.round(t.y/gs)*gs;
    didx=null;oc.style.cursor='grab';updP();redraw();
  }
  if(tool==='rect'&&drawing&&rectStart&&rectCur){
    const c1=Math.min(rectStart.col,rectCur.col),r1=Math.min(rectStart.row,rectCur.row);
    const c2=Math.max(rectStart.col,rectCur.col),r2=Math.max(rectStart.row,rectCur.row);
    applyRect(c1,r1,c2,r2);
    rectStart=null;rectCur=null;
    drawing=false;redraw();return;
  }
  drawing=false;
  if(tool!=='brush')lastPos=null;
  ox.clearRect(0,0,oc.width,oc.height);
  if(tool==='brush'||tool==='measure')drawOverlay();
}

// ─── TOKEN SELECTION & LIBRARY ───
function selTok(el){
  stok={e:el.dataset.e,l:el.dataset.l,s:parseFloat(el.dataset.s)};
  document.getElementById('sb').textContent=stok.e+' '+stok.l;
  document.querySelectorAll('.ti').forEach(x=>x.classList.remove('sel'));
  el.classList.add('sel');setTool('token');
}

function addLib(){
  const e=document.getElementById('te').value||'❓';
  const l=document.getElementById('tl').value||'';
  const s=document.getElementById('tsize').value||'1';
  const d=document.createElement('div');
  d.className='ti';d.dataset.e=e;d.dataset.l=l;d.dataset.s=s;
  d.textContent=e+' '+l;d.onclick=()=>selTok(d);
  document.getElementById('lib').appendChild(d);
  document.getElementById('te').value='';document.getElementById('tl').value='';
}

// ─── PLACED TOKENS LIST ───
function updP(){
  const p=document.getElementById('plist');p.innerHTML='';
  const lp=document.getElementById('left-panel');
  toks.forEach((t,i)=>{
    const d=document.createElement('div');
    d.className='pi'+(editIdx===i?' sel-pi':'');
    const inv=t.visible===false?' tok-invis':'';
    let hpHtml='';
    if(t.maxHp&&t.maxHp>0){
      const pct=Math.min(100,Math.max(0,((t.hp||0)/t.maxHp)*100));
      const col=pct>50?'#22c55e':pct>25?'#eab308':'#ef4444';
      hpHtml=`<div class="tok-hp-bar"><div class="tok-hp-fill" style="width:${pct}%;background:${col}"></div></div>`;
    }
    d.innerHTML=`<span class="${inv}" onclick="selectPlacedTok(${i})">${t.e} ${t.l||''}${t.visible===false?' 👁‍🗨':''}</span>${hpHtml}<button class="db" onclick="event.stopPropagation();delT(${i})">✕</button>`;
    d.onclick=()=>selectPlacedTok(i);
    p.appendChild(d);
  });
  lp.style.display=toks.length>0?'flex':'none';
}

function selectPlacedTok(i){
  editIdx=i;
  const t=toks[i];
  document.getElementById('left-panel').style.display='flex';
  const ep=document.getElementById('tok-edit');
  ep.style.display='flex';
  document.getElementById('tok-edit-name').textContent=t.e+' '+(t.l||'');
  document.getElementById('edit-hp').value=t.hp||0;
  document.getElementById('edit-maxhp').value=t.maxHp||0;
  document.getElementById('edit-label').value=t.l||'';
  document.getElementById('edit-vis').checked=t.visible!==false;
  renderConditions();
  updP();
}

function editTokProp(prop,val){
  if(editIdx===null||!toks[editIdx])return;
  toks[editIdx][prop]=val;
  updP();redraw();
}

function renderConditions(){
  const grid=document.getElementById('cond-grid');
  if(!grid)return;
  grid.innerHTML='';
  const t=editIdx!==null?toks[editIdx]:null;
  if(!t)return;
  if(!t.conditions)t.conditions=[];
  DND_CONDITIONS.forEach(c=>{
    const btn=document.createElement('button');
    btn.className='cond-btn'+(t.conditions.includes(c.id)?' cond-on':'');
    btn.textContent=c.label;
    btn.style.borderColor=t.conditions.includes(c.id)?c.color:'';
    btn.onclick=()=>{
      const idx=t.conditions.indexOf(c.id);
      if(idx>=0)t.conditions.splice(idx,1);else t.conditions.push(c.id);
      renderConditions();redraw();
    };
    grid.appendChild(btn);
  });
}

function delT(i){
  saveUndo();
  toks.splice(i,1);
  if(editIdx===i){editIdx=null;document.getElementById('tok-edit').style.display='none';}
  else if(editIdx!==null&&editIdx>i)editIdx--;
  // Update initiative links
  initList.forEach(it=>{
    if(it.tokIdx===i)it.tokIdx=null;
    else if(it.tokIdx!==null&&it.tokIdx>i)it.tokIdx--;
  });
  updP();renderInitList();redraw();
}

// ─── UNDO (unified: fog + tokens) ───
const undoStack=[];
const MAX_UNDO=40;
function saveUndo(){
  if(!img)return;
  undoStack.push({
    fog:fog.map(r=>[...r]),
    toks:JSON.parse(JSON.stringify(toks))
  });
  if(undoStack.length>MAX_UNDO)undoStack.shift();
}
function applyUndo(){
  if(!undoStack.length)return;
  const snap=undoStack.pop();
  fog=snap.fog;
  toks=snap.toks;
  editIdx=null;
  document.getElementById('tok-edit').style.display='none';
  ensureFog();updP();redraw();
  // updP handles left-panel visibility
}

// ─── SAVE / LOAD SESSION ───
function saveSession(){
  if(!img){alert('Aucune carte chargée.');return;}
  const data={
    version:2,
    imageData:imgDataURL,
    fog:fog,
    toks:toks,
    gridSize:GS(),
    gridColor:GC(),
    gridOpacity:+document.getElementById('go').value,
    fogOpacity:+document.getElementById('fog-opacity').value,
    initList:initList,
    initCur:initCur,
    initRound:initRound
  };
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='fog-session-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
}

function loadSession(e){
  const f=e.target.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=re=>{
    try{
      const data=JSON.parse(re.target.result);
      // Restore image
      imgDataURL=data.imageData;
      const i=new Image();
      i.onload=()=>{
        img=i;mc.width=oc.width=i.width;mc.height=oc.height=i.height;
        document.getElementById('hint').style.display='none';
        // Restore fog
        fog=data.fog||[];
        ensureFog();
        // Restore tokens
        toks=data.toks||[];
        // Restore settings
        if(data.gridSize)document.getElementById('gs').value=data.gridSize;
        if(data.gridColor)document.getElementById('gc').value=data.gridColor;
        if(data.gridOpacity!=null){
          document.getElementById('go').value=data.gridOpacity;
          document.getElementById('go-v').textContent=data.gridOpacity+'%';
        }
        if(data.fogOpacity!=null){
          document.getElementById('fog-opacity').value=data.fogOpacity;
          document.getElementById('fo-v').textContent=data.fogOpacity+'%';
        }
        // Restore initiative
        if(data.initList){initList=data.initList;initCur=data.initCur||0;initRound=data.initRound||1;}
        updP();renderInitList();redraw();
      };
      i.src=imgDataURL;
    }catch(err){alert('Erreur de chargement: '+err.message);}
  };
  reader.readAsText(f);
  e.target.value=''; // reset for re-load
}

// ─── EXPORT PNG ───
function exportPNG(){
  if(!img){alert('Aucune carte chargée.');return;}
  document.getElementById('export-modal').classList.add('visible');
}

function doExport(mode){
  document.getElementById('export-modal').classList.remove('visible');
  const gs=GS();
  const tc=document.createElement('canvas');
  tc.width=mc.width;tc.height=mc.height;
  const tx=tc.getContext('2d');
  tx.drawImage(img,0,0);

  // Fog
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      if(fog[r]&&fog[r][c]){
        tx.fillStyle=mode==='player'?'#000':`rgba(0,0,0,${FO()})`;
        tx.fillRect(c*gs,r*gs,gs,gs);
      }
    }
  }

  // Tokens
  toks.forEach(t=>{
    if(mode==='player'&&t.visible===false)return;
    const fs=Math.floor(gs*t.s*0.65),tw=gs*t.s,cx=t.x+tw/2,cy=t.y+tw/2;
    tx.save();
    if(mode==='dm'&&t.visible===false)tx.globalAlpha=0.35;
    tx.font=fs+'px serif';tx.textAlign='center';tx.textBaseline='middle';
    tx.fillText(t.e,cx,cy);
    if(t.l){
      const ls=Math.max(9,Math.floor(gs*0.26));
      tx.font='bold '+ls+'px sans-serif';
      tx.fillStyle='#fff';tx.strokeStyle='#000';tx.lineWidth=3;
      const ly=cy+fs*0.58;tx.strokeText(t.l,cx,ly);tx.fillText(t.l,cx,ly);
    }
    if(t.maxHp&&t.maxHp>0){
      const hp=Math.max(0,t.hp||0);
      const pct=Math.min(1,hp/t.maxHp);
      const bw=tw*0.8,bh=Math.max(3,gs*0.08);
      const bx=cx-bw/2,by=t.y+tw-bh-2;
      tx.fillStyle='#00000088';tx.fillRect(bx-1,by-1,bw+2,bh+2);
      tx.fillStyle=pct>0.5?'#22c55e':pct>0.25?'#eab308':'#ef4444';
      tx.fillRect(bx,by,bw*pct,bh);
    }
    tx.restore();
  });

  const a=document.createElement('a');
  a.href=tc.toDataURL('image/png');
  a.download='fog-export-'+mode+'-'+new Date().toISOString().slice(0,10)+'.png';
  a.click();
}

// ─── INITIATIVE TRACKER ───
function addInit(){
  const name=document.getElementById('init-name').value.trim();
  const score=+document.getElementById('init-score').value||0;
  if(!name)return;
  initList.push({name,score,tokIdx:null});
  initList.sort((a,b)=>b.score-a.score);
  document.getElementById('init-name').value='';
  document.getElementById('init-score').value='';
  renderInitList();
}

function renderInitList(){
  const el=document.getElementById('init-list');
  if(!el)return;
  el.innerHTML='';
  initList.forEach((it,i)=>{
    const d=document.createElement('div');
    d.className='init-item'+(i===initCur?' init-active':'');
    // Token link dropdown
    let linkSel='<select onchange="linkInitTok('+i+',this.value)" style="width:50px;font-size:9px;background:#2a2a45;border:1px solid #3a3a60;color:#ddd;border-radius:3px;padding:1px 2px">';
    linkSel+='<option value="-1">—</option>';
    toks.forEach((t,ti)=>{linkSel+=`<option value="${ti}"${it.tokIdx===ti?' selected':''}>${t.e}${t.l?' '+t.l:''}</option>`;});
    linkSel+='</select>';
    d.innerHTML=`<span class="init-score">${it.score}</span><span class="init-name">${it.name}</span>${linkSel}<button class="db" onclick="delInit(${i})">✕</button>`;
    el.appendChild(d);
  });
  const roundEl=document.getElementById('init-round');
  if(roundEl)roundEl.textContent='Round '+initRound;
}

function linkInitTok(initIdx,tokIdx){
  initList[initIdx].tokIdx=+tokIdx>=0?+tokIdx:null;
  redraw();
}

function nextInit(){
  if(!initList.length)return;
  initCur++;
  if(initCur>=initList.length){initCur=0;initRound++;} 
  renderInitList();redraw();
}

function resetInit(){
  initCur=0;initRound=1;
  renderInitList();redraw();
}

function delInit(i){
  initList.splice(i,1);
  if(initCur>=initList.length)initCur=Math.max(0,initList.length-1);
  renderInitList();redraw();
}

// ─── COLLAPSIBLE SECTIONS ───
function toggleSection(id){
  const el=document.getElementById(id);
  const arrow=document.getElementById(id+'-arrow');
  if(!el)return;
  el.classList.toggle('collapsed');
  if(arrow)arrow.classList.toggle('collapsed');
}

// ─── SHORTCUTS MODAL ───
function toggleShortcuts(){
  const m=document.getElementById('shortcuts-modal');
  m.classList.toggle('visible');
}

// ─── ZOOM (Ctrl + wheel) ───
let zoomLevel=1;
const canvasWrap=document.getElementById('cw');
canvasArea.addEventListener('wheel',e=>{
  if(!e.ctrlKey)return;
  e.preventDefault();
  const factor=e.deltaY<0?1.15:1/1.15;
  zoomLevel=Math.min(6,Math.max(0.2,zoomLevel*factor));
  canvasWrap.style.zoom=zoomLevel;
},{passive:false});

// ─── PAN (Space + drag) ───
let spaceHeld=false,panOrigin=null;
canvasArea.addEventListener('mousedown',e=>{
  if(!spaceHeld)return;
  e.preventDefault();e.stopPropagation();
  panOrigin={x:e.clientX,y:e.clientY,sl:canvasArea.scrollLeft,st:canvasArea.scrollTop};
  canvasArea.style.cursor='grabbing';
});
document.addEventListener('mousemove',e=>{
  if(!panOrigin)return;
  canvasArea.scrollLeft=panOrigin.sl-(e.clientX-panOrigin.x);
  canvasArea.scrollTop=panOrigin.st-(e.clientY-panOrigin.y);
});
document.addEventListener('mouseup',()=>{
  if(panOrigin){panOrigin=null;canvasArea.style.cursor=spaceHeld?'grab':'';}
});

// ─── KEYBOARD SHORTCUTS ───
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')return;
  if(e.code==='Space'){spaceHeld=true;canvasArea.style.cursor='grab';e.preventDefault();return;}
  if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();applyUndo();return;}
  if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();saveSession();return;}
  const k=e.key.toLowerCase();
  if(k==='f')setAction('fog');
  if(k==='r')setAction('reveal');
  if(k==='b')setTool('brush');
  if(k==='x')setTool('rect');
  if(k==='t')setTool('token');
  if(k==='m')setTool('move');
  if(k==='i')setTool('inspect');
  if(k==='d')setTool('measure');
  if(k==='v')togglePeek();
  if(k==='n')nextInit();
  if(k==='escape'){
    // Close modals
    document.getElementById('shortcuts-modal').classList.remove('visible');
    document.getElementById('export-modal').classList.remove('visible');
    // Deselect measure
    measureA=null;measureB=null;drawOverlay();
    // Deselect token edit
    editIdx=null;document.getElementById('tok-edit').style.display='none';updP();
    // updP handles left-panel visibility
  }
});
// Close token edit on click outside left panel
document.addEventListener('mousedown',e=>{
  const ep=document.getElementById('tok-edit');
  if(ep.style.display!=='none'&&!e.target.closest('#left-panel')&&!e.target.closest('#oc')){
    closeTokenEdit();
  }
});
document.addEventListener('keyup',e=>{
  if(e.code==='Space'){spaceHeld=false;canvasArea.style.cursor='';}
});

// ─── TOGGLE PANELS (settings / session dropdowns) ───
function togglePanel(id){
  const p=document.getElementById(id);
  if(!p)return;
  const wasOpen=p.classList.contains('open');
  closeAllPanels();
  if(!wasOpen){
    // Position below the parent button
    const btn=p.parentElement.querySelector('.toolbar-btn');
    if(btn){
      const r=btn.getBoundingClientRect();
      p.style.top=(r.bottom+4)+'px';
      p.style.left=Math.max(4,r.right-220)+'px';
    }
    p.classList.add('open');
  }
}
function closeAllPanels(){
  document.querySelectorAll('.toolbar-panel').forEach(p=>p.classList.remove('open'));
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.toolbar-dropdown'))closeAllPanels();
});

// ─── DM PEEK MODE ───
function togglePeek(){
  dmPeek=!dmPeek;
  const btn=document.getElementById('b-peek');
  if(btn)btn.classList.toggle('peek-on',dmPeek);
  redraw();
}

// ─── SIDEBAR TAB SWITCHING ───
function switchTab(tab){
  document.getElementById('panel-tokens').style.display=tab==='tokens'?'':'none';
  document.getElementById('panel-combat').style.display=tab==='combat'?'':'none';
  document.getElementById('tab-tokens').className='stab'+(tab==='tokens'?' stab-active':'');
  document.getElementById('tab-combat').className='stab'+(tab==='combat'?' stab-active':'');
  if(tab==='combat')renderInitList();
}

// ─── DOUBLE-CLICK ON TOKEN TO EDIT ───
function dblClick(e){
  if(!img)return;
  const p=getP(e);const gs=GS();
  for(let i=toks.length-1;i>=0;i--){
    const t=toks[i],tw=gs*t.s;
    if(p.x>=t.x&&p.x<=t.x+tw&&p.y>=t.y&&p.y<=t.y+tw){
      selectPlacedTok(i);
      return;
    }
  }
}

// ─── DICE ROLLER ───
function rollDice(faces){
  const count=Math.max(1,+(document.getElementById('dice-count').value)||1);
  const mod=+(document.getElementById('dice-mod').value)||0;
  document.getElementById('dice-faces').value=faces;
  doRoll(count,faces,mod);
}
function rollCustomDice(){
  const count=Math.max(1,+(document.getElementById('dice-count').value)||1);
  const faces=Math.max(2,+(document.getElementById('dice-faces').value)||20);
  const mod=+(document.getElementById('dice-mod').value)||0;
  doRoll(count,faces,mod);
}
function doRoll(count,faces,mod){
  const rolls=[];
  for(let i=0;i<count;i++) rolls.push(Math.floor(Math.random()*faces)+1);
  const sum=rolls.reduce((a,b)=>a+b,0);
  const total=sum+mod;
  // Build label
  let label=count+'d'+faces;
  if(mod>0)label+='+'+mod;
  else if(mod<0)label+=mod;
  // Crit / fail detection (only for single d20)
  let cls='';
  if(count===1&&faces===20){
    if(rolls[0]===20)cls=' dice-crit';
    else if(rolls[0]===1)cls=' dice-fail';
  }
  // Detail text
  let detail='';
  if(count>1||mod!==0){
    detail='['+rolls.join(', ')+']';
    if(mod!==0) detail+=(mod>0?' + ':' − ')+Math.abs(mod);
  }
  // Inject entry
  const log=document.getElementById('dice-log');
  const el=document.createElement('div');
  el.className='dice-entry'+cls;
  el.innerHTML='<span class="dice-label">'+label+'</span><span class="dice-total">'+total+'</span>'
    +(detail?'<div class="dice-detail">'+detail+'</div>':'');
  log.prepend(el);
  // Keep max 30 entries
  while(log.children.length>30)log.lastChild.remove();
}

// ─── CLOSE TOKEN EDIT ───
function closeTokenEdit(){
  editIdx=null;
  document.getElementById('tok-edit').style.display='none';
  updP();
  // left-panel stays open if tokens still exist (updP handles it)
}

// ─── INIT ───
setTool('brush');
renderInitList();