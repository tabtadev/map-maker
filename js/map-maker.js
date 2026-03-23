        const canvas=document.getElementById('mapCanvas'),ctx=canvas.getContext('2d');
        const fxCanvas=document.getElementById('fxCanvas');
        const fxCtx=fxCanvas.getContext('2d');
        const enabledEffects={fog:false,vignette:false,tint:false,rain:false,scanlines:false,noise:false,glow:false,godray:false,lightning:false,sepia:false,portal:false,heat:false,prism:false};
        let cellSize=40,cols=20,rows=15,zoom=1,showGrid=true,currentMode='floor',currentTool='floor',selectedColor='#f5f5dc',selectedEmoji='🎮',isDrawing=false,fillStartCell=null,fillPreview=null,movingEmoji=null;
        let emojiSize=1.0; // multiplicateur taille emoji: 0.3 à 3
        let floorLayer={},objectLayer={},emojiLayer={},lightLayer={},history=[],historyIndex=-1;
        let ambientLight=1.0,currentLightType='torch';

        // ══════════════════════════════════════════════
        // MULTI-PLANE SYSTEM  (3×3 grid max = 9 plans, created on demand)
        // Layout:  [0,0][1,0][2,0]
        //          [0,1][1,1][2,1]   ← currentPlane default = {px:1,py:1} = centre
        //          [0,2][1,2][2,2]
        // ══════════════════════════════════════════════
        const PLANE_COLS = 3, PLANE_ROWS = 3;
        const MAX_PLANES = 9;

        function makePlaneData(name=''){
            return {
                name,
                floorLayer:{}, objectLayer:{}, emojiLayer:{}, lightLayer:{},
                noteLayer:{}, labelLayer:{}, freeTexts:[],
                ambientLight:1.0,
                history:[], historyIndex:-1,
                effects: null
            };
        }

        const PLANE_NAMES = [
            'NW','North','NE',
            'West','Center','East',
            'SW','South','SE'
        ];

        // planes is a sparse map: key = "px,py", value = plane data (created on demand)
        const planes = {};

        let currentPlaneX = 1, currentPlaneY = 1; // start at centre

        function planeKey(px, py){ return `${px},${py}`; }

        function getOrCreatePlane(px, py){
            const k = planeKey(px, py);
            if(!planes[k]){
                const idx = py * PLANE_COLS + px;
                planes[k] = makePlaneData(PLANE_NAMES[idx] || `Plan ${idx+1}`);
            }
            return planes[k];
        }

        function planeExists(px, py){ return !!planes[planeKey(px, py)]; }
        function countPlanes(){ return Object.keys(planes).length; }
        function currentPlane(){ return getOrCreatePlane(currentPlaneX, currentPlaneY); }

        // ── Capture all effect DOM state into an object ──────────────────
        function captureEffectState(){
            const ids = [
                'fog-density','fog-color','fog-style',
                'vig-intensity','vig-size','vig-color',
                'tint-color','tint-opacity','tint-blend',
                'rain-count','rain-speed','rain-angle','rain-style','rain-color',
                'scan-intensity','scan-spacing',
                'noise-intensity','noise-anim',
                'glow-intensity','glow-radius','glow-color','glow-style',
                'godray-intensity','godray-angle','godray-count','godray-color',
                'lightning-freq','lightning-branches','lightning-color','lightning-style',
                'sepia-intensity',
                'portal-intensity','portal-color','portal-style','portal-size',
                'heat-amplitude','heat-frequency','heat-glow',
                'prism-intensity','prism-offset','prism-style'
            ];
            const state = { enabled: {...enabledEffects}, values: {} };
            ids.forEach(id => {
                const el = document.getElementById(id);
                if(el) state.values[id] = el.value;
            });
            return state;
        }

        // ── Restore effect DOM state from a saved object ─────────────────
        function restoreEffectState(state){
            // If no saved state (new/unvisited plane), reset all effects to off
            if(!state){
                Object.keys(enabledEffects).forEach(k=>{
                    if(enabledEffects[k]){
                        enabledEffects[k]=false;
                        const btn=document.getElementById('toggle-'+k);
                        const card=document.getElementById('card-'+k);
                        if(btn) btn.classList.remove('on');
                        if(card) card.classList.remove('enabled');
                    }
                });
                stopRainLoop(); stopLightningLoop(); stopHeatLoop(); stopPortalLoop();
                fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
                return;
            }
            // Restore enabled toggles
            Object.keys(enabledEffects).forEach(k => {
                const shouldBe = state.enabled[k] || false;
                enabledEffects[k] = shouldBe;
                const btn = document.getElementById('toggle-'+k);
                const card = document.getElementById('card-'+k);
                if(btn) btn.classList.toggle('on', shouldBe);
                if(card) card.classList.toggle('enabled', shouldBe);
            });
            // Restore values
            if(state.values) Object.entries(state.values).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if(el) el.value = val;
            });
            // Restart animated effects
            if(enabledEffects.rain) initRain(); else stopRainLoop();
            if(enabledEffects.lightning) initLightning(); else stopLightningLoop();
            if(enabledEffects.heat) initHeat(); else stopHeatLoop();
            if(enabledEffects.portal) initPortal(); else stopPortalLoop();
            // Update value display spans
            const displays = [
                ['fog-density','val-fog-density','%'],['vig-intensity','val-vig-intensity','%'],
                ['vig-size','val-vig-size','%'],['tint-opacity','val-tint-opacity','%'],
                ['rain-count','val-rain-count',''],['rain-speed','val-rain-speed',''],
                ['rain-angle','val-rain-angle','°'],['scan-intensity','val-scan-intensity','%'],
                ['scan-spacing','val-scan-spacing','px'],['noise-intensity','val-noise-intensity','%'],
                ['noise-anim','val-noise-anim',''],['glow-intensity','val-glow-intensity','%'],
                ['glow-radius','val-glow-radius','px'],['godray-intensity','val-godray-intensity','%'],
                ['godray-count','val-godray-count',''],['lightning-freq','val-lightning-freq',''],
                ['lightning-branches','val-lightning-branches',''],['sepia-intensity','val-sepia-intensity','%'],
                ['portal-intensity','val-portal-intensity','%'],['portal-size','val-portal-size',''],
                ['heat-amplitude','val-heat-amplitude',''],['heat-frequency','val-heat-frequency',''],
                ['heat-glow','val-heat-glow','%'],['prism-intensity','val-prism-intensity','%'],
                ['prism-offset','val-prism-offset','']
            ];
            displays.forEach(([srcId, dispId, suffix]) => {
                const src = document.getElementById(srcId);
                const disp = document.getElementById(dispId);
                if(src && disp) disp.textContent = src.value + suffix;
            });
            applyEffects();
        }

        // ── Save current working layers into currentPlane ─────────────────
        function saveToPlanData(){
            const p = getOrCreatePlane(currentPlaneX, currentPlaneY);
            p.floorLayer   = JSON.parse(JSON.stringify(floorLayer));
            p.objectLayer  = JSON.parse(JSON.stringify(objectLayer));
            p.emojiLayer   = JSON.parse(JSON.stringify(emojiLayer));
            p.lightLayer   = JSON.parse(JSON.stringify(lightLayer));
            p.noteLayer    = JSON.parse(JSON.stringify(noteLayer));
            p.labelLayer   = JSON.parse(JSON.stringify(labelLayer));
            p.freeTexts    = JSON.parse(JSON.stringify(freeTexts));
            p.ambientLight = ambientLight;
            p.history      = JSON.parse(JSON.stringify(history));
            p.historyIndex = historyIndex;
            p.effects      = captureEffectState();
        }

        // ── Load from a plane data object into working vars ───────────────
        function loadFromPlaneData(p){
            floorLayer   = JSON.parse(JSON.stringify(p.floorLayer));
            objectLayer  = JSON.parse(JSON.stringify(p.objectLayer));
            emojiLayer   = JSON.parse(JSON.stringify(p.emojiLayer  || {}));
            lightLayer   = JSON.parse(JSON.stringify(p.lightLayer));
            noteLayer    = JSON.parse(JSON.stringify(p.noteLayer   || {}));
            labelLayer   = JSON.parse(JSON.stringify(p.labelLayer  || {}));
            freeTexts    = JSON.parse(JSON.stringify(p.freeTexts   || []));
            ambientLight = p.ambientLight !== undefined ? p.ambientLight : 1.0;
            history      = JSON.parse(JSON.stringify(p.history     || []));
            historyIndex = p.historyIndex !== undefined ? p.historyIndex : -1;
            // Restore ambient light slider
            const aSlider = document.getElementById('ambientLight');
            const aLabel  = document.getElementById('ambientValue');
            if(aSlider) aSlider.value = Math.round(ambientLight * 100);
            if(aLabel)  aLabel.textContent = Math.round(ambientLight * 100) + '%';
            restoreEffectState(p.effects);
        }

        // ── Navigate to a neighbour plane ─────────────────────────────────
        function navigatePlane(dx, dy){
            const nx = currentPlaneX + dx, ny = currentPlaneY + dy;
            if(nx < 0 || nx >= PLANE_COLS || ny < 0 || ny >= PLANE_ROWS) return;

            // If target plane doesn't exist yet, check we haven't hit the max
            if(!planeExists(nx, ny)){
                if(countPlanes() >= MAX_PLANES){
                    alert('Maximum of 9 planes reached.');
                    return;
                }
                // Create the new plane on demand
                const k = planeKey(nx, ny);
                const idx = ny * PLANE_COLS + nx;
                planes[k] = makePlaneData(PLANE_NAMES[idx] || `Plane ${idx+1}`);
            }

            // Save current
            saveToPlanData();
            // Switch
            currentPlaneX = nx; currentPlaneY = ny;
            const targetPlane = planes[planeKey(nx, ny)];
            loadFromPlaneData(targetPlane);
            updatePlaneUI();
            redrawMap();
            updateHistoryPanel();
            // Toast notification — read directly, no re-create
            const idx = ny * PLANE_COLS + nx;
            showPlaneToast(targetPlane.name || PLANE_NAMES[idx]);
        }

        function switchToPlane(px, py){
            if(px === currentPlaneX && py === currentPlaneY) return;
            // Only allow switching to existing planes or creating new if under max
            if(!planeExists(px, py) && countPlanes() >= MAX_PLANES){
                alert('Maximum of 9 planes reached.');
                return;
            }
            navigatePlane(px - currentPlaneX, py - currentPlaneY);
        }

        // ── Rename current plane ──────────────────────────────────────────
        function renamePlane(){
            const p = currentPlane();
            const idx = currentPlaneY * PLANE_COLS + currentPlaneX;
            const current = p.name || PLANE_NAMES[idx];
            const name = prompt(`Rename plane (currently: "${current}"):`, current);
            if(name !== null){ p.name = name.trim() || PLANE_NAMES[idx]; }
            updatePlaneUI();
        }

        // ── Delete current plane ──────────────────────────────────────────
        function deleteCurrentPlane(){
            if(countPlanes() <= 1){
                alert('Cannot delete the only remaining plane.');
                return;
            }
            // Read directly — never use currentPlane() here as it may re-create
            const key = planeKey(currentPlaneX, currentPlaneY);
            const p = planes[key];
            const idx = currentPlaneY * PLANE_COLS + currentPlaneX;
            const name = (p && p.name) ? p.name : PLANE_NAMES[idx];
            if(!confirm(`Delete "${name}"? All data on this plane will be permanently lost.`)) return;

            // Delete FIRST, then navigate
            delete planes[key];

            // Find the nearest existing plane to navigate to
            const existing = Object.keys(planes);
            if(existing.length > 0){
                const centreKey = planeKey(1, 1);
                const targetKey = planes[centreKey] ? centreKey : existing[0];
                const [npx, npy] = targetKey.split(',').map(Number);
                currentPlaneX = npx;
                currentPlaneY = npy;
                loadFromPlaneData(planes[targetKey]);
            } else {
                currentPlaneX = 1; currentPlaneY = 1;
                const newPlane = makePlaneData('Center');
                planes[planeKey(1,1)] = newPlane;
                loadFromPlaneData(newPlane);
            }
            saveHistory(`🗑️ Deleted plane "${name}"`);
            updatePlaneUI();
            redrawMap();
            updateHistoryPanel();
        }

        let _toastTimer = null;
        function showPlaneToast(name){
            const el = document.getElementById('planeToast');
            if(!el) return;
            el.textContent = '🗺️ ' + name;
            el.classList.add('visible');
            clearTimeout(_toastTimer);
            _toastTimer = setTimeout(()=>el.classList.remove('visible'), 2000);
        }

        // ── Update the plane grid UI ──────────────────────────────────────
        function updatePlaneUI(){
            const grid = document.getElementById('planeGrid');
            if(!grid) return;
            grid.innerHTML = '';
            const canAdd = countPlanes() < MAX_PLANES;
            for(let py=0; py<PLANE_ROWS; py++){
                for(let px=0; px<PLANE_COLS; px++){
                    const exists = planeExists(px, py);
                    const isCurrent = (px===currentPlaneX && py===currentPlaneY);
                    const cell = document.createElement('div');

                    if(exists){
                        const p = planes[planeKey(px, py)]; // direct access, never re-create here
                        const hasContent = Object.keys(p.floorLayer).length > 0 || Object.keys(p.objectLayer).length > 0;
                        cell.className = 'plane-cell' + (isCurrent?' current':'') + (hasContent?' has-content':'');
                        const idx = py * PLANE_COLS + px;
                        cell.title = `${p.name || PLANE_NAMES[idx]} — click to go here`;
                        if(hasContent || isCurrent){ const dot=document.createElement('div'); dot.className='plane-dot'; cell.appendChild(dot); }
                        cell.onclick = (()=>{ const _px=px,_py=py; return ()=>switchToPlane(_px,_py); })();
                    } else {
                        // Empty slot — show "+" if we can add more
                        cell.className = 'plane-cell plane-cell-empty';
                        cell.style.cssText = 'opacity:0.25;cursor:default;';
                        if(canAdd){
                            cell.style.cssText = 'opacity:0.4;cursor:pointer;';
                            cell.title = 'Create a new plane here';
                            cell.textContent = '+';
                            cell.style.fontSize = '10px';
                            cell.style.color = '#667eea';
                            cell.onclick = (()=>{ const _px=px,_py=py; return ()=>switchToPlane(_px,_py); })();
                        }
                    }
                    grid.appendChild(cell);
                }
            }
            // Update coord label
            const rx=currentPlaneX-1, ry=currentPlaneY-1;
            const coordStr = rx===0&&ry===0 ? 'C' : `${rx>0?'+':''}${rx},${ry>0?'+':''}${ry}`;
            const coordEl=document.getElementById('planeCoordLabel');
            if(coordEl) coordEl.textContent = coordStr;
            // Update current plane name — read directly, never call currentPlane() here
            const nameEl=document.getElementById('planeCurrentName');
            const cidx = currentPlaneY * PLANE_COLS + currentPlaneX;
            const _cp = planes[planeKey(currentPlaneX, currentPlaneY)];
            if(nameEl) nameEl.textContent = (_cp && _cp.name) ? _cp.name : PLANE_NAMES[cidx];
            // Update arrow buttons — only enabled if target exists or we can create
            const u=document.getElementById('btnPlaneUp'), d=document.getElementById('btnPlaneDown');
            const l=document.getElementById('btnPlaneLeft'), r=document.getElementById('btnPlaneRight');
            const canNavTo = (px, py) => px>=0 && px<PLANE_COLS && py>=0 && py<PLANE_ROWS && (planeExists(px,py) || canAdd);
            if(u) u.disabled = !canNavTo(currentPlaneX, currentPlaneY-1);
            if(d) d.disabled = !canNavTo(currentPlaneX, currentPlaneY+1);
            if(l) l.disabled = !canNavTo(currentPlaneX-1, currentPlaneY);
            if(r) r.disabled = !canNavTo(currentPlaneX+1, currentPlaneY);
            // Show plane count
            const countEl=document.getElementById('planeCount');
            if(countEl) countEl.textContent = `${countPlanes()}/${MAX_PLANES}`;
            // Show delete button only if more than 1 plane exists (can't delete the last one)
            const delBtn=document.getElementById('btnDeletePlane');
            if(delBtn) delBtn.style.display = countPlanes() > 1 ? 'block' : 'none';
        }

        // ── Keyboard arrow navigation ─────────────────────────────────────
        // (injected into the main keydown handler below, see case 'arrowup' etc.)

        // ── Init: load centre plane ───────────────────────────────────────
        // We init planes after JS setup — called after all functions defined

        // ── NEW: Notes, Labels, Distance, Initiative ──
        let noteLayer={};      // cell notes { text, icon }
        let labelLayer={};     // zone labels { text, color }
        let freeTexts=[];      // [{id, x, y, text, color, size, style, font}] — pixel coords
        let copiedCell=null;   // clipboard for copy/paste
        let distanceTool=false,distanceStart=null,distanceEnd=null;
        let currentRightClickCell=null;
        let selectedNoteIcon='📝';
        let currentNoteCellKey=null;
        let currentLabelCellKey=null;
        let initiativeEntries=[]; // {name, score, hp, maxHp, dead}
        let initiativeCurrentIdx=0;
        let initiativeRound=1;
        let showMinimap=false;
        let minimapRafId=null;
        
        let colorPalette=['#f5f5dc','#8B4513','#228B22','#4169E1','#808080','#DAA520','#2F4F4F','#D2691E','#4B0082','#DC143C','#00CED1','#FFD700','#FF6347','#9370DB','#20B2AA','#FF69B4','#32CD32','#FF8C00','#BA55D3','#1E90FF'];
        
        const lightTypes={
            torch:{color:'#ffaa00',range:3,intensity:0.75,flicker:true},
            candle:{color:'#ffe4b5',range:1,intensity:0.5,flicker:true},
            lantern:{color:'#fff8dc',range:5,intensity:0.85,flicker:false},
            bonfire:{color:'#ff4400',range:7,intensity:0.95,flicker:true},
            'magic-blue':{color:'#4da6ff',range:4,intensity:0.7,flicker:false},
            'magic-green':{color:'#00ff88',range:4,intensity:0.7,flicker:false},
            'magic-purple':{color:'#b366ff',range:4,intensity:0.7,flicker:false},
            inferno:{color:'#ff0044',range:5,intensity:0.85,flicker:true},
            moonlight:{color:'#b8c8ff',range:6,intensity:0.6,flicker:false},
            daylight:{color:'#ffffff',range:8,intensity:1.0,flicker:false}
        };
        
        function seededRandom(x,y,o=0){const s=x*73856093^y*19349663^o*83492791,t=Math.sin(s)*10000;return t-Math.floor(t);}
        
        // ══════════════════════════════════════════════
        // TEXTURE TILE CACHE — pre-renders each tile to an offscreen canvas
        // Key: "texture-name:x:y:cellSize" → ImageBitmap or OffscreenCanvas
        // This turns hundreds of draw calls into a single drawImage per cell.
        // ══════════════════════════════════════════════
        const _tileCache = new Map();
        let _tileCellSize = 0; // invalidate cache when cellSize changes

        function _invalidateTileCache(){ _tileCache.clear(); _tileCellSize = cellSize; }

        function _getOrRenderTile(textureName, x, y, s){
            if(_tileCellSize !== s){ _tileCache.clear(); _tileCellSize = s; }
            const key = `${textureName}:${x}:${y}`;
            if(_tileCache.has(key)) return _tileCache.get(key);

            // Render to offscreen canvas
            const oc = document.createElement('canvas');
            oc.width = s; oc.height = s;
            const octx = oc.getContext('2d');
            const def = textures[textureName];
            if(def) def.draw(octx, 0, 0, s, x, y); // draw at 0,0 in the offscreen canvas
            _tileCache.set(key, oc);
            return oc;
        }

        const textures={
            'texture-water':{draw:(c,px,py,s,x,y)=>{c.save();for(let i=0;i<3;i++){c.globalAlpha=0.3-i*0.08;c.strokeStyle=i%2?'#0077be':'#005a8f';c.lineWidth=2;c.beginPath();const o=seededRandom(x,y,i)*20;c.moveTo(px,py+i*13+o/5);c.quadraticCurveTo(px+s/2,py+i*13+5+o/5,px+s,py+i*13+o/5);c.stroke();}c.globalAlpha=0.2;c.fillStyle='#87CEEB';for(let i=0;i<2;i++){c.beginPath();c.arc(px+10+i*20,py+10+i*15,2,0,Math.PI*2);c.fill();}c.restore();}},
            'texture-grass':{draw:(c,px,py,s,x,y)=>{c.save();const col=['#1a5a1a','#2d7b2d','#3a9a3a'];for(let gx=0;gx<3;gx++){for(let gy=0;gy<3;gy++){const bX=px+(gx*s/3)+5,bY=py+(gy*s/3)+5,seed=x*1000+y*100+gx*10+gy,n=5+Math.floor(seededRandom(x,y,seed)*3);for(let b=0;b<n;b++){c.globalAlpha=0.4+seededRandom(x,y,seed+b)*0.2;c.strokeStyle=col[Math.floor(seededRandom(x,y,seed+b*10)*col.length)];c.lineWidth=1;const oX=(seededRandom(x,y,seed+b*100)-0.5)*6,oY=(seededRandom(x,y,seed+b*200)-0.5)*6,bx=bX+oX,by=bY+oY;c.beginPath();c.moveTo(bx,by+2);c.quadraticCurveTo(bx+(seededRandom(x,y,seed+b*300)-0.5)*3,by-2,bx+(seededRandom(x,y,seed+b*400)-0.5)*4,by-5);c.stroke();}}}c.restore();}},
            'texture-stone':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.3;c.strokeStyle='#444';c.lineWidth=1;for(let i=0;i<2;i++){c.beginPath();c.moveTo(px+seededRandom(x,y,i)*s,py);c.lineTo(px+seededRandom(x,y,i+10)*s,py+s);c.stroke();}for(let i=0;i<8;i++){c.fillStyle=i%2?'#555':'#666';c.beginPath();c.arc(px+seededRandom(x,y,i+20)*s,py+seededRandom(x,y,i+30)*s,1.5,0,Math.PI*2);c.fill();}c.restore();}},
            'texture-sand':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.25;for(let i=0;i<2;i++){c.fillStyle='#c9a06a';c.beginPath();c.ellipse(px+s/2,py+i*20,s/3,3,0,0,Math.PI*2);c.fill();}for(let i=0;i<12;i++){c.fillStyle='#d4a574';c.beginPath();c.arc(px+seededRandom(x,y,i)*s,py+seededRandom(x,y,i+50)*s,0.7,0,Math.PI*2);c.fill();}c.restore();}},
            'texture-lava':{draw:(c,px,py,s,x,y)=>{c.save();const col=['#ff4500','#ff6347','#ff8c00'];for(let i=0;i<3;i++){c.globalAlpha=0.35;c.strokeStyle=col[i%col.length];c.lineWidth=2.5;c.beginPath();c.moveTo(px,py+i*13);c.bezierCurveTo(px+s/3,py+i*13+8,px+2*s/3,py+i*13-2,px+s,py+i*13+5);c.stroke();}c.globalAlpha=0.5;for(let i=0;i<3;i++){c.fillStyle='#ffaa00';c.beginPath();c.arc(px+10+i*12,py+15+i*8,2.5,0,Math.PI*2);c.fill();}c.restore();}},
            'texture-ice':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.3;c.strokeStyle='#a0d8e6';c.lineWidth=1.5;for(let i=0;i<4;i++){const cx=px+10+i*8,cy=py+10+(i%2)*15;c.beginPath();c.moveTo(cx-3,cy);c.lineTo(cx+3,cy);c.moveTo(cx,cy-3);c.lineTo(cx,cy+3);c.moveTo(cx-2,cy-2);c.lineTo(cx+2,cy+2);c.moveTo(cx-2,cy+2);c.lineTo(cx+2,cy-2);c.stroke();}c.restore();}},
            'texture-wood':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.3;for(let i=0;i<6;i++){c.strokeStyle=i%2?'#5c4033':'#6b4423';c.lineWidth=1+seededRandom(x,y,i);c.beginPath();const offset=seededRandom(x,y,i+10)*s;c.moveTo(px+offset,py);c.lineTo(px+offset,py+s);c.stroke();}c.restore();}},
            'texture-marble':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.2;for(let i=0;i<3;i++){c.strokeStyle='#ccc';c.lineWidth=2;c.beginPath();c.moveTo(px+seededRandom(x,y,i*5)*s,py);c.quadraticCurveTo(px+seededRandom(x,y,i*10)*s,py+s/2,px+seededRandom(x,y,i*15)*s,py+s);c.stroke();}c.restore();}},
            'texture-brick':{draw:(c,px,py,s,x,y)=>{c.save();c.strokeStyle='#8B4513';c.lineWidth=1.5;c.globalAlpha=0.4;for(let i=0;i<2;i++){c.beginPath();c.moveTo(px,py+i*s/2);c.lineTo(px+s,py+i*s/2);c.stroke();}for(let i=0;i<2;i++){c.beginPath();c.moveTo(px+s/2,py+i*s/2);c.lineTo(px+s/2,py+(i+1)*s/2);c.stroke();}c.restore();}},
            'texture-dirt':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.25;for(let i=0;i<15;i++){c.fillStyle=['#654321','#7a5230','#8b6239'][Math.floor(seededRandom(x,y,i)*3)];c.beginPath();c.arc(px+seededRandom(x,y,i+100)*s,py+seededRandom(x,y,i+200)*s,seededRandom(x,y,i+300)*2+0.5,0,Math.PI*2);c.fill();}c.restore();}},
            'texture-moss':{draw:(c,px,py,s,x,y)=>{c.save();const col=['#2d5016','#3a6b1e','#4a7c2a'];for(let i=0;i<20;i++){c.globalAlpha=0.3+seededRandom(x,y,i)*0.2;c.fillStyle=col[Math.floor(seededRandom(x,y,i+50)*col.length)];c.beginPath();c.arc(px+seededRandom(x,y,i+100)*s,py+seededRandom(x,y,i+200)*s,seededRandom(x,y,i+300)*3+1,0,Math.PI*2);c.fill();}c.restore();}},
            'texture-snow':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.5;c.fillStyle='#fff';for(let i=0;i<8;i++){c.beginPath();c.arc(px+seededRandom(x,y,i)*s,py+seededRandom(x,y,i+50)*s,seededRandom(x,y,i+100)*2+0.5,0,Math.PI*2);c.fill();}c.restore();}},
            'texture-swamp':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.3;const col=['#3d5c2a','#4a6b35','#2d4a1e'];for(let i=0;i<3;i++){c.strokeStyle=col[i%col.length];c.lineWidth=2;c.beginPath();c.moveTo(px,py+i*12+seededRandom(x,y,i)*10);c.quadraticCurveTo(px+s/2,py+i*12+5,px+s,py+i*12+seededRandom(x,y,i+10)*10);c.stroke();}for(let i=0;i<5;i++){c.fillStyle='#2d3a1e';c.beginPath();c.arc(px+seededRandom(x,y,i+100)*s,py+seededRandom(x,y,i+200)*s,1,0,Math.PI*2);c.fill();}c.restore();}},
            'texture-crystal':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.4;for(let i=0;i<4;i++){c.strokeStyle=['#9966ff','#bb99ff','#dd66ff'][i%3];c.lineWidth=2;const cx=px+seededRandom(x,y,i*10)*s,cy=py+seededRandom(x,y,i*20)*s;c.beginPath();c.moveTo(cx,cy-5);c.lineTo(cx-3,cy+5);c.lineTo(cx+3,cy+5);c.closePath();c.stroke();}c.restore();}},
            'texture-metal':{draw:(c,px,py,s,x,y)=>{c.save();c.globalAlpha=0.25;c.strokeStyle='#666';c.lineWidth=1;for(let i=0;i<5;i++){c.beginPath();c.moveTo(px,py+i*8);c.lineTo(px+s,py+i*8);c.stroke();}for(let i=0;i<5;i++){c.beginPath();c.moveTo(px+i*8,py);c.lineTo(px+i*8,py+s);c.stroke();}c.fillStyle='#888';for(let i=0;i<3;i++){c.beginPath();c.arc(px+10+i*12,py+10,1.5,0,Math.PI*2);c.fill();}c.restore();}}
        };
        
        const emojiCategories={
            characters:['🧙','🧙‍♀️','🧝','🧝‍♀️','🧛','🧛‍♀️','🧞','🧞‍♀️','🧚','🧚‍♀️','👸','🤴','👑','🦸','🦸‍♀️','🦹','🦹‍♀️','🧑‍🦯','🧜','🧜‍♀️','🧟','🧟‍♀️','🧑‍🎤','💂','💂‍♀️','🕵️','🕵️‍♀️','👩‍⚕️','🧑‍🌾','🧑‍🍳','⚔️','🗡️','🛡️'],
            monsters:['👹','👺','👻','💀','☠️','👾','🤖','👽','👿','😈','🐉','🐲','🦎','🐍','🦂','🕷️','🦇','🦅','🦉','🐺','🐗','🦁','🐯','🐻','🦍','🐀','🦈','🐊','🦕','🦖','🐙','🦑','🧟','🐝','🐛','🦗','🦟','🦠','🐸','🦎','🐢','🦡','🦝','🦨','🐓','🦃'],
            weapons:['⚔️','🗡️','🔪','🪓','🔨','⚒️','🛠️','⛏️','🏹','🎯','🛡️','⚙️','🔗','⛓️','🧰','💣','🧨','🔫','🗺️','🧲','🪃','🏋️','🤺','🥊','🥋','🎖️'],
            treasures:['💎','💍','👑','💰','💵','💳','📦','🎁','🗃️','🧳','⚱️','🏺','🗝️','🔑','📜','🗡️','📿','🧿','🔮','💫','⭐','🌟','🎴','🃏','🎲'],
            magic:['🔮','📿','⚗️','🧪','📜','📖','🗝️','🔑','✨','💫','⭐','🌟','💥','🌀','🌙','☀️','⚡','🌈','🔯','✡️','☯️','🕎','☮️','🌐','🧿','💠','🔵','🟣','🔴','🟡','🟢','⬛','⬜','🟥','🟦'],
            environment:['🌲','🌳','🌴','🌵','🎄','🌿','☘️','🍀','🪨','🗻','⛰️','🌋','💧','🌊','🔥','⚡','❄️','☃️','🌾','🍄','🌺','🌸','🌻','🌹','🌷','🍁','🍂','🍃','🐚','🏔️','🏕️','⛺','🌑','🌕','🌤️','⛅','🌧️','🌨️','🌩️','🌪️','🌫️'],
            furniture:['🚪','🛏️','🛋️','🪑','🚽','🛁','🕯️','💡','🔦','🏮','⚰️','🗿','🖼️','🧺','🧻','🧱','🏺','⚗️','🔭','🔬','📡','🛒','🚿','🛀','🧲','🔧','🔩','🗜️','⚙️','🪝','🧯'],
            food:['🍖','🍗','🥓','🥩','🍞','🥖','🧀','🥚','🍎','🍇','🍷','🍺','🍻','☕','🍵','🍯','🍕','🌮','🥗','🍲','🥘','🫕','🧆','🥙','🌯','🥪','🧇','🥞','🧈','🍳','🥣','🥫','🍱','🍣','🦞','🦐','🍤','🦪','🧃','🥤','🍹','🍸','🥂'],
            symbols:['⚠️','🚫','❌','✅','❓','❗','💬','💭','🗯️','📍','📌','🏴','🚩','🏳️','⛳','🎌','🏁','💯','🔰','♻️','⚜️','🔱','📛','🔺','🔻','🔷','🔶','🔹','🔸','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⭕','🔴','🟠','🟡','🟢','🔵','🟣'],
            nature_symbols:['☀️','🌙','⭐','🌟','💫','✨','☁️','⛅','🌦️','🌈','❄️','🌊','🔥','⚡','🌪️','💧','🌿','🍀','🌸','🌺','🍁','🍄','🌾','🐾','🦋','🐝','🌻','🌴','🌵','⛰️','🏔️','🌋'],
        };
        let allEmojis=[];for(let c in emojiCategories)allEmojis=allEmojis.concat(emojiCategories[c]);
        let filteredEmojis=[...allEmojis];
        
        function updateAmbientLight(v){ambientLight=v/100;document.getElementById('ambientValue').textContent=v+'%';redrawMap();}
        function selectLight(type){currentLightType=type;document.querySelectorAll('.light-option').forEach(o=>o.classList.remove('active'));event.target.closest('.light-option').classList.add('active');updateHUD();}
        function clearLights(){lightLayer={};redrawMap();}
        
        function setMode(m){
            currentMode=m;
            document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
            const modeBtn = document.getElementById('mode'+m.charAt(0).toUpperCase()+m.slice(1));
            if(modeBtn) modeBtn.classList.add('active');
            document.getElementById('floorTools').style.display=m==='floor'?'block':'none';
            document.getElementById('textureTools').style.display=m==='floor'?'block':'none';
            document.getElementById('wallTools').style.display=m==='wall'?'block':'none';
            document.getElementById('doorTools').style.display='none';
            document.getElementById('objectTools').style.display=m==='object'?'block':'none';
            document.getElementById('lightTools').style.display=m==='light'?'block':'none';
            document.getElementById('fxTools').style.display=m==='fx'?'block':'none';
            if(m==='floor')setTool('floor');
            else if(m==='wall')setTool('wall-smart');
            else if(m==='object')setTool('emoji');
            else if(m==='light')setTool('place-light');
            updateHUD();
        }
        
        function initColorPalette(){const c=document.getElementById('colorPalette');c.innerHTML='';colorPalette.forEach((col,i)=>{const d=document.createElement('div');d.className='color-option'+(i===0?' active':'');d.style.background=col;d.onclick=()=>selectColor(col,d);c.appendChild(d);});}
        function addCustomColor(){const c=document.getElementById('customColorPicker').value;colorPalette.push(c);initColorPalette();}
        function selectColor(c,e){selectedColor=c;document.querySelectorAll('.color-option').forEach(o=>o.classList.remove('active'));if(e)e.classList.add('active');updateHUD();}
        function toggleWallTypes(){const c=document.getElementById('wallTypesContent'),t=event.target.closest('.collapse-toggle');c.classList.toggle('open');t.classList.toggle('open');}
        function isFillModeActive(){return document.getElementById('fillMode').checked;}
        
        function initEmojiPicker(){renderEmojiPicker();document.getElementById('emojiCategory').addEventListener('change',filterEmojis);}
        function filterEmojis(){const c=document.getElementById('emojiCategory').value;filteredEmojis=c==='all'?[...allEmojis]:[...emojiCategories[c]];renderEmojiPicker();}
        function renderEmojiPicker(){const g=document.getElementById('emojiGrid');g.innerHTML='';filteredEmojis.forEach(e=>{const b=document.createElement('button');b.textContent=e;b.className='emoji-btn';b.onclick=()=>selectEmoji(e);g.appendChild(b);});}
        function selectEmoji(e){selectedEmoji=e;document.getElementById('currentEmoji').textContent=e;}
        
        function updateCanvasSize(){
            canvas.width=cols*cellSize;
            canvas.height=rows*cellSize;
            fxCanvas.width=canvas.width;
            fxCanvas.height=canvas.height;
            _applyZoom();
            redrawMap();
            if(typeof applyEffects==='function')applyEffects();
        }
        function drawGrid(){
            if(!showGrid)return;
            ctx.strokeStyle='#ddd';
            ctx.lineWidth=1;
            ctx.beginPath();
            for(let x=0;x<=canvas.width;x+=cellSize){ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);}
            for(let y=0;y<=canvas.height;y+=cellSize){ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);}
            ctx.stroke();
        }
        
        function isOpaqueTile(x,y){
            if(x<0||x>=cols||y<0||y>=rows)return false;
            const k=`${x},${y}`,obj=objectLayer[k];
            if(!obj||!obj.type)return false;
            const t=obj.type;
            // Regular windows (center and edge) let light through
            if(t==='window-vertical'||t==='window-horizontal'||t.startsWith('window-edge-')&&!t.includes('barricaded'))return false;
            // Walls, doors, barricaded windows all block
            return t.startsWith('wall')||t.startsWith('door')||t.includes('barricaded');
        }

        function lineOfSight(x1,y1,x2,y2){
            const dx=Math.abs(x2-x1),dy=Math.abs(y2-y1),sx=x1<x2?1:-1,sy=y1<y2?1:-1;
            let err=dx-dy,x=x1,y=y1;
            while(true){
                if(x===x2&&y===y2)return true;
                // Block on opaque tile (skip source cell)
                if((x!==x1||y!==y1)&&isOpaqueTile(x,y))return false;
                const e2=2*err;
                if(e2>-dy){err-=dy;x+=sx;}
                if(e2<dx){err+=dx;y+=sy;}
            }
        }
        
        function getFalloff(dist,range){
            const t=Math.max(0,1-(dist/range));
            const type=document.getElementById('falloffType')?document.getElementById('falloffType').value:'quadratic';
            if(type==='linear')return t;
            if(type==='quadratic')return t*t;
            if(type==='cubic')return t*t*t;
            if(type==='smooth')return t*t*(3-2*t);
            return t*t;
        }

        function updateFalloffLabel(){
            const v=document.getElementById('falloffType').value;
            const labels={linear:'Linear',quadratic:'Quadratic',cubic:'Cubic',smooth:'Smooth'};
            document.getElementById('falloffValue').textContent=labels[v]||v;
        }

        let flickerOffsets={};
        function updateFlicker(){
            const amount=parseInt(document.getElementById('flickerAmount').value)/100;
            if(amount>0){
                if(!window._flickerInterval)window._flickerInterval=setInterval(()=>{for(let k in lightLayer){const lt=lightLayer[k];if(lightTypes[lt.type]&&lightTypes[lt.type].flicker){const a=parseInt(document.getElementById('flickerAmount').value)/100;flickerOffsets[k]=(Math.random()*2-1)*a;}}redrawMap();},80);
            }else{
                clearInterval(window._flickerInterval);window._flickerInterval=null;flickerOffsets={};redrawMap();
            }
        }
        
        function calculateLighting(){
            const lightMap=new Array(cols*rows).fill(0);
            const wallLightMap=new Array(cols*rows).fill(0);
            const softness=document.getElementById('lightSoftness')?parseInt(document.getElementById('lightSoftness').value)/100:0.5;

            // Build combined list of light sources: lightLayer + emitting emojis in objectLayer
            const allLights=[];
            for(let key in lightLayer){
                const[lx,ly]=key.split(',').map(Number);
                allLights.push({key,lx,ly,ltype:lightLayer[key].type});
            }
            for(let key in emojiLayer){
                const obj=emojiLayer[key];
                if(!obj.emitsLight)continue;
                const[lx,ly]=key.split(',').map(Number);
                allLights.push({key:'obj_'+key,lx,ly,ltype:obj.lightType||'torch'});
            }

            for(const {key,lx,ly,ltype} of allLights){
                const ldef=lightTypes[ltype];
                if(!ldef)continue;
                const range=ldef.range;
                let intensity=ldef.intensity;
                if(flickerOffsets[key])intensity=Math.max(0,Math.min(1,intensity+flickerOffsets[key]));
                for(let y=Math.max(0,ly-range);y<=Math.min(rows-1,ly+range);y++){
                    for(let x=Math.max(0,lx-range);x<=Math.min(cols-1,lx+range);x++){
                        const dist=Math.sqrt((x-lx)**2+(y-ly)**2);
                        if(dist<=range+softness&&lineOfSight(lx,ly,x,y)){
                            const effDist=Math.max(0,dist-softness*0.5);
                            const effRange=range+softness*range*0.3;
                            const falloff=getFalloff(effDist,effRange);
                            let value=falloff*intensity;
                            const idx=y*cols+x;
                            const ck=`${x},${y}`,co=objectLayer[ck];
                            if(co&&co.type&&(co.type.startsWith('wall')||co.type.startsWith('door')||co.type.includes('barricaded'))){
                                wallLightMap[idx]=Math.max(wallLightMap[idx],value);
                                if(co.type==='wall-edge'&&co.edgeSides){
                                    const s=co.edgeSides,dx=x-lx,dy=y-ly;
                                    let hitsExterior=false;
                                    if(dx<0&&s.right)hitsExterior=true;
                                    if(dx>0&&s.left)hitsExterior=true;
                                    if(dy<0&&s.bottom)hitsExterior=true;
                                    if(dy>0&&s.top)hitsExterior=true;
                                    if(!hitsExterior)lightMap[idx]=Math.max(lightMap[idx],value);
                                } else {
                                    lightMap[idx]=Math.max(lightMap[idx],Math.min(value,0.1));
                                }
                            } else {
                                lightMap[idx]=Math.max(lightMap[idx],value);
                            }
                        }
                    }
                }
            }
            return {lightMap,wallLightMap};
        }
        
        // ── Throttled redraw via requestAnimationFrame ──────────────────
        let _redrawPending = false;
        function redrawMap(){
            if(_redrawPending) return;
            _redrawPending = true;
            requestAnimationFrame(()=>{
                _redrawPending = false;
                _doRedrawMap();
            });
        }
        function _doRedrawMap(){
            ctx.clearRect(0,0,canvas.width,canvas.height);
            for(let k in floorLayer){const c=floorLayer[k],[x,y]=k.split(',').map(Number);drawFloorCell(x,y,c.color,c.texture);}
            drawGrid();
            for(let k in objectLayer){const c=objectLayer[k],[x,y]=k.split(',').map(Number);if(c.type==='wall-edge'){drawEdgeWall(x,y,c.color,c.edgeSides||{});}else{drawObjectCell(x,y,c.type,c.color,c.emoji,c.emojiSize||1);}}
            // Emoji layer — 3rd layer, drawn over walls/objects, does not replace them
            for(let k in emojiLayer){const e=emojiLayer[k],[x,y]=k.split(',').map(Number);const px=x*cellSize,py=y*cellSize,ctr=cellSize/2;ctx.font=`${Math.round(cellSize*(e.emojiSize||1))}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e.emoji,px+ctr,py+ctr);}
            drawHousePreview();
            
            // Skip expensive lighting if no lights and full ambient
            const hasLights = Object.keys(lightLayer).length > 0 || Object.values(emojiLayer).some(o=>o.emitsLight);
            if(hasLights || ambientLight < 1.0){
                const {lightMap,wallLightMap}=calculateLighting();

            // 1) Darken floor of all cells
            ctx.globalCompositeOperation='multiply';
            for(let y=0;y<rows;y++){
                for(let x=0;x<cols;x++){
                    const px=x*cellSize,py=y*cellSize;
                    const totalLight=Math.min(1,ambientLight+lightMap[y*cols+x]);
                    const darkness=1-totalLight;
                    if(darkness>0){ctx.fillStyle=`rgba(0,0,0,${darkness})`;ctx.fillRect(px,py,cellSize,cellSize);}
                }
            }
            ctx.globalCompositeOperation='source-over';

            // 2) Redraw wall-edge faces on top with their own wall lighting
            const th=6;
            for(let k in objectLayer){
                const c=objectLayer[k],[x,y]=k.split(',').map(Number);
                if(c.type!=='wall-edge')continue;
                const s=c.edgeSides||{};
                const px=x*cellSize,py=y*cellSize;
                const wLight=Math.min(1,ambientLight+wallLightMap[y*cols+x]);
                const wDark=1-wLight;
                // Redraw face in wall color
                ctx.fillStyle=c.color||selectedColor;
                if(s.top)    ctx.fillRect(px,py,cellSize,th);
                if(s.bottom) ctx.fillRect(px,py+cellSize-th,cellSize,th);
                if(s.left)   ctx.fillRect(px,py,th,cellSize);
                if(s.right)  ctx.fillRect(px+cellSize-th,py,th,cellSize);
                // Apply darkness over just the face
                if(wDark>0){
                    ctx.globalCompositeOperation='multiply';
                    ctx.fillStyle=`rgba(0,0,0,${wDark})`;
                    if(s.top)    ctx.fillRect(px,py,cellSize,th);
                    if(s.bottom) ctx.fillRect(px,py+cellSize-th,cellSize,th);
                    if(s.left)   ctx.fillRect(px,py,th,cellSize);
                    if(s.right)  ctx.fillRect(px+cellSize-th,py,th,cellSize);
                    ctx.globalCompositeOperation='source-over';
                }
            }
            
            ctx.globalCompositeOperation='screen';
            // lightLayer sources
            for(let key in lightLayer){
                const[x,y]=key.split(',').map(Number);
                const light=lightLayer[key];
                const px=x*cellSize+cellSize/2,py=y*cellSize+cellSize/2;
                const range=lightTypes[light.type].range*cellSize;
                const color=lightTypes[light.type].color;
                const grad=ctx.createRadialGradient(px,py,0,px,py,range);
                grad.addColorStop(0,color+'66');
                grad.addColorStop(0.5,color+'22');
                grad.addColorStop(1,color+'00');
                ctx.fillStyle=grad;
                ctx.fillRect(px-range,py-range,range*2,range*2);
            }
            // Emoji light sources glow
            for(let key in emojiLayer){
                const obj=emojiLayer[key];
                if(!obj.emitsLight)continue;
                const[x,y]=key.split(',').map(Number);
                const px=x*cellSize+cellSize/2,py=y*cellSize+cellSize/2;
                const ldef=lightTypes[obj.lightType||'torch'];
                if(!ldef)continue;
                const range=ldef.range*cellSize;
                const grad=ctx.createRadialGradient(px,py,0,px,py,range);
                grad.addColorStop(0,ldef.color+'55');
                grad.addColorStop(0.5,ldef.color+'18');
                grad.addColorStop(1,ldef.color+'00');
                ctx.fillStyle=grad;
                ctx.fillRect(px-range,py-range,range*2,range*2);
            }
            ctx.globalCompositeOperation='source-over';
            
            if(document.getElementById('showLightIcons').checked){
                for(let key in lightLayer){
                    const[x,y]=key.split(',').map(Number);
                    const light=lightLayer[key];
                    const px=x*cellSize,py=y*cellSize;
                    ctx.font='20px Arial';
                    ctx.textAlign='center';
                    ctx.textBaseline='middle';
                    const icon=light.type.includes('magic')?'✨':light.type==='torch'?'🔥':light.type==='candle'?'🕯️':light.type==='lantern'?'🏮':'☀️';
                    ctx.fillText(icon,px+cellSize/2,py+cellSize/2);
                }
            }
            } // end if(hasLights || ambientLight < 1.0)
            
            if(fillPreview){ctx.strokeStyle='#667eea';ctx.lineWidth=3;ctx.setLineDash([5,5]);ctx.strokeRect(fillPreview.x*cellSize,fillPreview.y*cellSize,fillPreview.width*cellSize,fillPreview.height*cellSize);ctx.setLineDash([]);}
            // NEW: draw notes, labels, distance
            _drawNotesAndLabels();
            _drawDistanceLine();
        }
        
        function drawFloorCell(x,y,c,t){
            const px=x*cellSize,py=y*cellSize;
            ctx.fillStyle=c;
            ctx.fillRect(px,py,cellSize,cellSize);
            if(t&&textures[t]){
                const tile=_getOrRenderTile(t,x,y,cellSize);
                ctx.drawImage(tile,px,py);
            }
        }
        function drawObjectCell(x,y,t,c,e,sz){const px=x*cellSize,py=y*cellSize,ctr=cellSize/2,p=2,w=8;ctx.fillStyle=c||selectedColor;switch(t){case'wall-full':ctx.fillRect(px+p,py+p,cellSize-p*2,cellSize-p*2);break;case'wall-dot':ctx.fillRect(px+ctr-w/2,py+ctr-w/2,w,w);break;case'wall-top':case'wall-bottom':ctx.fillRect(px+p,py+ctr-w/2,cellSize-p*2,w);break;case'wall-left':case'wall-right':ctx.fillRect(px+ctr-w/2,py+p,w,cellSize-p*2);break;case'wall-tl':ctx.fillRect(px+ctr-w/2,py+ctr-w/2,w,cellSize/2+w/2);ctx.fillRect(px+ctr-w/2,py+ctr-w/2,cellSize/2+w/2,w);break;case'wall-tr':ctx.fillRect(px+ctr-w/2,py+ctr-w/2,w,cellSize/2+w/2);ctx.fillRect(px+p,py+ctr-w/2,cellSize/2+w/2,w);break;case'wall-bl':ctx.fillRect(px+ctr-w/2,py+p,w,cellSize/2+w/2);ctx.fillRect(px+ctr-w/2,py+ctr-w/2,cellSize/2+w/2,w);break;case'wall-br':ctx.fillRect(px+ctr-w/2,py+p,w,cellSize/2+w/2);ctx.fillRect(px+p,py+ctr-w/2,cellSize/2+w/2,w);break;case'wall-t-top':ctx.fillRect(px+p,py+ctr-w/2,cellSize-p*2,w);ctx.fillRect(px+ctr-w/2,py+p,w,cellSize/2+w/2);break;case'wall-t-bottom':ctx.fillRect(px+p,py+ctr-w/2,cellSize-p*2,w);ctx.fillRect(px+ctr-w/2,py+ctr-w/2,w,cellSize/2+w/2);break;case'wall-t-left':ctx.fillRect(px+ctr-w/2,py+p,w,cellSize-p*2);ctx.fillRect(px+p,py+ctr-w/2,cellSize/2+w/2,w);break;case'wall-t-right':ctx.fillRect(px+ctr-w/2,py+p,w,cellSize-p*2);ctx.fillRect(px+ctr-w/2,py+ctr-w/2,cellSize/2+w/2,w);break;case'wall-cross':ctx.fillRect(px+p,py+ctr-w/2,cellSize-p*2,w);ctx.fillRect(px+ctr-w/2,py+p,w,cellSize-p*2);break;case'door-vertical':ctx.fillStyle='#8B4513';ctx.fillRect(px+10,py+p,cellSize-20,cellSize-p*2);ctx.fillStyle='#DAA520';ctx.beginPath();ctx.arc(px+cellSize-12,py+ctr,3,0,Math.PI*2);ctx.fill();break;case'door-horizontal':ctx.fillStyle='#8B4513';ctx.fillRect(px+p,py+10,cellSize-p*2,cellSize-20);ctx.fillStyle='#DAA520';ctx.beginPath();ctx.arc(px+ctr,py+cellSize-12,3,0,Math.PI*2);ctx.fill();break;
// EDGE DOORS — thin bar on actual border, like wall-edge
case'door-edge-top':case'door-edge-bottom':case'door-edge-left':case'door-edge-right':{
    const th=6;
    const isTop=t==='door-edge-top',isBot=t==='door-edge-bottom',isLeft=t==='door-edge-left';
    let rx,ry,rw,rh;
    if(isTop){rx=px;ry=py;rw=cellSize;rh=th;}
    else if(isBot){rx=px;ry=py+cellSize-th;rw=cellSize;rh=th;}
    else if(isLeft){rx=px;ry=py;rw=th;rh=cellSize;}
    else{rx=px+cellSize-th;ry=py;rw=th;rh=cellSize;}
    // Door frame (dark brown)
    ctx.fillStyle='#5C3010';ctx.fillRect(rx,ry,rw,rh);
    // Door panel (lighter brown), inset
    const ins=1;
    ctx.fillStyle='#8B4513';ctx.fillRect(rx+ins,ry+ins,rw-ins*2,rh-ins*2);
    // Door knob
    ctx.fillStyle='#DAA520';ctx.beginPath();
    const kx=rx+rw/2+(isTop||isBot?rw*0.25:0),ky=ry+rh/2+(isLeft||!isTop&&!isBot?rh*0.25:0);
    ctx.arc(rx+rw/2,ry+rh/2,Math.min(rw,rh)*0.22,0,Math.PI*2);ctx.fill();
    break;}case'window-vertical':ctx.fillStyle='#87CEEB';ctx.fillRect(px+10,py+p,cellSize-20,cellSize-p*2);ctx.strokeStyle='#666';ctx.lineWidth=2;ctx.strokeRect(px+10,py+p,cellSize-20,cellSize-p*2);ctx.beginPath();ctx.moveTo(px+ctr,py+p);ctx.lineTo(px+ctr,py+cellSize-p);ctx.stroke();break;case'window-horizontal':ctx.fillStyle='#87CEEB';ctx.fillRect(px+p,py+10,cellSize-p*2,cellSize-20);ctx.strokeStyle='#666';ctx.lineWidth=2;ctx.strokeRect(px+p,py+10,cellSize-p*2,cellSize-20);ctx.beginPath();ctx.moveTo(px+p,py+ctr);ctx.lineTo(px+cellSize-p,py+ctr);ctx.stroke();break;
case'window-barricaded-vertical':ctx.fillStyle='#87CEEB';ctx.fillRect(px+10,py+p,cellSize-20,cellSize-p*2);ctx.strokeStyle='#5a3a1a';ctx.lineWidth=2;ctx.strokeRect(px+10,py+p,cellSize-20,cellSize-p*2);ctx.strokeStyle='#8B4513';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px+10,py+p+4);ctx.lineTo(px+cellSize-10,py+cellSize-p-4);ctx.moveTo(px+cellSize-10,py+p+4);ctx.lineTo(px+10,py+cellSize-p-4);ctx.stroke();break;
case'window-barricaded-horizontal':ctx.fillStyle='#87CEEB';ctx.fillRect(px+p,py+10,cellSize-p*2,cellSize-20);ctx.strokeStyle='#5a3a1a';ctx.lineWidth=2;ctx.strokeRect(px+p,py+10,cellSize-p*2,cellSize-20);ctx.strokeStyle='#8B4513';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px+p+4,py+10);ctx.lineTo(px+cellSize-p-4,py+cellSize-10);ctx.moveTo(px+cellSize-p-4,py+10);ctx.lineTo(px+p+4,py+cellSize-10);ctx.stroke();break;
// EDGE WINDOWS (drawn on the actual border of the cell, like wall-edge)
case'window-edge-top':case'window-edge-bottom':case'window-edge-left':case'window-edge-right':
case'window-edge-barricaded-top':case'window-edge-barricaded-bottom':case'window-edge-barricaded-left':case'window-edge-barricaded-right':{
    const th=6,isBad=t.includes('barricaded');
    const isTop=t.endsWith('top'),isBot=t.endsWith('bottom'),isLeft=t.endsWith('left'),isRight=t.endsWith('right');
    let rx,ry,rw,rh;
    if(isTop){rx=px;ry=py;rw=cellSize;rh=th;}
    else if(isBot){rx=px;ry=py+cellSize-th;rw=cellSize;rh=th;}
    else if(isLeft){rx=px;ry=py;rw=th;rh=cellSize;}
    else{rx=px+cellSize-th;ry=py;rw=th;rh=cellSize;}
    ctx.fillStyle='#87CEEB';ctx.fillRect(rx,ry,rw,rh);
    ctx.strokeStyle=isBad?'#5a3a1a':'#4a9ec0';ctx.lineWidth=1.5;ctx.strokeRect(rx,ry,rw,rh);
    if(isBad){ctx.strokeStyle='#8B4513';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(rx+2,ry+2);ctx.lineTo(rx+rw-2,ry+rh-2);ctx.moveTo(rx+rw-2,ry+2);ctx.lineTo(rx+2,ry+rh-2);ctx.stroke();}
    else{// glass reflection line
        ctx.strokeStyle='rgba(255,255,255,0.6)';ctx.lineWidth=1;ctx.beginPath();
        if(isTop||isBot){ctx.moveTo(rx+4,ry+rh/2);ctx.lineTo(rx+rw-4,ry+rh/2);}
        else{ctx.moveTo(rx+rw/2,ry+4);ctx.lineTo(rx+rw/2,ry+rh-4);}
        ctx.stroke();
    }
    break;}case'stairs-up':ctx.fillStyle=c||selectedColor;for(let i=0;i<5;i++)ctx.fillRect(px+5,py+5+i*7,cellSize-10,6);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px+cellSize-8,py+5);ctx.lineTo(px+ctr,py+cellSize/2);ctx.lineTo(px+cellSize-8,py+cellSize-5);ctx.stroke();break;case'stairs-down':ctx.fillStyle=c||selectedColor;for(let i=0;i<5;i++)ctx.fillRect(px+5,py+5+i*7,cellSize-10,6);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px+8,py+5);ctx.lineTo(px+ctr,py+cellSize/2);ctx.lineTo(px+8,py+cellSize-5);ctx.stroke();break;case'emoji':ctx.font=`${Math.round(cellSize*(sz||1))}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e||selectedEmoji,px+ctr,py+ctr);break;}}
        
        function getCellFromMouse(e){const r=canvas.getBoundingClientRect(),sX=canvas.width/r.width,sY=canvas.height/r.height;return{x:Math.floor(((e.clientX-r.left)*sX)/cellSize),y:Math.floor(((e.clientY-r.top)*sY)/cellSize)};}

        // ── HUD & CURSOR SYSTEM ──────────────────────────────────────────
        const HUD_INFO = {
            // tool key → { icon, label, cursor, hint }
            'floor':        { icon:'🖌️', label:'Paint Floor',      cursor:'crosshair', hint:'Click/drag to paint' },
            'erase':        { icon:'🧹', label:'Erase',           cursor:'cell',      hint:'Click to erase a cell' },
            'move-emoji':   { icon:'✋', label:'Move Object',    cursor:'grab',      hint:'Click an emoji to move it' },
            'place-light':  { icon:'💡', label:'Place Light',     cursor:'crosshair', hint:'Click to place a light source' },
            'emoji':        { icon:'😀', label:'Place Emoji',      cursor:'copy',      hint:'Click to place the selected emoji' },
            'wall-smart':   { icon:'✨', label:'Smart Wall',   cursor:'crosshair', hint:'Walls auto-connect to neighbors' },
            'wall-full':    { icon:'█',  label:'Full Wall',         cursor:'crosshair', hint:'Click to place a wall' },
            'wall-top':     { icon:'━',  label:'Horizontal Wall',    cursor:'crosshair', hint:'Click to place a wall' },
            'wall-left':    { icon:'┃',  label:'Vertical Wall',      cursor:'crosshair', hint:'Click to place a wall' },
            'door-vertical':   { icon:'🚪', label:'Door ↕',        cursor:'crosshair', hint:'Click to place a door' },
            'door-horizontal': { icon:'🚪', label:'Door ↔',        cursor:'crosshair', hint:'Click to place a door' },
            'door-edge-top':    { icon:'🚪', label:'Door top edge',    cursor:'crosshair', hint:'Blocks light' },
            'door-edge-bottom': { icon:'🚪', label:'Door bottom edge',     cursor:'crosshair', hint:'Blocks light' },
            'door-edge-left':   { icon:'🚪', label:'Door left edge',  cursor:'crosshair', hint:'Blocks light' },
            'door-edge-right':  { icon:'🚪', label:'Door right edge',   cursor:'crosshair', hint:'Blocks light' },
            'window-vertical': { icon:'🔲', label:'Window ↕',     cursor:'crosshair', hint:'Click to place a window (light passes through)' },
            'window-horizontal':{ icon:'🔲',label:'Window ↔',     cursor:'crosshair', hint:'Click to place a window (light passes through)' },
            'window-barricaded-vertical':  { icon:'🔳', label:'Barricaded Window ↕', cursor:'crosshair', hint:'Blocks light' },
            'window-barricaded-horizontal':{ icon:'🔳', label:'Barricaded Window ↔', cursor:'crosshair', hint:'Blocks light' },
            'window-edge-top':    { icon:'🔲', label:'Window top edge',    cursor:'crosshair', hint:'Light passes through' },
            'window-edge-bottom': { icon:'🔲', label:'Window bottom edge',     cursor:'crosshair', hint:'Light passes through' },
            'window-edge-left':   { icon:'🔲', label:'Window left edge',  cursor:'crosshair', hint:'Light passes through' },
            'window-edge-right':  { icon:'🔲', label:'Window right edge',   cursor:'crosshair', hint:'Light passes through' },
            'window-edge-barricaded-top':    { icon:'🔳', label:'Barricaded window top',   cursor:'crosshair', hint:'Blocks light' },
            'window-edge-barricaded-bottom': { icon:'🔳', label:'Barricaded window bottom',    cursor:'crosshair', hint:'Blocks light' },
            'window-edge-barricaded-left':   { icon:'🔳', label:'Barricaded window left', cursor:'crosshair', hint:'Blocks light' },
            'window-edge-barricaded-right':  { icon:'🔳', label:'Barricaded window right',  cursor:'crosshair', hint:'Blocks light' },
            'stairs-up':    { icon:'🔺', label:'Stairs Up',  cursor:'crosshair', hint:'Click to place stairs' },
            'stairs-down':  { icon:'🔻', label:'Stairs Down',cursor:'crosshair',hint:'Click to place stairs' },
        };
        const HUD_MODE = {
            'floor':  { icon:'⬜', label:'FLOOR',     color:'#667eea' },
            'wall':   { icon:'🧱', label:'WALLS',     color:'#f59e0b' },
            'object': { icon:'😀', label:'OBJECTS',   color:'#10b981' },
            'light':  { icon:'💡', label:'LIGHTS', color:'#f97316' },
        };

        function getToolLabel(t) {
            if(HUD_INFO[t]) {
                // For light tool, append light type
                if(t === 'place-light') {
                    const lt = lightTypes[currentLightType];
                    const icons = {torch:'🔥',candle:'🕯️',lantern:'🏮',bonfire:'🔥',daylight:'☀️',moonlight:'🌙',inferno:'💀','magic-blue':'✨','magic-green':'✨','magic-purple':'✨'};
                    return { ...HUD_INFO[t], label: 'Place Light · ' + (icons[currentLightType]||'') + ' ' + currentLightType };
                }
                return HUD_INFO[t];
            }
            if(t && t.startsWith('texture-')) {
                const name = t.replace('texture-','');
                const names = {water:'Water',grass:'Grass',stone:'Stone',sand:'Sand',lava:'Lava',ice:'Ice',wood:'Wood',marble:'Marble',brick:'Brick',dirt:'Dirt',moss:'Moss',snow:'Snow',swamp:'Swamp',crystal:'Crystal',metal:'Metal'};
                return { icon:'🎨', label:'Texture · '+(names[name]||name), cursor:'crosshair', hint:'Click/drag to paint this texture' };
            }
            if(t && t.startsWith('wall-')) return { icon:'🧱', label:'Manual Wall', cursor:'crosshair', hint:'Cliquez pour placer ce type de mur' };
            return { icon:'❓', label:t, cursor:'crosshair', hint:'' };
        }

        function updateFillToggle() {
            const cb = document.getElementById('fillMode');
            const label = document.getElementById('fillToggleLabel');
            if(label) label.classList.toggle('active-fill', cb && cb.checked);
        }
        
        function updateHUD() {
            if(houseDrawActive) {
                const modeEl = document.getElementById('hudMode');
                modeEl.textContent = '🏠 ROOM BUILDER';
                modeEl.style.borderColor = '#f59e0b';
                modeEl.style.color = '#f59e0b';
                modeEl.style.background = '#f59e0b18';
                document.getElementById('hudTool').textContent = isFillModeActive() ? '🟩 Select Rectangle' : '✏️ Paint Interior Cells';
                document.getElementById('hudFill').classList.toggle('visible', isFillModeActive());
                document.getElementById('hudErase').classList.remove('visible');
                document.getElementById('hudColor').style.display = 'none';
                document.getElementById('hudHint').textContent = isFillModeActive()
                    ? 'Drag to select a rectangle of cells • Click painted cells to deselect'
                    : 'Paint interior cells • Click a painted cell to deselect • Enable Rect Fill to select by rectangle';
                canvas.style.cursor = isFillModeActive() ? 'cell' : 'crosshair';
                return;
            }
            const isErase = currentTool === 'erase';
            const fill = document.getElementById('fillMode').checked;
            const mInfo = HUD_MODE[currentMode] || {};
            const tInfo = getToolLabel(currentTool);

            // Mode pill
            const modeEl = document.getElementById('hudMode');
            modeEl.textContent = (mInfo.icon||'') + ' ' + (mInfo.label||currentMode);
            modeEl.style.borderColor = mInfo.color || '#667eea';
            modeEl.style.color = mInfo.color || '#a5b4fc';
            modeEl.style.background = (mInfo.color||'#667eea') + '18';

            // Tool pill — special styling for erase
            const hudToolEl = document.getElementById('hudTool');
            hudToolEl.textContent = tInfo.icon + ' ' + (fill ? 'Remplissage · ' : '') + tInfo.label;
            hudToolEl.className = 'hud-pill hud-tool' + (isErase ? ' erase' : '');

            // Erase badge
            const eraseBadge = document.getElementById('hudErase');
            eraseBadge.classList.toggle('visible', isErase);

            // Fill badge
            const fillBadge = document.getElementById('hudFill');
            fillBadge.classList.toggle('visible', fill && !isErase);

            // Color pill
            document.getElementById('hudColorSwatch').style.background = selectedColor;
            document.getElementById('hudColorHex').textContent = selectedColor;
            const showColor = currentMode !== 'light' && currentTool !== 'move-emoji' && !isErase;
            document.getElementById('hudColor').style.display = showColor ? 'flex' : 'none';

            // Erase toolbar button highlight
            const eraseBtn = document.getElementById('eraseToolBtn');
            if(eraseBtn) {
                eraseBtn.classList.toggle('active-erase', isErase);
            }

            // Hint
            let hint = tInfo.hint || '';
            if(fill) hint = 'Click and drag to select a rectangular area';
            if(isErase) hint = 'Click: erase objects/lights • Click again: erase floor';
            document.getElementById('hudHint').textContent = hint;

            // Cursor
            let cur = tInfo.cursor || 'crosshair';
            if(fill) cur = 'cell';
            if(isErase) cur = 'not-allowed';
            if(currentTool === 'move-emoji') cur = 'grab';
            canvas.style.cursor = cur;
        }

        function setTool(t, btnEl) {
            currentTool = t;
            document.querySelectorAll('.tool-btn,.texture-btn,.wall-btn').forEach(b => b.classList.remove('active'));
            // Accept explicit button element, or fall back to event.target
            let btn = btnEl || null;
            if(!btn && typeof event !== 'undefined' && event && event.target) {
                btn = event.target.closest('.tool-btn,.texture-btn,.wall-btn');
            }
            if(btn) btn.classList.add('active');
            canvas.classList.toggle('move-mode', t === 'move-emoji');
            updateHUD();
        }
        
        function getActionLabel(){
            if(currentTool==='erase') return '🧹 Erase';
            if(currentTool==='floor') return '🖌️ Floor · '+selectedColor;
            if(currentTool.startsWith('texture-')) return '🎨 Texture · '+currentTool.replace('texture-','');
            if(currentTool==='wall-smart') return '✨ Smart Wall';
            if(currentTool.startsWith('wall-')) return '🧱 Manual Wall';
            if(currentTool.startsWith('door-')) return '🚪 Door';
            if(currentTool.startsWith('window-')) return '🪟 Window';
            if(currentTool.startsWith('stairs-')) return '🔺 Stairs';
            if(currentTool==='emoji') return '😀 Emoji · '+selectedEmoji;
            if(currentTool==='move-emoji') return '✋ Move emoji';
            if(currentTool==='place-light') return '💡 Light · '+currentLightType;
            return '✏️ Edit';
        }

        function saveHistory(label){
            history=history.slice(0,historyIndex+1);
            history.push({
                floor:JSON.parse(JSON.stringify(floorLayer)),
                objects:JSON.parse(JSON.stringify(objectLayer)),
                emojis:JSON.parse(JSON.stringify(emojiLayer)),
                lights:JSON.parse(JSON.stringify(lightLayer)),
                notes:JSON.parse(JSON.stringify(noteLayer)),
                labels:JSON.parse(JSON.stringify(labelLayer)),
                texts:JSON.parse(JSON.stringify(freeTexts)),
                label: label || getActionLabel(),
                time: Date.now()
            });
            historyIndex++;
            if(history.length>50){history.shift();historyIndex--;}
            updateHistoryPanel();
            updatePlaneUI();
        }

        function undo(){
            if(historyIndex>0){
                historyIndex--;
                const s=history[historyIndex];
                floorLayer=JSON.parse(JSON.stringify(s.floor));
                objectLayer=JSON.parse(JSON.stringify(s.objects));
                emojiLayer=JSON.parse(JSON.stringify(s.emojis||{}));
                lightLayer=JSON.parse(JSON.stringify(s.lights||{}));
                noteLayer=JSON.parse(JSON.stringify(s.notes||{}));
                labelLayer=JSON.parse(JSON.stringify(s.labels||{}));
                freeTexts=JSON.parse(JSON.stringify(s.texts||[]));
                redrawMap();
                updateHistoryPanel();
                updatePlaneUI();
            }
        }

        function redo(){
            if(historyIndex<history.length-1){
                historyIndex++;
                const s=history[historyIndex];
                floorLayer=JSON.parse(JSON.stringify(s.floor));
                objectLayer=JSON.parse(JSON.stringify(s.objects));
                emojiLayer=JSON.parse(JSON.stringify(s.emojis||{}));
                lightLayer=JSON.parse(JSON.stringify(s.lights||{}));
                noteLayer=JSON.parse(JSON.stringify(s.notes||{}));
                labelLayer=JSON.parse(JSON.stringify(s.labels||{}));
                freeTexts=JSON.parse(JSON.stringify(s.texts||[]));
                redrawMap();
                updateHistoryPanel();
                updatePlaneUI();
            }
        }

        function jumpToHistory(idx){
            if(idx<0||idx>=history.length)return;
            historyIndex=idx;
            const s=history[historyIndex];
            floorLayer=JSON.parse(JSON.stringify(s.floor));
            objectLayer=JSON.parse(JSON.stringify(s.objects));
            emojiLayer=JSON.parse(JSON.stringify(s.emojis||{}));
            lightLayer=JSON.parse(JSON.stringify(s.lights||{}));
            redrawMap();
            updateHistoryPanel();
        }

        function updateHistoryPanel(){
            const list=document.getElementById('historyList');
            if(!list)return;
            list.innerHTML='';
            // Show last 20, newest first
            const start=Math.max(0,historyIndex-14);
            for(let i=Math.min(history.length-1,historyIndex+5);i>=start;i--){
                const h=history[i];
                const el=document.createElement('div');
                el.className='history-item'+(i===historyIndex?' current':'')+(i>historyIndex?' future':'');
                const ago=i===historyIndex?'current':i>historyIndex?'→ redo':'';
                el.innerHTML=`<span class="history-label">${h.label||'État'}</span><span class="history-meta">${ago}</span>`;
                el.onclick=(()=>{const idx=i;return()=>jumpToHistory(idx);})();
                list.appendChild(el);
            }
            // Update undo/redo button states
            const undoBtn=document.getElementById('undoBtn');
            const redoBtn=document.getElementById('redoBtn');
            if(undoBtn) undoBtn.disabled=historyIndex<=0;
            if(redoBtn) redoBtn.disabled=historyIndex>=history.length-1;
        }
        function fillRectangle(x1,y1,x2,y2){const mX=Math.min(x1,x2),MX=Math.max(x1,x2),mY=Math.min(y1,y2),MY=Math.max(y1,y2);for(let x=mX;x<=MX;x++){for(let y=mY;y<=MY;y++){if(x<0||x>=cols||y<0||y>=rows)continue;const k=`${x},${y}`;if(currentTool==='erase'){if(emojiLayer[k]){delete emojiLayer[k];}else if(objectLayer[k]||lightLayer[k]){delete objectLayer[k];delete lightLayer[k];}else{delete floorLayer[k];}}else if(currentMode==='floor'&&(currentTool==='floor'||currentTool.startsWith('texture-'))){if(currentTool==='floor')floorLayer[k]={color:selectedColor};else floorLayer[k]={color:selectedColor,texture:currentTool};}else if(currentMode==='wall'&&currentTool.startsWith('wall')){let wt=currentTool;if(currentTool==='wall-smart')wt='wall-full';objectLayer[k]={type:wt,color:selectedColor};}else if((currentMode==='wall'||currentMode==='object')&&(currentTool.startsWith('door')||currentTool.startsWith('window')||currentTool.startsWith('stairs'))){objectLayer[k]={type:currentTool,color:selectedColor};}else if(currentMode==='object'&&currentTool==='emoji'){emojiLayer[k]={emoji:selectedEmoji,emojiSize:emojiSize,emitsLight:false,lightType:'torch'};}else if(currentMode==='light'&&currentTool==='place-light'){lightLayer[k]={type:currentLightType};}}}if(currentTool==='wall-smart')for(let x=mX;x<=MX;x++)for(let y=mY;y<=MY;y++)updateWallConnections(x,y);}
        
        function getWallNeighbors(x,y){const n={top:false,bottom:false,left:false,right:false};[{k:`${x},${y-1}`,d:'top'},{k:`${x},${y+1}`,d:'bottom'},{k:`${x-1},${y}`,d:'left'},{k:`${x+1},${y}`,d:'right'}].forEach(c=>{if(objectLayer[c.k]&&objectLayer[c.k].type&&objectLayer[c.k].type.startsWith('wall'))n[c.d]=true;});return n;}
        function getAutoWallType(x,y){const n=getWallNeighbors(x,y),ct=(n.top?1:0)+(n.bottom?1:0)+(n.left?1:0)+(n.right?1:0);if(ct===0)return'wall-full';if(ct===1)return(n.top||n.bottom)?'wall-left':'wall-top';if(ct===2){if(n.bottom&&n.right)return'wall-tl';if(n.bottom&&n.left)return'wall-tr';if(n.top&&n.right)return'wall-bl';if(n.top&&n.left)return'wall-br';if(n.top&&n.bottom)return'wall-left';return'wall-top';}if(ct===3){if(!n.top)return'wall-t-bottom';if(!n.bottom)return'wall-t-top';if(!n.left)return'wall-t-right';return'wall-t-left';}return'wall-cross';}
        function updateWallConnections(x,y){const k=`${x},${y}`,c=objectLayer[k];if(c&&c.type&&c.type.startsWith('wall'))objectLayer[k].type=getAutoWallType(x,y);[{x:x,y:y-1},{x:x,y:y+1},{x:x-1,y:y},{x:x+1,y:y}].forEach(nb=>{const nk=`${nb.x},${nb.y}`,nc=objectLayer[nk];if(nc&&nc.type&&nc.type.startsWith('wall'))objectLayer[nk].type=getAutoWallType(nb.x,nb.y);});}
        
        // ── HOUSE DRAW MODE ────────────────────────────────────────────────
        let houseDrawActive = false;
        let houseCells = new Set(); // "x,y" keys of painted interior cells
        let houseIsDrawing = false;
        let houseErasing = false; // if mousedown on already-painted cell → erase mode

        function toggleHouseDrawMode() {
            if (houseDrawActive) {
                cancelHouseDrawMode();
            } else {
                houseDrawActive = true;
                houseCells.clear();
                document.getElementById('houseDrawSection').classList.add('active-mode');
                document.getElementById('houseDrawBtn').textContent = '🏠 Active — painting interior…';
                document.getElementById('houseDrawBtn').classList.add('active');
                document.getElementById('houseBtnValidate').style.display = 'block';
                document.getElementById('houseBtnCancel').style.display = 'block';
                document.getElementById('houseCellCount').style.display = 'block';
                document.getElementById('houseDrawHint').textContent = 'Paint interior cells. Click a painted cell to erase it.';
                updateHouseCellCount();
                // Make sure we're in wall mode
                if (currentMode !== 'wall') setMode('wall');
                redrawMap();
            }
        }

        function cancelHouseDrawMode() {
            houseDrawActive = false;
            houseCells.clear();
            document.getElementById('houseDrawSection').classList.remove('active-mode');
            document.getElementById('houseDrawBtn').textContent = '🏠 Paint Interior → Generate Border Walls';
            document.getElementById('houseDrawBtn').classList.remove('active');
            document.getElementById('houseBtnValidate').style.display = 'none';
            document.getElementById('houseBtnCancel').style.display = 'none';
            document.getElementById('houseCellCount').style.display = 'none';
            document.getElementById('houseDrawHint').textContent = 'Paint the interior cells, then validate to generate border walls.';
            redrawMap();
        }

        function updateHouseCellCount() {
            document.getElementById('houseCellCount').textContent = houseCells.size + ' cell' + (houseCells.size > 1 ? 's' : '') + ' selected';
        }

        function validateHouseDraw() {
            if (houseCells.size === 0) { cancelHouseDrawMode(); return; }
            saveHistory('🏠 House Draw (before)');

            // For each painted cell, check 4 neighbors — if neighbor is NOT in houseCells → place edge wall on that side
            const wallColor = selectedColor;
            const wallsToPlace = []; // {x, y, side: 'top'|'bottom'|'left'|'right'}

            houseCells.forEach(key => {
                const [x, y] = key.split(',').map(Number);
                const neighbors = [
                    { dx: 0, dy: -1, side: 'top' },
                    { dx: 0, dy: 1,  side: 'bottom' },
                    { dx: -1, dy: 0, side: 'left' },
                    { dx: 1,  dy: 0, side: 'right' },
                ];
                neighbors.forEach(n => {
                    const nk = `${x + n.dx},${y + n.dy}`;
                    if (!houseCells.has(nk)) {
                        wallsToPlace.push({ x, y, side: n.side });
                    }
                });
            });

            // Place edge walls: for each (x,y,side), place the correct wall segment
            // We use a per-cell approach: collect all exposed sides for each cell, then choose wall type
            const cellSides = {};
            wallsToPlace.forEach(({ x, y, side }) => {
                const k = `${x},${y}`;
                if (!cellSides[k]) cellSides[k] = { x, y, top: false, bottom: false, left: false, right: false };
                cellSides[k][side] = true;
            });

            Object.values(cellSides).forEach(({ x, y, top, bottom, left, right }) => {
                const sides = [top, bottom, left, right];
                const count = sides.filter(Boolean).length;

                // Place wall segments on each exposed side
                // For edge walls, each exposed side gets its own "thin wall" on that border
                // We place them as separate wall pieces using the correct directional types
                // Strategy: place the cell as the "most specific" wall that covers all exposed sides
                // Using the existing wall types which draw segments at center:
                //   top/bottom → wall-top (horizontal bar at center)
                //   left/right → wall-left (vertical bar at center)
                // Since these are BORDER walls, we use the wall-smart auto-type logic but
                // interpreted for border context. We encode via 'wall-edge-*' flags stored as meta.

                // Actually: place separate edge walls for each exposed side of the cell
                // We'll use special new wall types: 'wall-edge-top', 'wall-edge-bottom', 'wall-edge-left', 'wall-edge-right'
                // and draw them as thin bars on the actual edge of the cell (not center).
                // For multi-side, we combine. Let's use a composite approach.

                // Simplest: for each exposed side, place it. If a cell has top+left exposed → corner piece, etc.
                // Use existing wall rendering but mark type as 'wall-edge' with a sides bitmask stored in .sides
                const k = `${x},${y}`;
                const existingObj = objectLayer[k];
                // Don't overwrite non-wall objects
                if (existingObj && existingObj.type && !existingObj.type.startsWith('wall')) return;

                objectLayer[k] = {
                    type: 'wall-edge',
                    color: wallColor,
                    edgeSides: { top, bottom, left, right }
                };
            });

            saveHistory('🏠 House generated');
            cancelHouseDrawMode();
            redrawMap();
        }

        // Draw edge walls in redrawMap — we'll hook into drawObjectCell
        function drawEdgeWall(x, y, c, sides) {
            const px = x * cellSize, py = y * cellSize;
            const thickness = 6; // wall thickness in px
            ctx.fillStyle = c || selectedColor;

            if (sides.top)    ctx.fillRect(px, py, cellSize, thickness);
            if (sides.bottom) ctx.fillRect(px, py + cellSize - thickness, cellSize, thickness);
            if (sides.left)   ctx.fillRect(px, py, thickness, cellSize);
            if (sides.right)  ctx.fillRect(px + cellSize - thickness, py, thickness, cellSize);
        }

        // Draw house preview overlay
        function drawHousePreview() {
            if (!houseDrawActive) return;
            ctx.save();
            houseCells.forEach(key => {
                const [x, y] = key.split(',').map(Number);
                const px = x * cellSize, py = y * cellSize;
                ctx.fillStyle = 'rgba(245,158,11,0.25)';
                ctx.fillRect(px, py, cellSize, cellSize);
                ctx.strokeStyle = 'rgba(245,158,11,0.9)';
                ctx.lineWidth = 2;
                ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
            });
            // Show fill rectangle preview in orange
            if(fillPreview && isFillModeActive()){
                ctx.strokeStyle='#f59e0b';ctx.lineWidth=3;ctx.setLineDash([5,5]);
                ctx.strokeRect(fillPreview.x*cellSize,fillPreview.y*cellSize,fillPreview.width*cellSize,fillPreview.height*cellSize);
                ctx.fillStyle='rgba(245,158,11,0.12)';
                ctx.fillRect(fillPreview.x*cellSize,fillPreview.y*cellSize,fillPreview.width*cellSize,fillPreview.height*cellSize);
                ctx.setLineDash([]);
            }
            ctx.restore();
        }

        function paintHouseCell(x, y) {
            if (x < 0 || x >= cols || y < 0 || y >= rows) return;
            const k = `${x},${y}`;
            if (houseErasing) {
                houseCells.delete(k);
            } else {
                houseCells.add(k);
            }
            updateHouseCellCount();
        }

        // ── END HOUSE DRAW MODE ────────────────────────────────────────────

        function placeTile(x,y){
            if(x<0||x>=cols||y<0||y>=rows)return;
            const k=`${x},${y}`;
            // New tools
            if(currentTool==='note'){openNoteModal(k);return;}
            if(currentTool==='label'){openLabelModal(k);return;}
            if(distanceTool){
                if(!distanceStart){distanceStart={x,y};distanceEnd=null;}
                else{distanceEnd={x,y};}
                redrawMap();return;
            }
            if(currentTool==='move-emoji')return;
            if(currentTool==='erase'){
                if(emojiLayer[k]){delete emojiLayer[k];}
                else if(objectLayer[k]||lightLayer[k]){delete objectLayer[k];delete lightLayer[k];}
                else{delete floorLayer[k];}
            }
            else if(currentTool==='floor'){floorLayer[k]={color:selectedColor};}
            else if(currentTool.startsWith('texture-')){floorLayer[k]={color:selectedColor,texture:currentTool};}
            else if(currentMode==='light'){lightLayer[k]={type:currentLightType};}
            else if(currentTool==='emoji'){
                const emitsLightEl=document.getElementById('emojiEmitsLight');
                const emitsLight=emitsLightEl&&emitsLightEl.checked;
                const emojiLightType=emitsLight?(document.getElementById('emojiLightType').value||'torch'):'torch';
                emojiLayer[k]={emoji:selectedEmoji,emojiSize:emojiSize,emitsLight:emitsLight,lightType:emojiLightType};
            }
            else{let wt=currentTool;if(currentTool==='wall-smart')wt='wall-full';
            objectLayer[k]={type:wt,color:selectedColor};if(currentTool==='wall-smart')updateWallConnections(x,y);}
            redrawMap();
        }
        
        let lastPlacedCell=null;
        let strokeDirty=false; // tracks if anything changed during current stroke
        canvas.addEventListener('mousedown',e=>{
            const{x,y}=getCellFromMouse(e);
            strokeDirty=false;
            // House draw mode intercept
            if(houseDrawActive){
                houseIsDrawing=true;
                if(isFillModeActive()){
                    // fill mode: start rectangle selection
                    fillStartCell={x,y};fillPreview={x,y,width:1,height:1};
                } else {
                    const k=`${x},${y}`;
                    houseErasing=houseCells.has(k);
                    paintHouseCell(x,y);
                }
                redrawMap();
                return;
            }
            // Note/label tools open a modal — don't set isDrawing/strokeDirty
            if(currentTool==='note'||currentTool==='label'){
                const k=`${x},${y}`;
                if(currentTool==='note') openNoteModal(k);
                else openLabelModal(k);
                return;
            }
            if(currentTool==='move-emoji'){
                const k=`${x},${y}`;
                if(emojiLayer[k]){
                    movingEmoji={x,y,...emojiLayer[k]};
                    delete emojiLayer[k];
                    strokeDirty=true;
                }
            }else if(isFillModeActive()){
                fillStartCell={x,y};fillPreview={x,y,width:1,height:1};redrawMap();
            }else{
                isDrawing=true;lastPlacedCell={x,y};
                placeTile(x,y);
                strokeDirty=true;
            }
        });
        canvas.addEventListener('mousemove',e=>{
            const{x,y}=getCellFromMouse(e);
            // House draw mode
            if(houseDrawActive){
                if(houseIsDrawing){
                    if(isFillModeActive()&&fillStartCell){
                        const mX=Math.min(fillStartCell.x,x),mY=Math.min(fillStartCell.y,y),MX=Math.max(fillStartCell.x,x),MY=Math.max(fillStartCell.y,y);
                        fillPreview={x:mX,y:mY,width:MX-mX+1,height:MY-mY+1};
                    } else {
                        paintHouseCell(x,y);
                    }
                    redrawMap();
                }
                return;
            }
            if(movingEmoji){
                redrawMap();const px=x*cellSize,py=y*cellSize;
                ctx.globalAlpha=0.5;ctx.font=`${cellSize-8}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';
                ctx.fillText(movingEmoji.emoji,px+cellSize/2,py+cellSize/2);ctx.globalAlpha=1;
            }else if(fillStartCell&&isFillModeActive()){
                const mX=Math.min(fillStartCell.x,x),mY=Math.min(fillStartCell.y,y),MX=Math.max(fillStartCell.x,x),MY=Math.max(fillStartCell.y,y);
                fillPreview={x:mX,y:mY,width:MX-mX+1,height:MY-mY+1};redrawMap();
            }else if(isDrawing){
                if(!lastPlacedCell||lastPlacedCell.x!==x||lastPlacedCell.y!==y){
                    lastPlacedCell={x,y};placeTile(x,y);strokeDirty=true;
                }
            }
        });
        canvas.addEventListener('mouseup',e=>{
            const{x,y}=getCellFromMouse(e);
            // House draw mode
            if(houseDrawActive){
                if(isFillModeActive()&&fillStartCell){
                    // paint all cells in rectangle
                    const mX=Math.min(fillStartCell.x,x),mY=Math.min(fillStartCell.y,y),MX=Math.max(fillStartCell.x,x),MY=Math.max(fillStartCell.y,y);
                    for(let cx=mX;cx<=MX;cx++)for(let cy=mY;cy<=MY;cy++){const k=`${cx},${cy}`;if(houseErasing)houseCells.delete(k);else houseCells.add(k);}
                    fillStartCell=null;fillPreview=null;
                    updateHouseCellCount();
                }
                houseIsDrawing=false;
                redrawMap();
                return;
            }
            if(movingEmoji){
                const k=`${x},${y}`;
                const{x:_,y:__,...props}=movingEmoji;
                emojiLayer[k]=props;
                movingEmoji=null;redrawMap();
                saveHistory();
            }else if(fillStartCell&&isFillModeActive()){
                fillRectangle(fillStartCell.x,fillStartCell.y,x,y);
                fillStartCell=null;fillPreview=null;redrawMap();
                saveHistory();
            }else if(strokeDirty){
                saveHistory();
            }
            isDrawing=false;lastPlacedCell=null;strokeDirty=false;
        });
        canvas.addEventListener('mouseleave',()=>{
            if(houseDrawActive){houseIsDrawing=false;return;}
            if(fillStartCell){fillPreview=null;redrawMap();}
            fillStartCell=null;
            if(isDrawing&&strokeDirty){saveHistory();}
            isDrawing=false;lastPlacedCell=null;strokeDirty=false;
            if(movingEmoji){
                const k=`${movingEmoji.x},${movingEmoji.y}`;
                const{x:_,y:__,...props}=movingEmoji;
                emojiLayer[k]=props;
                movingEmoji=null;redrawMap();
            }
        });
        
        function clearMap(){
            const choice=confirm('Effacer TOUS les plans ?\n\nOK = Effacer tous les plans\nUndo = Effacer seulement ce plan');
            if(choice===null)return;
            if(choice){
                // Clear all planes (keep only current)
                Object.keys(planes).forEach(k=>{
                    planes[k].floorLayer={};planes[k].objectLayer={};planes[k].emojiLayer={};planes[k].lightLayer={};
                    planes[k].noteLayer={};planes[k].labelLayer={};planes[k].freeTexts=[];
                    planes[k].history=[];planes[k].historyIndex=-1;
                });
            }
            floorLayer={};objectLayer={};emojiLayer={};lightLayer={};noteLayer={};labelLayer={};freeTexts=[];
            saveHistory('🗑️ Clear all');
            updatePlaneUI();
            redrawMap();
        }
        function resizeGrid(){const nc=parseInt(document.getElementById('gridWidth').value),nr=parseInt(document.getElementById('gridHeight').value);if(nc<10||nc>50||nr<10||nr>50){alert('Grid size must be between 10 and 50');return;}cols=nc;rows=nr;_invalidateTileCache();updateCanvasSize();}
        function zoomIn(){
            zoom=Math.min(zoom+0.1,3);
            _applyZoom();
            document.getElementById('zoomLevel').textContent=Math.round(zoom*100)+'%';
        }
        function zoomOut(){
            zoom=Math.max(zoom-0.1,0.3);
            _applyZoom();
            document.getElementById('zoomLevel').textContent=Math.round(zoom*100)+'%';
        }
        function resetZoom(){
            zoom=1;
            _applyZoom();
            document.getElementById('zoomLevel').textContent='100%';
        }
        function _applyZoom(){
            const w=document.getElementById('canvasWrapper');
            if(!w)return;
            w.style.transform=`scale(${zoom})`;
            w.style.transformOrigin='center center';
            // Expand the wrapper's layout footprint so the scroll area knows the real size
            w.style.width = Math.round(canvas.width * zoom) + 'px';
            w.style.height = Math.round(canvas.height * zoom) + 'px';
        }
        function toggleGrid(){showGrid=document.getElementById('gridToggle').checked;redrawMap();}
        
        function exportMap(){
            // Save current working state back into its plane slot before exporting
            saveToPlanData();
            const d={
                version:13, cols, rows, cellSize,
                colorPalette, mapName: document.getElementById('mapName').value,
                currentPlaneX, currentPlaneY,
                planes: Object.fromEntries(Object.entries(planes).map(([k,p])=>[k,{
                    name:p.name, floorLayer:p.floorLayer, objectLayer:p.objectLayer,
                    emojiLayer:p.emojiLayer||{},
                    lightLayer:p.lightLayer, noteLayer:p.noteLayer||{}, labelLayer:p.labelLayer||{},
                    freeTexts:p.freeTexts||[], ambientLight:p.ambientLight,
                    effects:p.effects
                }]))
            };
            const j=JSON.stringify(d,null,2);
            const b=new Blob([j],{type:'application/json'});
            const u=URL.createObjectURL(b);
            const a=document.createElement('a');
            const name=document.getElementById('mapName').value||'map-maker';
            a.href=u; a.download=`${name.replace(/[^a-z0-9]/gi,'_')}-${Date.now()}.json`;
            a.click(); URL.revokeObjectURL(u);
        }
        function exportImage(){
            // Save current state first
            saveToPlanData();
            const tc=document.createElement('canvas');tc.width=canvas.width;tc.height=canvas.height;
            const tcx=tc.getContext('2d');tcx.fillStyle='#fff';tcx.fillRect(0,0,tc.width,tc.height);
            tcx.drawImage(canvas,0,0);tcx.drawImage(fxCanvas,0,0);
            const planeName=currentPlane().name||'plan';
            const name=(document.getElementById('mapName').value||'map-maker')+'-'+planeName;
            tc.toBlob(b=>{const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`${name.replace(/[^a-z0-9]/gi,'_')}-${Date.now()}.png`;a.click();URL.revokeObjectURL(u);});
        }
        function importMap(ev){
            const f=ev.target.files[0];if(!f)return;
            const r=new FileReader();
            r.onload=e=>{try{
                const d=JSON.parse(e.target.result);
                // Clear existing planes
                Object.keys(planes).forEach(k=>delete planes[k]);

                if(d.planes){
                    if(Array.isArray(d.planes)){
                        // Old array-based format (v12 and before)
                        d.planes.forEach((pd,i)=>{
                            const px=i%PLANE_COLS, py=Math.floor(i/PLANE_COLS);
                            const k=planeKey(px,py);
                            const hasData = Object.keys(pd.floorLayer||{}).length > 0 || Object.keys(pd.objectLayer||{}).length > 0;
                            if(hasData || (px===1&&py===1)){
                                planes[k]={
                                    name:pd.name||PLANE_NAMES[i],
                                    floorLayer:pd.floorLayer||{}, objectLayer:pd.objectLayer||{},
                                    emojiLayer:pd.emojiLayer||{},
                                    lightLayer:pd.lightLayer||{}, noteLayer:pd.noteLayer||{},
                                    labelLayer:pd.labelLayer||{}, freeTexts:pd.freeTexts||[],
                                    ambientLight:pd.ambientLight!==undefined?pd.ambientLight:1,
                                    effects:pd.effects||null, history:[], historyIndex:-1
                                };
                            }
                        });
                    } else {
                        // New object-based format (v13+)
                        Object.entries(d.planes).forEach(([k,pd])=>{
                            planes[k]={
                                name:pd.name||'Plan',
                                floorLayer:pd.floorLayer||{}, objectLayer:pd.objectLayer||{},
                                emojiLayer:pd.emojiLayer||{},
                                lightLayer:pd.lightLayer||{}, noteLayer:pd.noteLayer||{},
                                labelLayer:pd.labelLayer||{}, freeTexts:pd.freeTexts||[],
                                ambientLight:pd.ambientLight!==undefined?pd.ambientLight:1,
                                effects:pd.effects||null, history:[], historyIndex:-1
                            };
                        });
                    }
                    currentPlaneX=d.currentPlaneX||1; currentPlaneY=d.currentPlaneY||1;
                    // Make sure current plane exists
                    getOrCreatePlane(currentPlaneX, currentPlaneY);
                    loadFromPlaneData(currentPlane());
                } else {
                    // Legacy single-plane save — load into centre plane
                    const k=planeKey(1,1);
                    planes[k]=makePlaneData('Centre');
                    planes[k].floorLayer=d.floorLayer||{};planes[k].objectLayer=d.objectLayer||{};planes[k].emojiLayer=d.emojiLayer||{};
                    planes[k].lightLayer=d.lightLayer||{};planes[k].noteLayer=d.noteLayer||{};
                    planes[k].labelLayer=d.labelLayer||{};planes[k].freeTexts=d.freeTexts||[];
                    planes[k].ambientLight=d.ambientLight!==undefined?d.ambientLight:1;
                    currentPlaneX=1;currentPlaneY=1;
                    loadFromPlaneData(planes[k]);
                }
                if(d.colorPalette){colorPalette=d.colorPalette;initColorPalette();}
                if(d.cols)cols=d.cols;if(d.rows)rows=d.rows;if(d.cellSize)cellSize=d.cellSize;
                if(d.mapName)document.getElementById('mapName').value=d.mapName;
                document.getElementById('gridWidth').value=cols;
                document.getElementById('gridHeight').value=rows;
                updateCanvasSize();
                saveHistory('📂 Import');
                updatePlaneUI();
                redrawMap();
            }catch(err){console.error(err);alert('Error: invalid file');}};
            r.readAsText(f);ev.target.value='';
        }
        
        // toggleFillMode: make Rect Fill a proper toggle button
        function toggleFillMode(){
            const cb = document.getElementById('fillMode');
            cb.checked = !cb.checked;
            const btn = document.getElementById('fillModeBtn');
            if(btn){
                btn.classList.toggle('active-fill-btn', cb.checked);
                btn.style.background = cb.checked ? 'linear-gradient(135deg,#166534,#15803d)' : '';
                btn.style.borderColor = cb.checked ? '#22c55e' : '#3a6a3a';
                btn.style.color = cb.checked ? '#bbf7d0' : '#86efac';
                btn.style.boxShadow = cb.checked ? '0 0 10px rgba(34,197,94,0.4)' : '';
            }
            updateHUD();
            updateFillToggle();
        }

        // switchWallTab: toggle between Border Walls and Center Walls tabs
        function switchWallTab(tab){
            const border = document.getElementById('wallTabBorder');
            const center = document.getElementById('wallTabCenter');
            const btnBorder = document.getElementById('wallSubBorder');
            const btnCenter = document.getElementById('wallSubCenter');
            if(tab === 'border'){
                if(border) border.style.display = 'block';
                if(center) center.style.display = 'none';
                if(btnBorder){ btnBorder.style.background='linear-gradient(135deg,#667eea,#764ba2)'; btnBorder.style.color='#fff'; btnBorder.style.border='1px solid transparent'; }
                if(btnCenter){ btnCenter.style.background='transparent'; btnCenter.style.color='#5555aa'; btnCenter.style.border='1px solid transparent'; }
            } else {
                if(border) border.style.display = 'none';
                if(center) center.style.display = 'block';
                if(btnCenter){ btnCenter.style.background='linear-gradient(135deg,#667eea,#764ba2)'; btnCenter.style.color='#fff'; btnCenter.style.border='1px solid transparent'; }
                if(btnBorder){ btnBorder.style.background='transparent'; btnBorder.style.color='#5555aa'; btnBorder.style.border='1px solid transparent'; }
            }
        }

        initColorPalette();initEmojiPicker();updateCanvasSize();
        // Initialize the starting centre plane
        getOrCreatePlane(1, 1);
        saveHistory('🗺️ Initial state');
        updateHUD();
        updatePlaneUI();

        // Move effects sidebar content into FX sidebar panel
        (function() {
            const src = document.querySelector('.effects-sidebar');
            const dest = document.getElementById('fxSidebarContent');
            if(src && dest) {
                // Move all children except the title and reset button
                Array.from(src.children).forEach(child => {
                    if(child.classList && (child.classList.contains('effects-title') || child.classList.contains('fx-reset-btn'))) return;
                    dest.appendChild(child);
                });
            }
        })();

        // ═══════════════════════════════════════
        // POST-PROCESSING EFFECTS ENGINE
        // ═══════════════════════════════════════
        function syncFxCanvasSize(){fxCanvas.width=canvas.width;fxCanvas.height=canvas.height;}

        function toggleEffect(name){
            enabledEffects[name]=!enabledEffects[name];
            const btn=document.getElementById('toggle-'+name);
            const card=document.getElementById('card-'+name);
            btn.classList.toggle('on',enabledEffects[name]);
            card.classList.toggle('enabled',enabledEffects[name]);
            if(name==='rain')initRain();
            if(name==='lightning')initLightning();
            if(name==='heat')initHeat();
            if(name==='portal')initPortal();
            applyEffects();
        }

        function resetEffects(){
            for(let k in enabledEffects)if(enabledEffects[k])toggleEffect(k);
            fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
            stopRainLoop();
            stopLightningLoop();
            stopHeatLoop();
            stopPortalLoop();
        }

        function hexToRgb(hex){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return{r,g,b};}

        function applyEffects(){
            syncFxCanvasSize();
            fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
            const W=fxCanvas.width,H=fxCanvas.height;

            // GOD RAYS
            if(enabledEffects.godray){
                const col=document.getElementById('godray-color').value;
                const {r,g,b}=hexToRgb(col);
                const intensity=parseInt(document.getElementById('godray-intensity').value)/100;
                const angleDeg=parseInt(document.getElementById('godray-angle').value);
                const count=parseInt(document.getElementById('godray-count').value);
                const angleRad=angleDeg*Math.PI/180;
                fxCtx.save();
                for(let i=0;i<count;i++){
                    const spread=W/count;
                    const x=spread*i+spread*0.5+Math.sin(Date.now()*0.0001+i)*20;
                    const rayWidth=spread*0.4+seededRandom(i,0)*spread*0.3;
                    const grad=fxCtx.createLinearGradient(x,0,x+Math.tan(angleRad)*H,H);
                    grad.addColorStop(0,`rgba(${r},${g},${b},${intensity*0.35})`);
                    grad.addColorStop(0.5,`rgba(${r},${g},${b},${intensity*0.15})`);
                    grad.addColorStop(1,`rgba(${r},${g},${b},0)`);
                    fxCtx.fillStyle=grad;
                    fxCtx.beginPath();
                    const dx=Math.tan(angleRad)*H;
                    fxCtx.moveTo(x-rayWidth/2,0);
                    fxCtx.lineTo(x+rayWidth/2,0);
                    fxCtx.lineTo(x+dx+rayWidth/2,H);
                    fxCtx.lineTo(x+dx-rayWidth/2,H);
                    fxCtx.closePath();
                    fxCtx.fill();
                }
                fxCtx.restore();
            }

            // TINT
            if(enabledEffects.tint){
                const col=document.getElementById('tint-color').value;
                const opacity=parseInt(document.getElementById('tint-opacity').value)/100;
                const blend=document.getElementById('tint-blend').value;
                fxCtx.save();
                fxCtx.globalCompositeOperation=blend;
                fxCtx.fillStyle=col;
                fxCtx.globalAlpha=opacity;
                fxCtx.fillRect(0,0,W,H);
                fxCtx.restore();
            }

            // GLOW / AURA MYSTIQUE
            if(enabledEffects.glow){
                const col=document.getElementById('glow-color').value;
                const {r,g,b}=hexToRgb(col);
                const intensity=parseInt(document.getElementById('glow-intensity').value)/100;
                const radius=parseInt(document.getElementById('glow-radius').value)/100;
                const pulse=0.5+Math.sin(Date.now()*0.002)*0.15;
                const effRadius=Math.min(W,H)*radius*0.5*pulse;
                const grad=fxCtx.createRadialGradient(W/2,H/2,0,W/2,H/2,effRadius);
                grad.addColorStop(0,`rgba(${r},${g},${b},0)`);
                grad.addColorStop(0.5,`rgba(${r},${g},${b},${intensity*0.2})`);
                grad.addColorStop(1,`rgba(${r},${g},${b},0)`);
                fxCtx.save();
                fxCtx.globalCompositeOperation='screen';
                fxCtx.fillStyle=grad;
                fxCtx.fillRect(0,0,W,H);
                fxCtx.restore();
            }

            // SCANLINES
            if(enabledEffects.scanlines){
                const intensity=parseInt(document.getElementById('scan-intensity').value)/100;
                const spacing=parseInt(document.getElementById('scan-spacing').value);
                fxCtx.save();
                fxCtx.globalAlpha=intensity;
                for(let y=0;y<H;y+=spacing){
                    fxCtx.fillStyle='rgba(0,0,0,0.6)';
                    fxCtx.fillRect(0,y,W,1);
                }
                fxCtx.restore();
            }

            // FOG
            if(enabledEffects.fog){
                const density=parseInt(document.getElementById('fog-density').value)/100;
                const col=document.getElementById('fog-color').value;
                const {r,g,b}=hexToRgb(col);
                const style=document.getElementById('fog-style').value;
                const t=Date.now()*0.0003;
                fxCtx.save();
                if(style==='full'){
                    fxCtx.globalAlpha=density*0.6;
                    fxCtx.fillStyle=`rgb(${r},${g},${b})`;
                    fxCtx.fillRect(0,0,W,H);
                    // Add animated wisps
                    for(let i=0;i<8;i++){
                        const wx=(Math.sin(t+i*1.2)*0.5+0.5)*W;
                        const wy=(Math.cos(t*0.7+i*0.8)*0.5+0.5)*H;
                        const wr=80+Math.sin(t+i)*30;
                        const wg=fxCtx.createRadialGradient(wx,wy,0,wx,wy,wr);
                        wg.addColorStop(0,`rgba(${r},${g},${b},${density*0.4})`);
                        wg.addColorStop(1,`rgba(${r},${g},${b},0)`);
                        fxCtx.fillStyle=wg;
                        fxCtx.globalAlpha=1;
                        fxCtx.fillRect(wx-wr,wy-wr,wr*2,wr*2);
                    }
                }else if(style==='ground'){
                    const fogH=H*0.35;
                    const grad=fxCtx.createLinearGradient(0,H-fogH,0,H);
                    grad.addColorStop(0,`rgba(${r},${g},${b},0)`);
                    grad.addColorStop(1,`rgba(${r},${g},${b},${density*0.75})`);
                    fxCtx.fillStyle=grad;
                    fxCtx.fillRect(0,H-fogH,W,fogH);
                    for(let i=0;i<6;i++){
                        const wx=(Math.sin(t*0.5+i*1.5)*0.5+0.5)*W;
                        const wy=H-20+Math.cos(t+i)*15;
                        const wr=60+i*15;
                        const wg=fxCtx.createRadialGradient(wx,wy,0,wx,wy,wr);
                        wg.addColorStop(0,`rgba(${r},${g},${b},${density*0.5})`);
                        wg.addColorStop(1,`rgba(${r},${g},${b},0)`);
                        fxCtx.fillStyle=wg;
                        fxCtx.fillRect(wx-wr,wy-wr,wr*2,wr*2);
                    }
                }else if(style==='patches'){
                    for(let i=0;i<12;i++){
                        const wx=(Math.sin(t*0.4+i*1.1)*0.5+0.5)*W;
                        const wy=(Math.cos(t*0.3+i*0.9)*0.5+0.5)*H;
                        const wr=40+i*8+Math.sin(t+i)*15;
                        const wg=fxCtx.createRadialGradient(wx,wy,0,wx,wy,wr);
                        wg.addColorStop(0,`rgba(${r},${g},${b},${density*0.55})`);
                        wg.addColorStop(1,`rgba(${r},${g},${b},0)`);
                        fxCtx.fillStyle=wg;
                        fxCtx.fillRect(wx-wr,wy-wr,wr*2,wr*2);
                    }
                }
                fxCtx.restore();
            }

            // NOISE / GRAIN
            if(enabledEffects.noise){
                const intensity=parseInt(document.getElementById('noise-intensity').value)/100;
                const animated=parseInt(document.getElementById('noise-anim').value)>0;
                if(animated||!window._noiseImageData){
                    const imgData=fxCtx.createImageData(W,H);
                    const data=imgData.data;
                    for(let i=0;i<data.length;i+=4){
                        const v=Math.random()<0.5?0:255;
                        data[i]=v;data[i+1]=v;data[i+2]=v;
                        data[i+3]=Math.random()*intensity*180;
                    }
                    window._noiseImageData=imgData;
                }
                fxCtx.putImageData(window._noiseImageData,0,0);
            }

            // SEPIA / FILM ANCIEN
            if(enabledEffects.sepia){
                const intensity=parseInt(document.getElementById('sepia-intensity').value)/100;
                const style=document.getElementById('sepia-style').value;
                const scratches=parseInt(document.getElementById('sepia-scratches').value)/100;
                fxCtx.save();
                if(style==='sepia'){
                    fxCtx.globalAlpha=intensity*0.85;
                    fxCtx.fillStyle='rgba(112,66,20,1)';
                    fxCtx.globalCompositeOperation='multiply';
                    fxCtx.fillRect(0,0,W,H);
                    fxCtx.globalCompositeOperation='source-over';
                    fxCtx.globalAlpha=intensity*0.3;
                    fxCtx.fillStyle='rgba(255,220,150,0.4)';
                    fxCtx.fillRect(0,0,W,H);
                }else if(style==='noir'){
                    fxCtx.globalAlpha=intensity;
                    fxCtx.fillStyle='rgba(30,30,30,1)';
                    fxCtx.globalCompositeOperation='saturation';
                    fxCtx.fillRect(0,0,W,H);
                }else if(style==='aged'){
                    fxCtx.globalAlpha=intensity*0.6;
                    fxCtx.fillStyle='rgba(90,50,10,1)';
                    fxCtx.globalCompositeOperation='multiply';
                    fxCtx.fillRect(0,0,W,H);
                    fxCtx.globalCompositeOperation='source-over';
                    fxCtx.globalAlpha=intensity*0.2;
                    fxCtx.fillStyle='rgba(180,160,100,1)';
                    fxCtx.fillRect(0,0,W,H);
                }else if(style==='blueprint'){
                    fxCtx.globalAlpha=intensity*0.7;
                    fxCtx.fillStyle='rgba(10,30,80,1)';
                    fxCtx.globalCompositeOperation='multiply';
                    fxCtx.fillRect(0,0,W,H);
                    fxCtx.globalCompositeOperation='screen';
                    fxCtx.globalAlpha=intensity*0.15;
                    fxCtx.fillStyle='rgba(100,160,255,1)';
                    fxCtx.fillRect(0,0,W,H);
                }
                fxCtx.globalCompositeOperation='source-over';
                // Scratches / rayures
                if(scratches>0){
                    for(let i=0;i<Math.floor(scratches*15);i++){
                        const sx=seededRandom(Math.floor(Date.now()/500),i)*W;
                        fxCtx.globalAlpha=scratches*0.5;
                        fxCtx.strokeStyle='rgba(255,255,255,0.6)';
                        fxCtx.lineWidth=0.5+seededRandom(i,0)*1;
                        fxCtx.beginPath();
                        fxCtx.moveTo(sx+seededRandom(i,1)*5,0);
                        fxCtx.lineTo(sx+seededRandom(i,2)*5-2,H*seededRandom(i,3));
                        fxCtx.stroke();
                    }
                    // Dust spots
                    for(let i=0;i<Math.floor(scratches*20);i++){
                        fxCtx.globalAlpha=scratches*0.3;
                        fxCtx.fillStyle='rgba(200,180,140,0.8)';
                        fxCtx.beginPath();
                        fxCtx.arc(seededRandom(Math.floor(Date.now()/800),i+100)*W,seededRandom(Math.floor(Date.now()/800),i+200)*H,seededRandom(i,10)*2+0.5,0,Math.PI*2);
                        fxCtx.fill();
                    }
                }
                fxCtx.restore();
            }

            // PRISMATIQUE
            if(enabledEffects.prism){
                const intensity=parseInt(document.getElementById('prism-intensity').value)/100;
                const offset=parseInt(document.getElementById('prism-offset').value);
                const style=document.getElementById('prism-style').value;
                const t=Date.now()*0.001;
                fxCtx.save();
                if(style==='aberration'){
                    // Chromatic aberration: draw shifted color channels
                    fxCtx.globalCompositeOperation='screen';
                    fxCtx.globalAlpha=intensity*0.35;
                    fxCtx.fillStyle=`rgba(255,0,0,0.5)`;
                    fxCtx.fillRect(-offset,0,W,H);
                    fxCtx.fillStyle=`rgba(0,255,0,0.5)`;
                    fxCtx.fillRect(0,0,W,H);
                    fxCtx.fillStyle=`rgba(0,0,255,0.5)`;
                    fxCtx.fillRect(offset,0,W,H);
                    // Edge glow aberration
                    for(let i=0;i<3;i++){
                        const colors=['rgba(255,50,50','rgba(50,255,50','rgba(50,50,255'];
                        const grad=fxCtx.createLinearGradient(i===0?0:i===1?W/2:W,0,i===0?W*0.3:i===1?W/2:W*0.7,H);
                        grad.addColorStop(0,`${colors[i]},${intensity*0.3})`);
                        grad.addColorStop(1,`${colors[i]},0)`);
                        fxCtx.fillStyle=grad;
                        fxCtx.fillRect(0,0,W,H);
                    }
                }else if(style==='rainbow'){
                    fxCtx.globalAlpha=intensity*0.25;
                    const grad=fxCtx.createLinearGradient(0,0,W,H);
                    const hueShift=(t*30)%360;
                    for(let i=0;i<=7;i++){
                        grad.addColorStop(i/7,`hsl(${(hueShift+i*51)%360},100%,60%)`);
                    }
                    fxCtx.globalCompositeOperation='screen';
                    fxCtx.fillStyle=grad;
                    fxCtx.fillRect(0,0,W,H);
                }else if(style==='aurora'){
                    fxCtx.globalCompositeOperation='screen';
                    for(let i=0;i<5;i++){
                        const y=H*0.1+i*H*0.06;
                        const hue=(t*20+i*60)%360;
                        const waveH=H*0.12+Math.sin(t*0.5+i)*H*0.04;
                        const grad=fxCtx.createLinearGradient(0,y-waveH,0,y+waveH);
                        grad.addColorStop(0,`hsla(${hue},100%,60%,0)`);
                        grad.addColorStop(0.5,`hsla(${hue},100%,60%,${intensity*0.25})`);
                        grad.addColorStop(1,`hsla(${hue},100%,60%,0)`);
                        fxCtx.fillStyle=grad;
                        fxCtx.save();
                        fxCtx.beginPath();
                        fxCtx.moveTo(0,y);
                        for(let x=0;x<W;x+=5){
                            fxCtx.lineTo(x,y+Math.sin(x*0.02+t+i)*20);
                        }
                        fxCtx.lineTo(W,y+waveH);
                        fxCtx.lineTo(0,y+waveH);
                        fxCtx.closePath();
                        fxCtx.fillStyle=grad;
                        fxCtx.fill();
                        fxCtx.restore();
                    }
                }
                fxCtx.restore();
            }

            // PORTAIL MYSTIQUE
            if(enabledEffects.portal){
                const col=document.getElementById('portal-color').value;
                const {r,g,b}=hexToRgb(col);
                const intensity=parseInt(document.getElementById('portal-intensity').value)/100;
                const style=document.getElementById('portal-style').value;
                const speed=parseInt(document.getElementById('portal-speed').value);
                const t=Date.now()*0.001*speed*0.3;
                const cx=W/2,cy=H/2;
                const maxR=Math.min(W,H)*0.45;
                fxCtx.save();
                fxCtx.globalCompositeOperation='screen';
                if(style==='rings'){
                    for(let i=0;i<8;i++){
                        const phase=((t*0.5+i/8)%1);
                        const radius=maxR*phase;
                        const alpha=(1-phase)*intensity*0.5;
                        fxCtx.globalAlpha=alpha;
                        fxCtx.strokeStyle=`rgba(${r},${g},${b},1)`;
                        fxCtx.lineWidth=2+i*0.5;
                        fxCtx.beginPath();
                        fxCtx.arc(cx,cy,radius,0,Math.PI*2);
                        fxCtx.stroke();
                    }
                    // Center glow
                    const cg=fxCtx.createRadialGradient(cx,cy,0,cx,cy,maxR*0.3);
                    cg.addColorStop(0,`rgba(${r},${g},${b},${intensity*0.6})`);
                    cg.addColorStop(1,`rgba(${r},${g},${b},0)`);
                    fxCtx.globalAlpha=1;
                    fxCtx.fillStyle=cg;
                    fxCtx.beginPath();
                    fxCtx.arc(cx,cy,maxR*0.3,0,Math.PI*2);
                    fxCtx.fill();
                }else if(style==='spiral'){
                    fxCtx.globalAlpha=intensity*0.6;
                    fxCtx.strokeStyle=`rgba(${r},${g},${b},1)`;
                    for(let arm=0;arm<3;arm++){
                        fxCtx.lineWidth=2;
                        fxCtx.beginPath();
                        const offset=arm*(Math.PI*2/3)+t;
                        for(let a=0;a<Math.PI*6;a+=0.05){
                            const rad=(a/Math.PI/6)*maxR;
                            const px=cx+Math.cos(a+offset)*rad;
                            const py=cy+Math.sin(a+offset)*rad;
                            a===0?fxCtx.moveTo(px,py):fxCtx.lineTo(px,py);
                        }
                        fxCtx.stroke();
                    }
                }else if(style==='runes'){
                    // Draw rune circles
                    fxCtx.globalAlpha=intensity*0.5;
                    fxCtx.strokeStyle=`rgba(${r},${g},${b},1)`;
                    fxCtx.lineWidth=1.5;
                    // Outer ring with segments
                    for(let i=0;i<12;i++){
                        const ang=(i/12)*Math.PI*2+t*0.1;
                        const x1=cx+Math.cos(ang)*maxR*0.85;
                        const y1=cy+Math.sin(ang)*maxR*0.85;
                        const x2=cx+Math.cos(ang)*maxR*0.95;
                        const y2=cy+Math.sin(ang)*maxR*0.95;
                        fxCtx.beginPath();fxCtx.moveTo(x1,y1);fxCtx.lineTo(x2,y2);fxCtx.stroke();
                    }
                    // Inner rune lines
                    for(let i=0;i<6;i++){
                        const a1=(i/6)*Math.PI*2+t*0.2;
                        const a2=((i+2)/6)*Math.PI*2+t*0.2;
                        fxCtx.beginPath();
                        fxCtx.moveTo(cx+Math.cos(a1)*maxR*0.5,cy+Math.sin(a1)*maxR*0.5);
                        fxCtx.lineTo(cx+Math.cos(a2)*maxR*0.5,cy+Math.sin(a2)*maxR*0.5);
                        fxCtx.stroke();
                    }
                    fxCtx.beginPath();fxCtx.arc(cx,cy,maxR*0.85,0,Math.PI*2);fxCtx.stroke();
                    fxCtx.beginPath();fxCtx.arc(cx,cy,maxR*0.5,0,Math.PI*2);fxCtx.stroke();
                    const cg2=fxCtx.createRadialGradient(cx,cy,0,cx,cy,maxR*0.2);
                    cg2.addColorStop(0,`rgba(${r},${g},${b},${intensity*0.5})`);
                    cg2.addColorStop(1,`rgba(${r},${g},${b},0)`);
                    fxCtx.globalAlpha=1;
                    fxCtx.fillStyle=cg2;
                    fxCtx.beginPath();fxCtx.arc(cx,cy,maxR*0.2,0,Math.PI*2);fxCtx.fill();
                }
                fxCtx.restore();
            }

            // VIGNETTE (always last except potentially rain)
            if(enabledEffects.vignette){
                const intensity=parseInt(document.getElementById('vig-intensity').value)/100;
                const size=parseInt(document.getElementById('vig-size').value)/100;
                const col=document.getElementById('vig-color').value;
                const {r,g,b}=hexToRgb(col);
                const grad=fxCtx.createRadialGradient(W/2,H/2,Math.min(W,H)*size*0.3,W/2,H/2,Math.sqrt(W*W+H*H)*0.7);
                grad.addColorStop(0,`rgba(${r},${g},${b},0)`);
                grad.addColorStop(1,`rgba(${r},${g},${b},${intensity})`);
                fxCtx.save();
                fxCtx.fillStyle=grad;
                fxCtx.fillRect(0,0,W,H);
                fxCtx.restore();
            }
        }

        // RAIN / PARTICLES SYSTEM
        let rainParticles=[];
        let _rainLoop=null;

        function initRain(){
            stopRainLoop();
            if(!enabledEffects.rain)return;
            const count=parseInt(document.getElementById('rain-count').value);
            const W=fxCanvas.width,H=fxCanvas.height;
            rainParticles=[];
            for(let i=0;i<count;i++){
                rainParticles.push({x:Math.random()*W,y:Math.random()*H,len:Math.random()*15+5,opacity:Math.random()*0.7+0.2,speed:Math.random()*3+1});
            }
            _rainLoop=setInterval(animateRain,33);
        }

        function stopRainLoop(){clearInterval(_rainLoop);_rainLoop=null;if(fxCtx)fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);}

        function animateRain(){
            syncFxCanvasSize();
            applyEffects();// Draw static effects first, then particles on top
            const W=fxCanvas.width,H=fxCanvas.height;
            const speed=parseInt(document.getElementById('rain-speed').value);
            const angle=parseInt(document.getElementById('rain-angle').value)*Math.PI/180;
            const style=document.getElementById('rain-style').value;
            const dx=Math.sin(angle)*speed;
            const dy=Math.cos(angle)*speed;
            fxCtx.save();
            for(let p of rainParticles){
                p.x+=dx;p.y+=dy;
                if(p.y>H+20){p.y=-20;p.x=Math.random()*W;}
                if(p.x>W+20){p.x=-20;}
                if(p.x<-20){p.x=W+20;}
                fxCtx.globalAlpha=p.opacity;
                if(style==='rain'){
                    fxCtx.strokeStyle='rgba(150,200,255,0.8)';
                    fxCtx.lineWidth=1;
                    fxCtx.beginPath();
                    fxCtx.moveTo(p.x,p.y);
                    fxCtx.lineTo(p.x-dx*2,p.y-dy*2);
                    fxCtx.stroke();
                }else if(style==='snow'){
                    fxCtx.fillStyle='rgba(255,255,255,0.9)';
                    fxCtx.beginPath();
                    fxCtx.arc(p.x,p.y,p.len*0.15,0,Math.PI*2);
                    fxCtx.fill();
                }else if(style==='embers'){
                    fxCtx.fillStyle=`rgba(255,${Math.floor(100+Math.random()*80)},0,0.85)`;
                    fxCtx.beginPath();
                    fxCtx.arc(p.x,p.y,p.len*0.12,0,Math.PI*2);
                    fxCtx.fill();
                }else if(style==='sparks'){
                    const col=`rgba(255,${Math.floor(200+Math.random()*55)},${Math.floor(Math.random()*100)},0.9)`;
                    fxCtx.strokeStyle=col;
                    fxCtx.lineWidth=1.5;
                    fxCtx.beginPath();
                    fxCtx.moveTo(p.x,p.y);
                    fxCtx.lineTo(p.x-dx*1.5,p.y-dy*1.5);
                    fxCtx.stroke();
                }
            }
            fxCtx.restore();
        }

        // LIGHTNING SYSTEM
        let _lightningLoop=null;
        let _nextLightningTime=0;

        function initLightning(){
            stopLightningLoop();
            if(!enabledEffects.lightning)return;
            _nextLightningTime=Date.now()+Math.random()*2000;
            _lightningLoop=setInterval(animateLightning,50);
        }
        function stopLightningLoop(){clearInterval(_lightningLoop);_lightningLoop=null;}

        function drawBolt(ctx,x1,y1,x2,y2,branches,width,col,alpha){
            if(width<0.3||branches<0)return;
            const dx=x2-x1,dy=y2-y1;
            const len=Math.sqrt(dx*dx+dy*dy);
            const points=[[x1,y1]];
            const segs=Math.floor(len/20)+2;
            for(let i=1;i<segs;i++){
                const t=i/segs;
                const nx=x1+dx*t+(Math.random()-0.5)*len*0.25;
                const ny=y1+dy*t+(Math.random()-0.5)*len*0.1;
                points.push([nx,ny]);
            }
            points.push([x2,y2]);
            // Glow
            ctx.save();
            ctx.globalAlpha=alpha*0.3;
            ctx.strokeStyle=col;
            ctx.lineWidth=width*4;
            ctx.shadowColor=col;
            ctx.shadowBlur=width*8;
            ctx.beginPath();
            ctx.moveTo(points[0][0],points[0][1]);
            for(let p of points)ctx.lineTo(p[0],p[1]);
            ctx.stroke();
            // Core
            ctx.globalAlpha=alpha;
            ctx.lineWidth=width;
            ctx.shadowBlur=width*3;
            ctx.beginPath();
            ctx.moveTo(points[0][0],points[0][1]);
            for(let p of points)ctx.lineTo(p[0],p[1]);
            ctx.stroke();
            ctx.restore();
            // Branch off
            if(branches>0){
                for(let i=1;i<points.length-1;i++){
                    if(Math.random()<0.25){
                        const bx=points[i][0]+(Math.random()-0.5)*60;
                        const by=points[i][1]+Math.random()*len*0.3;
                        drawBolt(ctx,points[i][0],points[i][1],bx,by,branches-1,width*0.5,col,alpha*0.7);
                    }
                }
            }
        }

        function animateLightning(){
            const W=fxCanvas.width,H=fxCanvas.height;
            const now=Date.now();
            const freq=parseInt(document.getElementById('lightning-freq').value);
            const branchCount=parseInt(document.getElementById('lightning-branches').value);
            const col=document.getElementById('lightning-color').value;
            const style=document.getElementById('lightning-style').value;
            // Static effects + lightning on top
            applyEffects();
            if(now>=_nextLightningTime){
                _nextLightningTime=now+(3000/freq)+Math.random()*1000;
                // Flash
                fxCtx.save();
                fxCtx.globalAlpha=0.12;
                fxCtx.fillStyle='rgba(200,220,255,1)';
                fxCtx.fillRect(0,0,W,H);
                fxCtx.restore();
                const {r,g,b}=hexToRgb(col);
                const boltCol=`rgb(${r},${g},${b})`;
                if(style==='sky'){
                    const sx=Math.random()*W;
                    drawBolt(fxCtx,sx,-10,sx+(Math.random()-0.5)*80,H*0.3+Math.random()*H*0.5,branchCount,2.5,boltCol,0.95);
                }else if(style==='ground'){
                    const sx=Math.random()*W;
                    const ey=H-10;
                    drawBolt(fxCtx,sx,0,sx+(Math.random()-0.5)*60,ey,branchCount,2,boltCol,0.9);
                }else if(style==='orb'){
                    // Multiple bolts from center
                    for(let i=0;i<3;i++){
                        const angle=Math.random()*Math.PI*2;
                        const r2=Math.min(W,H)*0.15;
                        const ex=W/2+Math.cos(angle)*(r2+Math.random()*100);
                        const ey=H/2+Math.sin(angle)*(r2+Math.random()*100);
                        drawBolt(fxCtx,W/2,H/2,ex,ey,branchCount-1,2,boltCol,0.9);
                    }
                }
            }
        }

        // HEAT DISTORTION SYSTEM
        let _heatLoop=null;
        let _heatCanvas=null,_heatCtx=null;
        let _heatTime=0;

        function initHeat(){
            stopHeatLoop();
            if(!enabledEffects.heat)return;
            if(!_heatCanvas){_heatCanvas=document.createElement('canvas');_heatCtx=_heatCanvas.getContext('2d');}
            _heatLoop=setInterval(animateHeat,40);
        }
        function stopHeatLoop(){clearInterval(_heatLoop);_heatLoop=null;}

        function animateHeat(){
            if(!enabledEffects.heat)return;
            syncFxCanvasSize();
            const W=fxCanvas.width,H=fxCanvas.height;
            const amp=parseInt(document.getElementById('heat-amplitude').value);
            const freq=parseInt(document.getElementById('heat-frequency').value)/100;
            const glowPct=parseInt(document.getElementById('heat-glow').value)/100;
            _heatCanvas.width=W;_heatCanvas.height=H;
            // Copy current map to heat canvas
            _heatCtx.drawImage(canvas,0,0);
            fxCtx.clearRect(0,0,W,H);
            _heatTime+=0.03;
            // Draw distorted version
            const sliceH=6;
            for(let y=0;y<H;y+=sliceH){
                const wave=Math.sin(y*freq*0.5+_heatTime)*amp;
                fxCtx.drawImage(_heatCanvas,0,y,W,sliceH,wave,y,W,sliceH);
            }
            // Heat glow overlay
            if(glowPct>0){
                fxCtx.save();
                const gg=fxCtx.createLinearGradient(0,H,0,H-H*0.4);
                gg.addColorStop(0,`rgba(255,160,30,${glowPct*0.3})`);
                gg.addColorStop(1,`rgba(255,80,0,0)`);
                fxCtx.globalCompositeOperation='screen';
                fxCtx.fillStyle=gg;
                fxCtx.fillRect(0,H-H*0.4,W,H*0.4);
                fxCtx.restore();
            }
        }

        // PORTAL animated loop  
        let _portalLoop=null;
        function initPortal(){
            stopPortalLoop();
            if(!enabledEffects.portal)return;
            _portalLoop=setInterval(()=>{if(enabledEffects.portal&&!enabledEffects.rain)applyEffects();},50);
        }
        function stopPortalLoop(){clearInterval(_portalLoop);_portalLoop=null;}

        // Animated effects loop (fog movement, glow pulse, etc.)
        let _fxAnimLoop=null;
        function startFxAnimLoop(){
            if(_fxAnimLoop)return;
            _fxAnimLoop=setInterval(()=>{
                if(!enabledEffects.rain&&!enabledEffects.lightning&&!enabledEffects.heat&&(enabledEffects.fog||enabledEffects.glow||enabledEffects.godray||enabledEffects.noise||enabledEffects.portal||enabledEffects.prism)){
                    applyEffects();
                }
            },50);
        }
        function stopFxAnimLoop(){clearInterval(_fxAnimLoop);_fxAnimLoop=null;}

        // Start anim loop always
        setInterval(()=>{
            const needsAnim=enabledEffects.fog||enabledEffects.glow||enabledEffects.godray||(enabledEffects.noise&&parseInt(document.getElementById('noise-anim').value)>0)||enabledEffects.portal||enabledEffects.prism||enabledEffects.sepia;
            if(needsAnim&&!enabledEffects.rain&&!enabledEffects.lightning&&!enabledEffects.heat)applyEffects();
        },60);

        // ══════════════════════════════════════════════
        // MINIMAP
        // ══════════════════════════════════════════════
        const miniCanvas=document.getElementById('miniMapCanvas');
        const miniCtx=miniCanvas.getContext('2d');

        function drawMinimap(){
            if(!showMinimap)return;
            const W=miniCanvas.width,H=miniCanvas.height;
            miniCtx.clearRect(0,0,W,H);
            miniCtx.fillStyle='#111';
            miniCtx.fillRect(0,0,W,H);
            const sc=W/cols,sr=H/rows;
            Object.entries(floorLayer).forEach(([k,v])=>{const[x,y]=k.split(',').map(Number);miniCtx.fillStyle=v.color||'#f5f5dc';miniCtx.fillRect(x*sc,y*sr,sc+0.5,sr+0.5);});
            Object.entries(objectLayer).forEach(([k,v])=>{const[x,y]=k.split(',').map(Number);miniCtx.fillStyle=v.type&&v.type.startsWith('wall')?'#555':v.type&&v.type.startsWith('door')?'#a0522d':'rgba(255,255,255,0.4)';miniCtx.fillRect(x*sc,y*sr,sc,sr);});
            Object.entries(lightLayer).forEach(([k,v])=>{const[x,y]=k.split(',').map(Number);const lt=lightTypes[v.type];miniCtx.fillStyle=lt?lt.color+'88':'#ffaa0088';miniCtx.fillRect(x*sc,y*sr,sc,sr);});
            Object.keys(noteLayer).forEach(k=>{const[x,y]=k.split(',').map(Number);miniCtx.fillStyle='#f59e0b';miniCtx.fillRect(x*sc+sc*0.6,y*sr,sc*0.4,sr*0.4);});
        }

        function toggleMinimap(){
            showMinimap=!showMinimap;
            document.getElementById('minimapContainer').style.display=showMinimap?'':'none';
            const btn=document.getElementById('minimapToggleBtn');
            if(btn)btn.classList.toggle('active',showMinimap);
            if(showMinimap)drawMinimap();
        }

        setInterval(drawMinimap, 1000);

        function _drawNotesAndLabels(){
            // Draw note indicators
            Object.entries(noteLayer).forEach(([k,v])=>{
                const[x,y]=k.split(',').map(Number);
                const px=x*cellSize,py=y*cellSize;
                ctx.font='12px Arial';
                ctx.textAlign='right';
                ctx.textBaseline='top';
                ctx.fillStyle='#f59e0b';
                ctx.fillText(v.icon||'📝',px+cellSize-2,py+2);
            });
            // Draw zone labels
            Object.entries(labelLayer).forEach(([k,v])=>{
                const[x,y]=k.split(',').map(Number);
                const px=x*cellSize+cellSize/2,py=y*cellSize+cellSize*0.7;
                ctx.font=`bold 11px sans-serif`;
                ctx.textAlign='center';
                ctx.textBaseline='middle';
                ctx.fillStyle='rgba(0,0,0,0.7)';
                ctx.fillText(v.text,px+1,py+1);
                ctx.fillStyle=v.color||'#fff';
                ctx.fillText(v.text,px,py);
            });
            // Draw free texts
            freeTexts.forEach(ft=>{
                if(!ft.text)return;
                const fs=ft.size||16;
                ctx.font=`${ft.style||'bold'} ${fs}px ${ft.font||'sans-serif'}`;
                ctx.textAlign='left';
                ctx.textBaseline='top';
                // Shadow/outline for readability
                ctx.fillStyle='rgba(0,0,0,0.75)';
                for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(dx||dy)ctx.fillText(ft.text,ft.x+dx,ft.y+dy);}
                ctx.fillStyle=ft.color||'#ffffff';
                ctx.fillText(ft.text,ft.x,ft.y);
                // If this is the selected text in move mode, draw handle
                if(currentTool==='move-text'&&movingTextId===ft.id){
                    const m=ctx.measureText(ft.text);
                    ctx.strokeStyle='#667eea';
                    ctx.lineWidth=1.5;
                    ctx.setLineDash([4,3]);
                    ctx.strokeRect(ft.x-3,ft.y-3,m.width+6,fs+6);
                    ctx.setLineDash([]);
                }
            });
        }

        function _drawDistanceLine(){
            if(!distanceTool||!distanceStart)return;
            const end=distanceEnd||distanceStart;
            const x1=distanceStart.x*cellSize+cellSize/2,y1=distanceStart.y*cellSize+cellSize/2;
            const x2=end.x*cellSize+cellSize/2,y2=end.y*cellSize+cellSize/2;
            ctx.save();
            ctx.strokeStyle='#f59e0b';
            ctx.lineWidth=2;
            ctx.setLineDash([6,3]);
            ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
            ctx.setLineDash([]);
            // Mark start
            ctx.fillStyle='#f59e0b';
            ctx.beginPath();ctx.arc(x1,y1,5,0,Math.PI*2);ctx.fill();
            if(distanceEnd){
                ctx.beginPath();ctx.arc(x2,y2,5,0,Math.PI*2);ctx.fill();
                const dx=end.x-distanceStart.x,dy=end.y-distanceStart.y;
                const dist=Math.sqrt(dx*dx+dy*dy);
                const feet=Math.round(dist*5);
                ctx.font='bold 13px sans-serif';
                ctx.textAlign='center';
                ctx.fillStyle='rgba(0,0,0,0.7)';
                ctx.fillText(`${Math.round(dist)} cases / ${feet}ft`,((x1+x2)/2)+1,((y1+y2)/2)-7);
                ctx.fillStyle='#f59e0b';
                ctx.fillText(`${Math.round(dist)} cases / ${feet}ft`,(x1+x2)/2,(y1+y2)/2-8);
            }
            ctx.restore();
        }

        // ══════════════════════════════════════════════
        // DISTANCE TOOL
        // ══════════════════════════════════════════════
        function toggleDistanceTool(){
            distanceTool=!distanceTool;
            distanceStart=null;distanceEnd=null;
            const btn=document.getElementById('distanceToggleBtn');
            if(btn) btn.classList.toggle('active',distanceTool);
            const _hdb=document.getElementById('hudDistanceBadge');if(_hdb)_hdb.style.display=distanceTool?'flex':'none';
            redrawMap();
        }

        // Patch canvas mousemove and click for distance
        canvas.addEventListener('mousemove',e=>{
            if(!distanceTool||!distanceStart)return;
            const{x,y}=getCellFromMouse(e);
            distanceEnd={x,y};
            const dx=x-distanceStart.x,dy=y-distanceStart.y;
            const dist=Math.round(Math.sqrt(dx*dx+dy*dy));
            document.getElementById('hudDistanceVal').textContent=dist;
            document.getElementById('distanceBadge').textContent=`📏 ${dist} cases / ${dist*5}ft`;
            document.getElementById('distanceBadge').classList.add('visible');
            redrawMap();
        },true);

        // ══════════════════════════════════════════════
        // NOTES SYSTEM
        // ══════════════════════════════════════════════
        function openNoteModal(cellKey){
            currentNoteCellKey=cellKey;
            const[x,y]=cellKey.split(',');
            document.getElementById('noteModalTitle').textContent=`📝 Note MJ — Case (${x},${y})`;
            const existing=noteLayer[cellKey]||{};
            document.getElementById('noteText').value=existing.text||'';
            selectedNoteIcon=existing.icon||'📝';
            document.querySelectorAll('.note-icon-btn').forEach(b=>{
                b.classList.toggle('selected',b.dataset.icon===selectedNoteIcon);
            });
            document.getElementById('noteModal').classList.add('visible');
        }

        function closeNoteModal(){document.getElementById('noteModal').classList.remove('visible');}

        function selectNoteIcon(btn){
            document.querySelectorAll('.note-icon-btn').forEach(b=>b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedNoteIcon=btn.dataset.icon;
        }

        function saveNote(){
            const text=document.getElementById('noteText').value.trim();
            if(text){
                noteLayer[currentNoteCellKey]={text,icon:selectedNoteIcon};
            } else {
                delete noteLayer[currentNoteCellKey];
            }
            closeNoteModal();
            saveHistory('📝 DM Note');
            redrawMap();
        }

        function deleteNote(){
            delete noteLayer[currentNoteCellKey];
            closeNoteModal();
            saveHistory('🗑️ Delete note');
            redrawMap();
        }

        // ══════════════════════════════════════════════
        // LABEL SYSTEM
        // ══════════════════════════════════════════════
        function openLabelModal(cellKey){
            currentLabelCellKey=cellKey;
            const[x,y]=cellKey.split(',');
            document.getElementById('labelCellCoord').textContent=`${x},${y}`;
            const existing=labelLayer[cellKey]||{};
            document.getElementById('labelText').value=existing.text||'';
            document.getElementById('labelColor').value=existing.color||'#ffffff';
            updateLabelPreview();
            document.getElementById('labelModal').classList.add('visible');
        }

        function closeLabelModal(){document.getElementById('labelModal').classList.remove('visible');}

        function updateLabelPreview(){
            const text=document.getElementById('labelText').value||'Label';
            const color=document.getElementById('labelColor').value;
            const prev=document.getElementById('labelPreview');
            prev.textContent=text;
            prev.style.color=color;
        }

        document.getElementById('labelText').addEventListener('input',updateLabelPreview);
        document.getElementById('labelColor').addEventListener('input',updateLabelPreview);

        function saveLabel(){
            const text=document.getElementById('labelText').value.trim();
            const color=document.getElementById('labelColor').value;
            if(text){labelLayer[currentLabelCellKey]={text,color};}
            else{delete labelLayer[currentLabelCellKey];}
            closeLabelModal();
            saveHistory('🏷️ Label');
            redrawMap();
        }

        function deleteLabel(){
            delete labelLayer[currentLabelCellKey];
            closeLabelModal();
            saveHistory('🗑️ Delete label');
            redrawMap();
        }

        // ══════════════════════════════════════════════
        // CONTEXT MENU
        // ══════════════════════════════════════════════
        canvas.addEventListener('contextmenu',e=>{
            e.preventDefault();
            const{x,y}=getCellFromMouse(e);
            currentRightClickCell={x,y};
            const menu=document.getElementById('ctxMenu');
            menu.style.left=e.clientX+'px';
            menu.style.top=e.clientY+'px';
            menu.classList.add('visible');
        });

        document.addEventListener('click',()=>{
            document.getElementById('ctxMenu').classList.remove('visible');
        });

        function ctxNote(){
            if(!currentRightClickCell)return;
            openNoteModal(`${currentRightClickCell.x},${currentRightClickCell.y}`);
        }
        function ctxLabel(){
            if(!currentRightClickCell)return;
            openLabelModal(`${currentRightClickCell.x},${currentRightClickCell.y}`);
        }
        function ctxErase(){
            if(!currentRightClickCell)return;
            const k=`${currentRightClickCell.x},${currentRightClickCell.y}`;
            delete objectLayer[k];delete lightLayer[k];delete floorLayer[k];delete noteLayer[k];delete labelLayer[k];
            saveHistory('🧹 Context erase');redrawMap();
        }
        function ctxCopy(){
            if(!currentRightClickCell)return;
            const k=`${currentRightClickCell.x},${currentRightClickCell.y}`;
            copiedCell={floor:floorLayer[k],object:objectLayer[k],light:lightLayer[k],note:noteLayer[k],label:labelLayer[k]};
        }
        function ctxPaste(){
            if(!currentRightClickCell||!copiedCell)return;
            const k=`${currentRightClickCell.x},${currentRightClickCell.y}`;
            if(copiedCell.floor)floorLayer[k]=JSON.parse(JSON.stringify(copiedCell.floor));
            if(copiedCell.object)objectLayer[k]=JSON.parse(JSON.stringify(copiedCell.object));
            if(copiedCell.light)lightLayer[k]=JSON.parse(JSON.stringify(copiedCell.light));
            if(copiedCell.note)noteLayer[k]=JSON.parse(JSON.stringify(copiedCell.note));
            if(copiedCell.label)labelLayer[k]=JSON.parse(JSON.stringify(copiedCell.label));
            saveHistory('📌 Paste cell');redrawMap();
        }
        function ctxStartDistance(){
            if(!currentRightClickCell)return;
            distanceTool=true;
            distanceStart=currentRightClickCell;
            distanceEnd=null;
            const _dtb=document.getElementById('distanceToggleBtn');
            if(_dtb) _dtb.classList.add('active');
            document.getElementById('hudDistanceBadge').style.display='flex';
        }

        // ══════════════════════════════════════════════
        // HANDLE NOTE / LABEL TOOL CLICKS (injected via the original placeTile above)
        // ══════════════════════════════════════════════

        // ══════════════════════════════════════════════
        // INITIATIVE TRACKER
        // ══════════════════════════════════════════════
        function toggleInitiative(){
            const panel=document.getElementById('initiativePanel');
            panel.classList.toggle('visible');
            document.getElementById('initiativeToggleBtn').classList.toggle('active',panel.classList.contains('visible'));
        }

        function toggleHistoryPanel(){
            const panel=document.getElementById('historyPanelFloat');
            if(!panel) return;
            panel.classList.toggle('visible');
            const btn=document.getElementById('historyToggleBtn');
            if(btn) btn.classList.toggle('active', panel.classList.contains('visible'));
        }

        // Make history panel draggable
        (()=>{
            const panel=document.getElementById('historyPanelFloat');
            if(!panel) return;
            const header=document.getElementById('historyPanelHeader');
            let drag=false,ox=0,oy=0;
            header.addEventListener('mousedown',e=>{drag=true;ox=e.clientX-panel.offsetLeft;oy=e.clientY-panel.offsetTop;});
            document.addEventListener('mousemove',e=>{if(drag){panel.style.left=(e.clientX-ox)+'px';panel.style.top=(e.clientY-oy)+'px';panel.style.right='auto';}});
            document.addEventListener('mouseup',()=>drag=false);
        })();

        function renderInitiativeList(){
            const list=document.getElementById('initiativeList');
            list.innerHTML='';
            if(initiativeEntries.length===0){
                list.innerHTML='<div style="text-align:center;color:#3a3a5a;font-size:11px;padding:10px">No combatants</div>';
                return;
            }
            const sorted=[...initiativeEntries].sort((a,b)=>b.score-a.score);
            sorted.forEach((entry,i)=>{
                const isCurrentTurn=initiativeEntries.indexOf(sorted[initiativeCurrentIdx])===-1
                    ?i===0
                    :sorted[i]===sorted[initiativeCurrentIdx];
                const hpPct=entry.maxHp?entry.hp/entry.maxHp:1;
                const el=document.createElement('div');
                el.className='initiative-entry'+(entry.dead?' dead':'')+(i===initiativeCurrentIdx?' current':'');
                const hpClass=hpPct>0.5?'':hpPct>0.25?'low':'critical';
                el.innerHTML=`
                    <span class="initiative-score">${entry.score}</span>
                    <span class="initiative-name">${entry.emoji||'⚔️'} ${entry.name}</span>
                    <span class="initiative-hp ${hpClass}">${entry.hp}/${entry.maxHp||'?'}</span>
                    <span class="initiative-actions">
                        <button class="ini-btn" onclick="iniDamage(${i})" title="Deal damage">🗡️</button>
                        <button class="ini-btn" onclick="iniHeal(${i})" title="Heal">💚</button>
                        <button class="ini-btn" onclick="iniToggleDead(${i})" title="KO/Alive">${entry.dead?'💊':'💀'}</button>
                        <button class="ini-btn" onclick="iniRemove(${i})" title="Remove">✕</button>
                    </span>`;
                list.appendChild(el);
            });
            document.getElementById('iniRound').textContent=initiativeRound;
        }

        function iniAddEntry(){
            const name=document.getElementById('iniName').value.trim();
            const score=parseInt(document.getElementById('iniScore').value)||0;
            const hp=parseInt(document.getElementById('iniHP').value)||10;
            if(!name)return;
            // Auto-detect emoji from name
            const emojiMap={barbarian:'🪓',warrior:'⚔️',mage:'🧙',sorcerer:'🔮',ranger:'🏹',rogue:'🗡️',cleric:'✝️',paladin:'🛡️',druid:'🌿',bard:'🎵',dragon:'🐉',goblin:'👺',skeleton:'💀',zombie:'🧟',wolf:'🐺',troll:'👹',ogre:'😈',vampire:'🧛'};
            let emoji='⚔️';
            const ln=name.toLowerCase();
            for(const[k,v] of Object.entries(emojiMap)){if(ln.includes(k)){emoji=v;break;}}
            initiativeEntries.push({name,score,hp,maxHp:hp,dead:false,emoji});
            document.getElementById('iniName').value='';
            document.getElementById('iniScore').value='';
            document.getElementById('iniHP').value='';
            renderInitiativeList();
        }

        function iniNextTurn(){
            if(initiativeEntries.length===0)return;
            const sorted=[...initiativeEntries].sort((a,b)=>b.score-a.score);
            initiativeCurrentIdx=(initiativeCurrentIdx+1)%sorted.length;
            if(initiativeCurrentIdx===0)initiativeRound++;
            renderInitiativeList();
        }
        function iniNextRound(){initiativeRound++;initiativeCurrentIdx=0;renderInitiativeList();}
        function iniReset(){initiativeEntries=[];initiativeCurrentIdx=0;initiativeRound=1;renderInitiativeList();}
        function iniDamage(i){const sorted=[...initiativeEntries].sort((a,b)=>b.score-a.score);const e=sorted[i];const d=parseInt(prompt(`Damage for ${e.name}:`,0));if(!isNaN(d)&&d>0){e.hp=Math.max(0,e.hp-d);if(e.hp===0)e.dead=true;}renderInitiativeList();}
        function iniHeal(i){const sorted=[...initiativeEntries].sort((a,b)=>b.score-a.score);const e=sorted[i];const h=parseInt(prompt(`Healing for ${e.name}:`,0));if(!isNaN(h)&&h>0){e.hp=Math.min(e.maxHp||999,e.hp+h);e.dead=false;}renderInitiativeList();}
        function iniToggleDead(i){const sorted=[...initiativeEntries].sort((a,b)=>b.score-a.score);sorted[i].dead=!sorted[i].dead;renderInitiativeList();}
        function iniRemove(i){const sorted=[...initiativeEntries].sort((a,b)=>b.score-a.score);const idx=initiativeEntries.indexOf(sorted[i]);if(idx>-1)initiativeEntries.splice(idx,1);renderInitiativeList();}

        // Drag initiative panel
        (()=>{
            const panel=document.getElementById('initiativePanel');
            const header=document.getElementById('iniHeader');
            let drag=false,ox=0,oy=0;
            header.addEventListener('mousedown',e=>{drag=true;ox=e.clientX-panel.offsetLeft;oy=e.clientY-panel.offsetTop;});
            document.addEventListener('mousemove',e=>{if(drag){panel.style.left=(e.clientX-ox)+'px';panel.style.top=(e.clientY-oy)+'px';}});
            document.addEventListener('mouseup',()=>drag=false);
        })();

        // ══════════════════════════════════════════════
        // KEYBOARD SHORTCUTS PANEL
        // ══════════════════════════════════════════════
        function toggleKbd(){
            document.getElementById('kbdOverlay').classList.toggle('visible');
        }

        // ══════════════════════════════════════════════
        // EXTENDED KEYBOARD SHORTCUTS
        // ══════════════════════════════════════════════
        document.addEventListener('keydown',e=>{
            // Only block shortcuts when typing in the free-text editor input or a textarea
            const inFreeTextInput = e.target.id==='textEditorInput';
            const inTextarea = e.target.tagName==='TEXTAREA';
            if(inFreeTextInput||inTextarea)return;
            // For other inputs (color pickers, range sliders, selects), allow ctrl shortcuts but block letter keys
            const inInput = e.target.tagName==='INPUT'||e.target.isContentEditable;
            // Existing
            if(e.ctrlKey&&e.key==='z'){e.preventDefault();undo();}
            if(e.ctrlKey&&(e.key==='y'||(e.shiftKey&&e.key==='Z'))){e.preventDefault();redo();}
            if(e.ctrlKey&&e.key==='s'){e.preventDefault();exportMap();}
            if(e.ctrlKey&&e.key==='e'){e.preventDefault();exportImage();}
            // Arrow keys → plane navigation (with Shift to avoid conflicts with scroll)
            if(e.shiftKey&&!e.ctrlKey){
                switch(e.key){
                    case'ArrowUp':   e.preventDefault();navigatePlane(0,-1);return;
                    case'ArrowDown': e.preventDefault();navigatePlane(0,1);return;
                    case'ArrowLeft': e.preventDefault();navigatePlane(-1,0);return;
                    case'ArrowRight':e.preventDefault();navigatePlane(1,0);return;
                }
            }
            // Mode shortcuts — only when not focused on any input
            if(!e.ctrlKey&&!e.shiftKey&&!inInput){
                switch(e.key.toLowerCase()){
                    case'f':setMode('floor');break;
                    case'w':setMode('wall');break;
                    case'o':setMode('object');break;
                    case'l':setMode('light');break;
                    case'x':setMode('fx');break;
                    case'e':setTool('erase');break;
                    case'r':document.getElementById('fillMode').checked=!document.getElementById('fillMode').checked;updateHUD();updateFillToggle();break;
                    case'g':document.getElementById('gridToggle').checked=!document.getElementById('gridToggle').checked;toggleGrid();break;
                    case'd':toggleDistanceTool();break;
                    case'i':toggleInitiative();break;
                    case'h':toggleHistoryPanel();break;
                    case'm':toggleMinimap();break;
                    case't':setMode('object');setTool('free-text');break;
                    case'?':toggleKbd();break;
                    case'+':zoomIn();break;
                    case'-':zoomOut();break;
                    case'0':resetZoom();break;
                    case'escape':
                        if(distanceTool)toggleDistanceTool();
                        document.getElementById('ctxMenu').classList.remove('visible');
                        document.getElementById('kbdOverlay').classList.remove('visible');
                        document.getElementById('noteModal').classList.remove('visible');
                        document.getElementById('labelModal').classList.remove('visible');
                        break;
                }
            }
        });

        // ══════════════════════════════════════════════
        // FREE TEXT SYSTEM
        // ══════════════════════════════════════════════
        let textEditingId=null;
        let textEditingPos={x:0,y:0};
        let movingTextId=null;
        let movingTextOffset={x:0,y:0};
        let _textIdCounter=Date.now();

        const textOverlay=()=>document.getElementById('textEditorOverlay');
        const textInput=()=>document.getElementById('textEditorInput');

        function openTextEditor(pixelX,pixelY,existingId){
            textEditingPos={x:pixelX,y:pixelY};
            textEditingId=existingId!=null?existingId:null;
            const existing=existingId!=null?freeTexts.find(f=>f.id===existingId):null;
            textInput().value=existing?existing.text:'';
            document.getElementById('textEditorColor').value=existing?existing.color:'#ffffff';
            document.getElementById('textEditorSize').value=existing?String(existing.size):'16';
            document.getElementById('textEditorStyle').value=existing?existing.style:'bold';
            document.getElementById('textEditorFont').value=existing?existing.font:'sans-serif';
            // Position en coordonnées écran (fixed)
            const canvasRect=canvas.getBoundingClientRect();
            let ox=canvasRect.left+pixelX/zoom;
            let oy=canvasRect.top+pixelY/zoom-100;
            if(oy<8) oy=canvasRect.top+pixelY/zoom+24;
            if(ox+340>window.innerWidth) ox=window.innerWidth-345;
            if(ox<4) ox=4;
            textOverlay().style.left=ox+'px';
            textOverlay().style.top=oy+'px';
            textOverlay().classList.add('visible');
            // Bouton supprimer seulement sur un texte existant
            const delBtn=document.getElementById('textEditorDeleteBtn');
            if(delBtn) delBtn.style.display=existingId!=null?'inline-block':'none';
            // Aperçu live
            textInput().style.fontSize=(existing?existing.size:16)+'px';
            textInput().style.color=existing?existing.color:'#ffffff';
            setTimeout(()=>textInput().focus(),30);
        }

        function deleteTextEdit(){
            if(textEditingId!=null){
                const idx=freeTexts.findIndex(f=>f.id===textEditingId);
                if(idx>-1) freeTexts.splice(idx,1);
            }
            cancelTextEdit();
            saveHistory('🗑️ Delete texte');
            redrawMap();
        }

        function confirmTextEdit(){
            const text=textInput().value.trim();
            const color=document.getElementById('textEditorColor').value;
            const size=parseInt(document.getElementById('textEditorSize').value);
            const style=document.getElementById('textEditorStyle').value;
            const font=document.getElementById('textEditorFont').value;
            if(textEditingId!=null){
                const idx=freeTexts.findIndex(f=>f.id===textEditingId);
                if(idx>-1){
                    if(text){freeTexts[idx]={...freeTexts[idx],text,color,size,style,font};}
                    else{freeTexts.splice(idx,1);}
                }
            } else if(text){
                freeTexts.push({id:_textIdCounter++,x:textEditingPos.x,y:textEditingPos.y,text,color,size,style,font});
            }
            cancelTextEdit();
            saveHistory('✍️ Free Text');
            redrawMap();
        }

        function cancelTextEdit(){
            textOverlay().classList.remove('visible');
            textInput().value='';
            textEditingId=null;
        }

        textInput().addEventListener('keydown',e=>{
            if(e.key==='Enter'){e.preventDefault();confirmTextEdit();}
            if(e.key==='Escape'){cancelTextEdit();}
        });

        function _updateTextInputPreview(){
            const fs=parseInt(document.getElementById('textEditorSize').value);
            const sty=document.getElementById('textEditorStyle').value;
            textInput().style.fontSize=fs+'px';
            textInput().style.fontWeight=sty.includes('bold')?'bold':'normal';
            textInput().style.fontStyle=sty.includes('italic')?'italic':'normal';
            textInput().style.color=document.getElementById('textEditorColor').value;
        }
        textInput().addEventListener('input',_updateTextInputPreview);
        document.getElementById('textEditorColor').addEventListener('input',_updateTextInputPreview);
        document.getElementById('textEditorSize').addEventListener('change',_updateTextInputPreview);
        document.getElementById('textEditorStyle').addEventListener('change',_updateTextInputPreview);

        function _hitTestFreeText(px,py){
            for(let i=freeTexts.length-1;i>=0;i--){
                const ft=freeTexts[i];
                const fs=ft.size||16;
                ctx.save();
                ctx.font=`${ft.style||'bold'} ${fs}px ${ft.font||'sans-serif'}`;
                const w=ctx.measureText(ft.text).width;
                ctx.restore();
                if(px>=ft.x-6&&px<=ft.x+w+6&&py>=ft.y-6&&py<=ft.y+fs+6)return ft;
            }
            return null;
        }

        canvas.addEventListener('mousedown',e=>{
            if(currentTool!=='free-text'&&currentTool!=='move-text')return;
            e.stopPropagation();
            const rect=canvas.getBoundingClientRect();
            const scaleX=canvas.width/rect.width,scaleY=canvas.height/rect.height;
            const px=(e.clientX-rect.left)*scaleX;
            const py=(e.clientY-rect.top)*scaleY;
            if(currentTool==='free-text'){
                const hit=_hitTestFreeText(px,py);
                if(hit){openTextEditor(hit.x,hit.y,hit.id);}
                else{openTextEditor(px,py,null);}
            } else if(currentTool==='move-text'){
                const hit=_hitTestFreeText(px,py);
                if(hit){movingTextId=hit.id;movingTextOffset={x:px-hit.x,y:py-hit.y};canvas.style.cursor='grabbing';}
            }
        },true);

        canvas.addEventListener('mousemove',e=>{
            if(currentTool!=='move-text'||movingTextId==null)return;
            e.stopPropagation();
            const rect=canvas.getBoundingClientRect();
            const scaleX=canvas.width/rect.width,scaleY=canvas.height/rect.height;
            const px=(e.clientX-rect.left)*scaleX,py=(e.clientY-rect.top)*scaleY;
            const ft=freeTexts.find(f=>f.id===movingTextId);
            if(ft){ft.x=px-movingTextOffset.x;ft.y=py-movingTextOffset.y;redrawMap();}
        },true);

        canvas.addEventListener('mouseup',e=>{
            if(currentTool==='move-text'&&movingTextId!=null){
                movingTextId=null;canvas.style.cursor='grab';
                saveHistory('↔️ Move text');
            }
        },true);

        // Keyboard shortcut T → free-text
        // Added in main keydown below — handled via switch case

        // Render initiative on load
        renderInitiativeList();