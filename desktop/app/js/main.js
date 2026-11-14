// Splat Darkroom — application.
const $ = s=>document.querySelector(s);
const App = {
  items:[], scans:[], cur:null, module:'develop', lastStock:'kodak_portra_400', clipboard:null, scanItem:null,
  scanRT:null, scanKey:null, editMax:6144,

  async start(){
    const canvas=$('#view');
    try { Engine.init(canvas); } catch(e){ document.body.innerHTML='<p style="padding:40px">This app needs WebGL2. '+e.message+'</p>'; return; }
    Splat.init(Engine.gl); Splat.onDirty=()=>{ Engine.dirty=true; };
    this.editMax=Math.min(6144, Engine.gl.getParameter(Engine.gl.MAX_TEXTURE_SIZE));
    await Engine.loadManifest();
    $('#credits').innerHTML = 'Colour film models: <a href="https://github.com/andreavolpato/spektrafilm">spektrafilm</a> by Andrea Volpato — profiles &amp; LUTs CC BY-SA 4.0. Black-and-white film and paper models, grain and halation: Splat Darkroom.';
    this.buildDevelopPanels(); this.buildScanPanels(); this.buildPresets();
    this.bindEvents();
    await Engine.ensureLuts(Engine.p);
    await this.restore();
    this.renderUserPresets();
    this.setModule(this.items.length?'develop':'develop');
    if(this.items.length) this.select(this.items[0].id);
    requestAnimationFrame(()=>this.loop());
    setTimeout(()=>this.checkUpdate(false),4000);
    setTimeout(()=>this.syncPresetsIn(),1500); window.addEventListener('focus',()=>{ clearTimeout(this._fs); this._fs=setTimeout(()=>this.syncPresetsIn(),400); });
  },

  // ================================================================ panels
  buildDevelopPanels(){
    Tools.init(this);
    const root=$('#devPanels'); root.innerHTML='';
    const P=()=>Engine.p, set=(k)=>v=>{ P()[k]=v; this.changed(); }, commit=()=>this.commit();
    const S=(parent,key,label,o)=>UI.slider(parent,key,label,Object.assign({get:()=>P()[key],set:set(key),commit,def:DEFAULTS[key]},o));
    // Film
    let b=UI.panel(root,'pFilm','Film',true,()=>{ Object.assign(P(),{format:DEFAULTS.format,autoExp:true}); this.changed(); this.commit(); UI.refresh(); });
    UI.select(b,'stock','Stock',()=>{ const g={}; const out=[]; Engine.manifest.stocks.forEach(s=>{ if(!g[s.group]){ g[s.group]={group:s.group,items:[]}; out.push(g[s.group]); } g[s.group].items.push([s.id,(s.maker==='Kodak'||s.maker==='Fujifilm'&&s.group==='Fujifilm'?'':s.maker+' ')+s.name]); }); return out; },
      ()=>P().stock, v=>this.setStock(v));
    UI.select(b,'paper','Print / Lab',()=>Engine.stock(P().stock).papers.map(x=>[x.id,x.name]), ()=>Engine.paperFor(P()).id, async v=>{ P().paper=v; await Engine.ensureLuts(P()); this.changed(); this.commit(); });
    UI.seg(b,'format','Format',Object.entries(FORMATS).map(([k,f])=>[k,f.label]),()=>P().format,v=>{ P().format=v; this.changed(); this.commit(); });
    S(b,'filmAmt','Strength',{min:0,max:100,step:1,fmt:x=>Math.round(x)+'%'});
    S(b,'push','Push / pull',{min:-2,max:3,step:1/3,fmt:x=>Math.abs(x)<0.01?'Box':(x>0?'+':'−')+(Math.round(Math.abs(x)*3)/3).toFixed(1).replace('.0','')});
    UI.check(b,'autoExp','Auto exposure (lab metering)',()=>P().autoExp,v=>{ P().autoExp=v; this.changed(); this.commit(); });
    UI.note(b,'','stockNote');
    Tools.buildCropPanel(root);
    Tools.buildMaskPanel(root);
    // Basic
    b=UI.panel(root,'pBasic','Basic',true,()=>{ ['temp','tint','ev','contrast','highlights','shadows','whites','blacks','vibrance','saturation','hlExpand'].forEach(k=>P()[k]=DEFAULTS[k]); this.changed(); this.commit(); UI.refresh(); });
    UI.note(b,'<span class="sub">White balance</span>');
    S(b,'temp','Temp',{min:-100,max:100,step:1,track:'linear(90deg,#3c6bd6,#c9c9c9 50%,#e4c03a)'.replace('linear','linear-gradient')});
    S(b,'tint','Tint',{min:-100,max:100,step:1,track:'linear-gradient(90deg,#3fae4a,#c9c9c9 50%,#c446c0)'});
    { const r=document.createElement('div'); r.className='btnrow'; b.appendChild(r); UI.button(r,'Auto',()=>Tools.autoWB()); const w=UI.button(r,'⌖ Pick neutral  W',()=>Tools.pickWB(!Tools.eyedrop)); w.id='wbPick'; }
    UI.note(b,'<span class="sub">Tone</span>');
    S(b,'ev','Exposure',{min:-4,max:4,step:0.01,fmt:x=>(x>0?'+':'')+x.toFixed(2)});
    S(b,'contrast','Contrast',{min:-100,max:100,step:1});
    S(b,'highlights','Highlights',{min:-100,max:100,step:1});
    S(b,'shadows','Shadows',{min:-100,max:100,step:1});
    S(b,'whites','Whites',{min:-100,max:100,step:1});
    S(b,'blacks','Blacks',{min:-100,max:100,step:1});
    UI.note(b,'<span class="sub">Presence</span>');
    S(b,'vibrance','Vibrance',{min:-100,max:100,step:1});
    S(b,'saturation','Saturation',{min:-100,max:100,step:1});
    UI.note(b,'<span class="sub">Source</span>');
    S(b,'hlExpand','Highlight room',{min:0,max:1,step:0.01,fmt:x=>Math.round(x*100)});
    UI.note(b,'Phone JPEG/HEIC files have their highlights squeezed by the camera. This re-opens them so the film shoulder can roll them off. Not used for RAW/ProRAW.');
    Tools.buildCurvePanel(root);
    Tools.buildHSLPanel(root);
    Tools.buildGradingPanel(root);
    // Detail
    b=UI.panel(root,'pDetail','Detail',false,()=>{ ['sharpen','sharpRadius','nr','nrColor'].forEach(k=>P()[k]=DEFAULTS[k]); this.changed(); this.commit(); UI.refresh(); });
    UI.note(b,'<span class="sub">Sharpening</span>');
    S(b,'sharpen','Amount',{min:0,max:150,step:1});
    S(b,'sharpRadius','Radius',{min:0.5,max:3,step:0.1,fmt:x=>x.toFixed(1)});
    UI.note(b,'<span class="sub">Noise reduction</span>');
    S(b,'nr','Luminance',{min:0,max:100,step:1});
    S(b,'nrColor','Color',{min:0,max:100,step:1});
    UI.note(b,'Clean up phone noise first, then add film grain on top. Judge sharpening and noise at 1:1 (Z).');
    // Grain
    b=UI.panel(root,'pGrain','Grain',true,()=>{ ['grain','grainSize','grainRough'].forEach(k=>P()[k]=DEFAULTS[k]); this.changed(); this.commit(); UI.refresh(); });
    S(b,'grain','Amount',{min:0,max:3,step:0.01,fmt:x=>Math.round(x*100)});
    S(b,'grainSize','Size',{min:0.4,max:3,step:0.01,fmt:x=>Math.round(x*100)});
    S(b,'grainRough','Softness',{min:0.05,max:0.8,step:0.01,fmt:x=>Math.round(x*100)});
    UI.note(b,'100 = true to stock. Grain is modelled as clumps of different-sized silver crystals whose density follows the image; size follows the film format.');
    // Halation & glow
    b=UI.panel(root,'pHal','Halation & Glow',false,()=>{ ['halation','glow'].forEach(k=>P()[k]=DEFAULTS[k]); this.changed(); this.commit(); UI.refresh(); });
    S(b,'halation','Halation',{min:0,max:4,step:0.01,fmt:x=>Math.round(x*100)});
    S(b,'glow','Diffusion',{min:0,max:1,step:0.01,fmt:x=>Math.round(x*100)});
    UI.note(b,'Halation is light bouncing off the film base back into the red layer. It\'s strong on CineStill (no anti-halation layer), faint on Portra. Diffusion acts like a Pro-Mist filter.');
    // Lens
    b=UI.panel(root,'pLens','Lens',false,()=>{ P().falloff=DEFAULTS.falloff; this.changed(); this.commit(); UI.refresh(); });
    S(b,'falloff','Falloff',{min:0,max:1.5,step:0.01,fmt:x=>Math.round(x*100)});
    // Frame
    b=UI.panel(root,'pFrame','Frame',false);
    UI.select(b,'border','Border',()=>Borders.styles,()=>P().border,v=>{ P().border=v; this.changed(); this.commit(); });
    UI.select(b,'edgeText','Edge print',()=>[['stock','Film stock'],['custom','Custom text'],['none','None']],()=>P().edgeText,v=>{ P().edgeText=v; ct.style.display=v==='custom'?'':'none'; this.changed(); this.commit(); });
    const ct=document.createElement('div'); ct.className='row'; ct.innerHTML='<label>Text</label><input class="askIn" spellcheck="false" maxlength="40" placeholder="e.g. DANIEL S. WORKMAN 400">'; b.appendChild(ct);
    const ci=ct.querySelector('input'); ci.value=P().edgeCustom||''; ct.style.display=P().edgeText==='custom'?'':'none';
    ci.addEventListener('keydown',e=>e.stopPropagation()); ci.oninput=()=>{ P().edgeCustom=ci.value; this.changed(); }; ci.onchange=()=>this.commit();
    UI.sliders.edgeCustom=()=>{ if(document.activeElement!==ci) ci.value=P().edgeCustom||''; ct.style.display=P().edgeText==='custom'?'':'none'; };
    S(b,'frameNo','Frame number',{min:0,max:38,step:1,fmt:x=>x?String(Math.round(x)):'Auto'});
    UI.note(b,'Edge print, frame numbers and DX code appear on the 35mm border; 120 and 4×5 show the edge text.');
  },

  buildScanPanels(){
    const c=Splat.cam, d=()=>{ Engine.dirty=true; };
    let b=$('#scanSourceBody'); b.innerHTML='';
    const row=document.createElement('div'); row.className='btnrow'; b.appendChild(row);
    UI.button(row,'Open scan…',()=>this.openScan());
    UI.button(row,'Demo',()=>this.loadDemo());
    const row2=document.createElement('div'); row2.className='btnrow'; b.appendChild(row2);
    const nb=UI.button(row2,'New scan from video / photos…',()=>this.newScan());
    if(!Native.available){ nb.disabled=true; nb.title='Available in the Mac app'; }
    UI.seg(b,'up','Up axis',[['Y-up','Y up'],['Y-down','Y down'],['Z-up','Z up']],()=>c.up,v=>{ c.up=v; if(Splat.scene&&!Splat.scene.demo) Splat.frame(); Splat.lastSortView=null; this.scanKey=null; d(); });
    UI.seg(b,'bg','Backdrop',[['#0a0a09','Black'],['#7d7a74','Grey'],['#f1efe9','White']],()=>c.bg,v=>{ c.bg=v; d(); });
    UI.slider(b,'scale','Scene scale',{min:0,max:1,step:0.001,def:Math.log(1/0.02)/Math.log(2500),
      get:()=>Math.log(c.scale/0.02)/Math.log(2500), set:v=>{ c.scale=0.02*Math.pow(2500,v); d(); }, fmt:()=>c.scale<1?Math.round(c.scale*100)+' cm':c.scale.toFixed(2)+' m'});
    UI.note(b,'Scans have arbitrary units. Set this so the subject is its real size and depth of field behaves like a real lens.');
    const vr=document.createElement('div'); vr.className='btnrow'; b.appendChild(vr);
    UI.button(vr,'Reset view',()=>{ Splat.frame(); this.scanKey=null; d(); },'tbtn');
    UI.button(vr,'Export orbit video…',()=>this.orbitDialog(),'tbtn accent');
    b=$('#cameraBody'); b.innerHTML='';
    UI.seg(b,'cfmt','Format',Object.keys(SCAN_FORMATS).map(k=>[k,k.replace('x','×')]),()=>c.format,v=>{ c.format=v; c.fmm=SCAN_FORMATS[v].f; UI.refresh(); d(); });
    UI.seg(b,'orient','Orientation',[['true','Vertical'],['false','Horizontal']],()=>String(c.portrait),v=>{ c.portrait=v==='true'; d(); });
    UI.slider(b,'fmm','Focal length',{min:14,max:760,step:1,def:150,get:()=>c.fmm,set:v=>{ c.fmm=v; d(); },fmt:x=>Math.round(x)+'mm'});
    UI.slider(b,'stop','Aperture',{min:0,max:STOPS.length-1,step:1,def:4,get:()=>c.stop,set:v=>{ c.stop=v; d(); },fmt:x=>'ƒ/'+STOPS[x]});
    UI.slider(b,'focusS','Focus',{min:0,max:1,step:0.001,def:0.5,get:()=>Math.log(c.focus/0.05)/Math.log(8000),set:v=>{ c.focusLock=null; c.focus=0.05*Math.pow(8000,v); d(); },
      fmt:()=>{ const m=c.focus*c.scale; return m<1?Math.round(m*100)+'cm':m.toFixed(2)+'m'; }});
    UI.slider(b,'tilt','Front tilt',{min:-12,max:12,step:0.5,def:0,get:()=>c.tilt,set:v=>{ c.tilt=v; d(); },fmt:x=>(x>0?'+':'')+x+'°'});
    UI.check(b,'dof','Depth of field',()=>c.dof,v=>{ c.dof=v; d(); });
    UI.note(b,'Click the image to focus; focus stays locked to that point while you orbit. Double-click to orbit around it.');
  },

  buildPresets(){
    UI.buildPresets($('#presetList'),Engine.manifest.stocks,id=>{ this.setStock(id); this.commit(); },async id=>{
      this.hover(id?Object.assign({},Engine.p,{stock:id,paper:null}):null); });
    $('#presetSearch').addEventListener('input',e=>UI.filterPresets(e.target.value));
    $('#presetSearch').addEventListener('click',e=>e.stopPropagation());
    $('#presetSearch').addEventListener('keydown',e=>e.stopPropagation());
  },

  // ---- hover preview (stocks and user presets): main view, histogram and navigator all show it
  async hover(params){
    Engine.hoverParams=params||null;
    if(params) await Engine.ensureLuts(params);
    Engine.dirty=true;
  },
  navPreview(p){
    const c=$('#navCanvas'); if(!c||!Engine.src||this.module==='scan'||!c.clientWidth) return;
    const dpr=window.devicePixelRatio||1, W=Math.round(c.clientWidth*dpr), H=Math.round(W*0.66);
    if(c.width!==W||c.height!==H){ c.width=W; c.height=H; c.style.height=(H/dpr)+'px'; }
    const [sw,sh]=Engine.dims(p), sc=Math.min(W/sw,H/sh), w=Math.max(2,Math.round(sw*sc)), h=Math.max(2,Math.round(sh*sc));
    this._navTarget=GLU.ensure(this._navTarget,w,h,'rgba8');
    const L={W:w,H:h,dpr:1,scale:sc,fx:0,fy:0,fw:w,fh:h,ix:0,iy:0,iw:w,ih:h,win:[0,0,1,1],b:{l:0,r:0,t:0,b:0}};
    Engine.render({layout:L,target:this._navTarget,RT:this._navRT||(this._navRT={}),params:Object.assign({},p,{border:'none'}),forceAfter:!Engine.before||!!Engine.hoverParams});
    const gl=Engine.gl, px=new Uint8Array(w*h*4); gl.bindFramebuffer(gl.FRAMEBUFFER,this._navTarget.f); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const x=c.getContext('2d'); x.fillStyle='#1a1a1a'; x.fillRect(0,0,W,H);
    const id=x.createImageData(w,h); for(let y=0;y<h;y++) id.data.set(px.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);
    const ox=Math.round((W-w)/2), oy=Math.round((H-h)/2); x.putImageData(id,ox,oy);
    if(Engine.view.mode!=='fit' && this._lastL){ const [u0,v0,u1,v1]=this._lastL.win; x.strokeStyle='#fff'; x.lineWidth=1.5*dpr; x.strokeRect(ox+u0*w,oy+v0*h,(u1-u0)*w,(v1-v0)*h); }
    $('#navZoom').textContent = Engine.hoverParams ? 'PREVIEW' : (Engine.view.mode==='fit'?'FIT':'1:1');
  },
  // ---- presets sync through iCloud Drive/Splat Darkroom (the phone app saves & opens files there)
  icloudDir(){ return this.info&&this.info.icloud ? this.info.icloud+'/Splat Darkroom' : null; },
  async syncPresetsIn(){
    const dir=this.icloudDir(); if(!dir||!Native.available) return;
    let files=[]; try{ files=await Native.call('listDir',{path:dir}); }catch(e){ return; }
    let added=0, changed=0;
    for(const f of files.filter(f=>/\.json$/i.test(f))){ try{ const t=await (await fetch(Native.fileURL(dir+'/'+f))).text(); added+=Tools.mergePresets(this.userPresets,Tools.parsePresetFile(t)); changed+=Tools._mergeChanged||0; }catch(e){} }
    if(added||changed){ this.renderUserPresets(); this.saveSoon(); this.toast(`Synced presets from iCloud Drive (${added} new${changed?`, ${changed} updated`:''})`); }
  },
  syncPresetsOut(){ const dir=this.icloudDir(); if(!dir||!Native.available||!(this.info.native>=2)) return;
    clearTimeout(this._po); this._po=setTimeout(()=>{ const t=Tools.presetFile(this.userPresets); Native.call('writeFile',{path:dir+'/Mac Presets.darkroom.json',base64:btoa(unescape(encodeURIComponent(t)))}).catch(()=>{}); },1500); },
  async exportPresets(){
    if(!this.userPresets.length){ this.toast('No presets to export yet — make one with +'); return; }
    const text=Tools.presetFile(this.userPresets), name='Darkroom Presets.darkroom.json';
    if(Native.available){ const path=await Native.call('save',{name,base64:btoa(unescape(encodeURIComponent(text)))}); if(path) this.toast('Saved '+this.userPresets.length+' presets'); }
    else { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'application/json'})); a.download=name; a.click(); }
  },
  async importPresets(){
    const take=text=>{ try{ const inc=Tools.parsePresetFile(text); const n=Tools.mergePresets(this.userPresets,inc); this.renderUserPresets(); this.saveSoon(); this.toast(`Imported ${inc.length} preset${inc.length===1?'':'s'}`+(inc.length-n?` (${inc.length-n} updated)`:'')); }catch(e){ this.toast('Not a preset file'); } };
    if(Native.available){ const p=await Native.call('open',{exts:['json'],multiple:false}); if(p&&p[0]) take(await (await fetch(Native.fileURL(p[0]))).text()); }
    else { const i=document.createElement('input'); i.type='file'; i.accept='.json,application/json'; i.onchange=async()=>{ if(i.files[0]) take(await i.files[0].text()); }; i.click(); }
  },
  // ---- versions: named snapshots of this photo's edit, comparable side by side
  saveVersion(){
    const it=this.cur; if(!it){ this.toast('Open a photo first'); return; }
    it.versions=it.versions||[]; const n=it.versions.length+1;
    const v={id:'v'+Date.now().toString(36),name:`Version ${n} — ${Engine.stock().name}`,settings:cloneParams(Engine.p),thumb:this.renderThumb(Engine.p,120),t:Date.now()};
    it.versions.push(v); this.renderVersions(); this.saveSoon(); this.toast('Saved “'+v.name+'” — press C to compare');
  },
  renderThumb(p,T){ if(!Engine.src) return null; const [sw,sh]=Engine.dims(p), sc=T/Math.max(sw,sh), w=Math.max(2,Math.round(sw*sc)), h=Math.max(2,Math.round(sh*sc));
    const rt=GLU.target(w,h,'rgba8'); const L={W:w,H:h,dpr:1,scale:sc,fx:0,fy:0,fw:w,fh:h,ix:0,iy:0,iw:w,ih:h,win:[0,0,1,1],b:{l:0,r:0,t:0,b:0}};
    const kb=Engine.before, kc=Engine.cropMode; Engine.before=false; Engine.cropMode=false;
    Engine.render({layout:L,target:rt,RT:this._vRT||(this._vRT={}),params:Object.assign({},p,{border:'none'}),forceAfter:true}); Engine.before=kb; Engine.cropMode=kc;
    const px=new Uint8Array(w*h*4), gl=Engine.gl; gl.bindFramebuffer(gl.FRAMEBUFFER,rt.f); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null); GLU.free(rt);
    const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'), id=x.createImageData(w,h);
    for(let y=0;y<h;y++) id.data.set(px.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4); x.putImageData(id,0,0); Engine.dirty=true; return c.toDataURL('image/jpeg',.8); },
  renderVersions(){
    const el=$('#verList'); if(!el) return; el.innerHTML=''; const it=this.cur;
    if(!it||!(it.versions||[]).length){ el.innerHTML='<div class="note">Save versions of this photo with + (⌘\'), then press C to see one beside your current edit.</div>'; return; }
    it.versions.forEach(v=>{ const d=document.createElement('div'); d.className='ver'+(this.compare&&this.compare.id===v.id?' cmp':'');
      d.innerHTML=`${v.thumb?`<img src="${v.thumb}">`:'<img>'}<div class="vn"></div><button class="vc" title="Compare side by side">⧉</button><button class="vu" title="Update with current edit">↻</button><button class="vd" title="Delete">×</button>`;
      const vn=d.querySelector('.vn'); vn.textContent=v.name; const sm=document.createElement('small'); sm.textContent=Engine.stock(v.settings.stock).name+' · '+Engine.paperFor(withDefaults(v.settings)).name; vn.appendChild(sm);
      d.onclick=async e=>{ if(e.target.tagName==='BUTTON') return; await this.applySettings(cloneParams(v.settings)); this.commit(); this.toast('Applied '+v.name+' (⌘Z to undo)'); };
      d.ondblclick=async e=>{ if(e.target.tagName==='BUTTON') return; const n=await this.ask('Rename version',v.name); if(n){ v.name=n.slice(0,80); this.renderVersions(); this.saveSoon(); } };
      d.querySelector('.vc').onclick=()=>this.setCompare(this.compare&&this.compare.id===v.id?null:v);
      d.querySelector('.vu').onclick=()=>{ v.settings=cloneParams(Engine.p); v.thumb=this.renderThumb(Engine.p,120); this.renderVersions(); this.saveSoon(); this.toast('Updated '+v.name); };
      d.querySelector('.vd').onclick=()=>{ it.versions=it.versions.filter(x=>x!==v); if(this.compare&&this.compare.id===v.id) this.setCompare(null); this.renderVersions(); this.saveSoon(); };
      el.appendChild(d); });
  },
  setCompare(v){
    if(v && Engine.cropMode) Tools.setCropMode(false);
    this.compare=v||null; document.body.classList.toggle('comparing',!!v); $('#tbCompare').classList.toggle('on',!!v);
    if(v){ $('#cmpA').innerHTML='<b></b>'; $('#cmpA b').textContent='A · '+v.name; $('#cmpB').innerHTML='<b>B · Current edit</b>'; }
    this.renderVersions(); Engine.dirty=true; },
  toggleCompare(){
    if(this.compare){ this.setCompare(null); return; }
    const vs=(this.cur&&this.cur.versions)||[]; if(!vs.length){ this.saveVersion(); }
    const v=(this.cur&&this.cur.versions||[]).slice(-1)[0]; if(v) this.setCompare(v); },
  // ---- user presets (Lightroom-style)
  userPresets:[],
  presetKeys(includeWB){ return Object.keys(DEFAULTS).filter(k=>!['crop','angle','rot','flip','aspect'].includes(k) && (includeWB || !['ev','temp','tint'].includes(k))); },
  savePreset(name,includeWB){
    name=(name||'').trim(); if(!name){ this.toast('Name the preset first'); return; }
    const settings={}; this.presetKeys(includeWB).forEach(k=>settings[k]=cloneParams(Engine.p[k]));
    const existing=this.userPresets.find(x=>x.name.toLowerCase()===name.toLowerCase());
    if(existing){ existing.settings=settings; existing.t=Date.now(); this.toast('Updated preset “'+name+'”'); }
    else { this.userPresets.push({id:'p'+Date.now().toString(36),name,settings,t:Date.now()}); this.toast('Saved preset “'+name+'”'); }
    this.renderUserPresets(); this.saveSoon();
  },
  presetParams(ps){ return Object.assign(cloneParams(Engine.p),cloneParams(ps.settings)); },
  async applyPreset(ps){ await this.applySettings(this.presetParams(ps)); this.commit(); this.hover(null); this.toast('Applied “'+ps.name+'”');
    this.activePreset={ps,amt:100}; this.renderPresetAmt(); },
  renderPresetAmt(){ const el=$('#presetAmt'); if(!el) return; el.innerHTML=''; const a=this.activePreset;
    if(!a||!this.cur){ el.style.display='none'; return; } el.style.display='';
    UI.slider(el,'presetAmt',a.ps.name.length>14?a.ps.name.slice(0,13)+'…':a.ps.name,{min:0,max:150,step:1,def:100,get:()=>a.amt,
      set:v=>{ a.amt=v; Engine.p=Tools.blendPreset(Engine.p,a.ps.settings,v/100); if(this.cur) this.cur.settings=Engine.p; Engine.curveKey=''; this.changed(); UI.refresh(); },
      commit:()=>this.commit(),fmt:x=>Math.round(x)+'%'}); },
  renderUserPresets(){
    const el=$('#userPresetList'); if(!el) return; el.innerHTML='';
    if(!this.userPresets.length){ el.innerHTML='<div class="note">No presets yet. Dial in a look, then press <b>+</b>.</div>'; return; }
    this.userPresets.forEach(ps=>{
      const d=document.createElement('div'); d.className='preset user'; d.title='Click to apply · hover to preview';
      const st=Engine.stock(ps.settings.stock);
      d.innerHTML=`<span class="pn">${ps.name.replace(/</g,'&lt;')}</span><span class="iso">${ps.settings.stock?st.name:''}</span><b class="pa up" title="Update with current settings">↻</b><b class="pa del" title="Delete preset">×</b>`;
      d.onmouseenter=()=>this.hover(this.presetParams(ps)); d.onmouseleave=()=>this.hover(null);
      d.onclick=e=>{
        if(e.target.classList.contains('del')){ if(e.target.dataset.armed){ this.userPresets=this.userPresets.filter(x=>x!==ps); this.hover(null); this.renderUserPresets(); this.saveSoon(); this.toast('Deleted “'+ps.name+'”'); }
          else { e.target.dataset.armed=1; e.target.textContent='Delete?'; setTimeout(()=>{ if(e.target.isConnected){ delete e.target.dataset.armed; e.target.textContent='×'; } },2500); } return; }
        if(e.target.classList.contains('up')){ const inc=('ev' in ps.settings); this.savePreset(ps.name,inc); return; }
        this.applyPreset(ps);
      };
      el.appendChild(d);
    });
  },

  async setStock(id){
    const p=Engine.p; p.stock=id; p.paper=null; this.lastStock=id;
    await Engine.ensureLuts(p); this.changed(); UI.refresh(); UI.markPreset(id); this.updateStockNote();
  },
  updateStockNote(){ const s=Engine.stock(), el=$('#stockNote'); if(el) el.innerHTML=`<b style="color:#ddd">${s.maker} ${s.name}</b> · ISO ${s.iso}<br>${s.desc}`; },

  // ================================================================ edits / history
  dots(){ const e=Tools.edited(Engine.p), map={pMasks:'masks',pDetail:'effects',pFilm:'film',pBasic:'light',pCurve:'light',pCrop:'crop',pHSL:'color',pGrade:'color',pGrain:'effects',pHal:'effects',pLens:'effects',pFrame:'effects'};
    const own={pMasks:['masks'],pDetail:['sharpen','sharpRadius','nr','nrColor'],pBasic:['temp','tint','ev','contrast','highlights','shadows','whites','blacks','vibrance','saturation','hlExpand'],pCurve:['curve'],pHSL:['hslH','hslS','hslL'],pGrade:['gShS','gShL','gMidS','gMidL','gHiS','gHiL'],pGrain:['grain','grainSize','grainRough'],pHal:['halation','glow'],pLens:['falloff'],pFrame:['border'],pCrop:['crop','angle','rot','flip']};
    for(const id in map){ const el=document.getElementById(id); if(!el) continue; const ks=own[id]; const on = ks ? ks.some(k=>JSON.stringify(Engine.p[k])!==JSON.stringify(DEFAULTS[k])) : e[map[id]]; el.classList.toggle('edited',!!on); } },
  changed(){ Engine.dirty=true; Engine.histDirty=true; clearTimeout(this._dt); this._dt=setTimeout(()=>this.dots(),120); if(this.cur){ this.cur.settings=Engine.p; this.thumbSoon(); this.saveSoon(); } },
  commit(){ const it=this.cur; if(!it) return; const snap=JSON.stringify(Engine.p);
    it.hist=it.hist||[]; it.fut=[]; if(it.hist[it.hist.length-1]!==snap) it.hist.push(snap); if(it.hist.length>200) it.hist.shift(); },
  undo(){ const it=this.cur; if(!it||!it.hist||it.hist.length<2) return; it.fut.push(it.hist.pop()); this.applySettings(JSON.parse(it.hist[it.hist.length-1])); this.toast('Undo'); },
  redo(){ const it=this.cur; if(!it||!it.fut||!it.fut.length) return; const s=it.fut.pop(); it.hist.push(s); this.applySettings(JSON.parse(s)); this.toast('Redo'); },
  async applySettings(s){ Engine.p=withDefaults(s); setTimeout(()=>Tools.renderMasks(),0); if(this.cur) this.cur.settings=Engine.p; await Engine.ensureLuts(Engine.p); UI.refresh(); UI.markPreset(Engine.p.stock); this.updateStockNote(); Engine.dirty=true; this.thumbSoon(); this.saveSoon(); },

  // ================================================================ library
  newItem(o){ const it=Object.assign({id:'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), settings:withDefaults({stock:this.lastStock}), thumb:null, hist:[], fut:[]},o);
    it.hist=[JSON.stringify(it.settings)]; this.items.push(it); return it; },
  async addPaths(paths){
    let first=null;
    for(const p of paths){
      const ext=p.split('.').pop().toLowerCase(), name=p.split('/').pop();
      if(['ply','splat'].includes(ext)){ await this.loadScanPath(p); continue; }
      if(['mov','mp4','m4v'].includes(ext)){ this.newScan(p); continue; }
      const it=this.newItem({name,path:p,kind:'photo'}); first=first||it;
    }
    this.renderStrip(); this.saveSoon();
    if(first){ this.setModule('develop'); await this.select(first.id); }
  },
  async addFiles(files){   // browser fallback
    let first=null;
    for(const f of files){
      const ext=f.name.split('.').pop().toLowerCase();
      if(['ply','splat'].includes(ext)){ this.busy('Reading '+f.name+'…'); const buf=await f.arrayBuffer(); this.loadScanBuffer(buf,f.name); this.busy(); continue; }
      const it=this.newItem({name:f.name,file:f,kind:'photo'}); first=first||it;
    }
    this.renderStrip();
    if(first){ this.setModule('develop'); await this.select(first.id); }
  },
  async select(id){
    Tools.maskSel=null; if(Tools.maskEdit) Tools.setMaskEdit(false); Tools.pickWB&&Tools.pickWB(false);
    this.activePreset=null; this.renderPresetAmt&&this.renderPresetAmt();
    if(Engine.cropMode) Tools.setCropMode(false);
    const it=this.items.find(x=>x.id===id); if(!it) return;
    this.cur=it; Engine.p=withDefaults(it.settings); it.settings=Engine.p;
    this.renderStrip(); UI.refresh(); UI.markPreset(Engine.p.stock); this.updateStockNote(); this.dots(); Tools.renderMasks();
    await Engine.ensureLuts(Engine.p);
    if(it.kind==='scanframe' && it.src){ Engine.setSource(it.src); }
    else {
      if(!it.src){ this.busy('Opening '+it.name+'…'); try{ it.src=await this.decode(it,this.editMax); } catch(e){ this.busy(); this.toast('Could not open '+it.name+': '+e.message); return; } this.busy(); }
      Engine.setSource(it.src);
    }
    this.setCompare(null); this.renderVersions();
    Engine.view={mode:'fit',cx:.5,cy:.5}; $('#tbZoom').textContent='1:1';
    $('#empty').classList.add('off'); this.thumbSoon(80); this.renderGrid();
  },
  // decode a photo into a linear texture. native: CoreImage float16; browser: sRGB → GPU-linearised
  async decode(it,max){
    const gl=Engine.gl;
    if(it.path && Native.available){
      const buf=await (await fetch(Native.decodeURL(it.path,max))).arrayBuffer();
      const hd=new Uint32Array(buf,0,4); if(hd[0]!==0x31465244) throw new Error(new TextDecoder().decode(new Uint8Array(buf).slice(0,200)));
      const w=hd[1],h=hd[2],isRaw=hd[3]===1;
      const half=new Uint16Array(buf,16,w*h*4);
      const tex=GLU.tex2D(w,h,'rgba16f',half);
      // auto-exposure key from a 96px sample
      const sw=96, sh=Math.max(1,Math.round(96*h/w)), lum=new Float32Array(sw*sh), H2F=CM.half2float;
      for(let y=0;y<sh;y++) for(let x=0;x<sw;x++){ const i=(Math.floor(y*h/sh)*w+Math.floor(x*w/sw))*4;
        lum[y*sw+x]=0.2126*H2F[half[i]]+0.7152*H2F[half[i+1]]+0.0722*H2F[half[i+2]]; }
      return {tex,w,h,dispRef:!isRaw,encoded:false,flipY:false,key:Engine.keyFromSamples(lum,sw,sh),raw:isRaw};
    }
    const file=it.file || (it.path ? await (await fetch(Native.fileURL(it.path))).blob() : null);
    if(!file) throw new Error('file not available');
    let bmp=await createImageBitmap(file,{colorSpaceConversion:'default',imageOrientation:'from-image'});
    let w=bmp.width,h=bmp.height;
    if(max && Math.max(w,h)>max){ const s=max/Math.max(w,h); const b2=await createImageBitmap(bmp,{resizeWidth:Math.round(w*s),resizeHeight:Math.round(h*s),resizeQuality:'high'}); bmp.close&&bmp.close(); bmp=b2; w=bmp.width; h=bmp.height; }
    const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,bmp);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
    const sw=96, sh=Math.max(1,Math.round(96*h/w)); const c=document.createElement('canvas'); c.width=sw; c.height=sh; const x=c.getContext('2d'); x.drawImage(bmp,0,0,sw,sh);
    const d=x.getImageData(0,0,sw,sh).data, lum=new Float32Array(sw*sh), lin=v=>{ v/=255; return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4); };
    for(let i=0;i<sw*sh;i++) lum[i]=0.2126*lin(d[i*4])+0.7152*lin(d[i*4+1])+0.0722*lin(d[i*4+2]);
    bmp.close&&bmp.close();
    return {tex,w,h,dispRef:true,encoded:false,flipY:false,key:Engine.keyFromSamples(lum,sw,sh)};
  },
  remove(id){ const i=this.items.findIndex(x=>x.id===id); if(i<0) return; const it=this.items[i]; if(it.src&&it.kind!=='scanframe') Engine.gl.deleteTexture(it.src.tex);
    this.items.splice(i,1); if(this.cur===it){ this.cur=null; Engine.setSource(null); const n=this.items[Math.min(i,this.items.length-1)]; if(n) this.select(n.id); else $('#empty').classList.remove('off'); }
    this.renderStrip(); this.renderGrid(); this.saveSoon(); },

  rate(n){ const list=this.selected(); list.forEach(it=>it.rating=n); this.renderStrip(); this.renderGrid(); this.saveSoon(); this.toast(n?('★'.repeat(n)+(list.length>1?` · ${list.length} photos`:'')):'Rating cleared'); },
  flag(f){ const list=this.selected(); list.forEach(it=>it.flag=f); this.renderStrip(); this.renderGrid(); this.saveSoon(); this.toast(f==='pick'?'Picked ⚑':f==='reject'?'Rejected ✕':'Flag cleared'); },
  visible(){ const f=this.filter||'all'; return this.items.filter(it=> f==='all' ? true : f==='picks' ? it.flag==='pick' : f==='rejects' ? it.flag==='reject' : f==='unrated' ? !it.rating : (it.rating||0)>=+f ); },
  badge(it){ return (it.flag==='pick'?'<i class="fl pk">⚑</i>':it.flag==='reject'?'<i class="fl rj">✕</i>':'')+(it.rating?`<i class="st">${'★'.repeat(it.rating)}</i>`:''); },
  renderStrip(){
    const el=$('#strip'); el.innerHTML='';
    if(this.module==='scan'){
      if(!this.scans.length){ el.innerHTML='<div class="stripNote">No scans yet — build one with “New scan from video / photos…”. Scans live in Documents/Splat/scans.</div>'; return; }
      this.scans.forEach(sc=>{ const t=document.createElement('div'); t.className='thumb scan'+(sc.path===this.scanPath?' on':''); t.title=sc.name;
        t.innerHTML=(sc.thumb?`<img src="${sc.thumb}">`:'<div class="scanIco">3D</div>')+`<span class="badge">${sc.name}</span>`;
        t.onclick=()=>this.loadScanPath(sc.path);
        const mb=document.createElement('button'); mb.className='tmore'; mb.textContent='⋯'; mb.title='Rename · Show in Finder · Remove';
        mb.onclick=e=>{ e.stopPropagation(); this.scanMenu(sc,mb); }; t.appendChild(mb); el.appendChild(t); });
      return; }
    this.visible().forEach(it=>{ const t=document.createElement('div'); t.className='thumb'+(it===this.cur?' on':'')+(it.flag==='reject'?' rej':''); t.title=it.name;
      if(it.sel&&it!==this.cur) t.className+=' sel';
      t.innerHTML=(it.thumb?`<img src="${it.thumb}">`:'')+`<span class="badge">${(Engine.stock(it.settings.stock).name||'').replace('Superia ','')}</span><span class="marks">${this.badge(it)}</span>`;
      t.onclick=e=>this.stripClick(it,e);
      el.appendChild(t); });
  },
  // multi-select (⌘-click toggles, ⇧-click extends) for Sync and batch export
  stripClick(it,e){
    if(e.metaKey||e.ctrlKey){ it.sel=!it.sel; if(this.cur) this.cur.sel=true; if(!it.sel&&it===this.cur){ const o=this.items.find(x=>x.sel); if(o) this.select(o.id); } this.renderStrip(); this.renderGrid(); this.updateSync(); return; }
    if(e.shiftKey&&this.cur){ const a=this.items.indexOf(this.cur), b=this.items.indexOf(it); this.items.forEach((x,i)=>x.sel=i>=Math.min(a,b)&&i<=Math.max(a,b)); this.renderStrip(); this.renderGrid(); this.updateSync(); return; }
    this.items.forEach(x=>x.sel=false); if(this.module==='library') this.setModule('develop'); this.select(it.id); this.updateSync();
  },
  selected(){ const s=this.items.filter(x=>x.sel); if(this.cur&&!s.includes(this.cur)) s.unshift(this.cur); return s.length?s:(this.cur?[this.cur]:[]); },
  updateSync(){ const n=this.selected().length; const b=$('#tbSync'); if(b){ b.textContent=n>1?`Sync to ${n-1}…`:'Sync…'; b.disabled=n<2; } },
  syncDialog(){
    const targets=this.selected().filter(x=>x!==this.cur); if(!targets.length){ this.toast('⌘-click photos in the filmstrip to choose what to sync to'); return; }
    const groups=[['film','Film & paper',['stock','paper','format','autoExp']],['wb','White balance',['temp','tint']],['exp','Exposure',['ev']],['tone','Tone',['contrast','highlights','shadows','whites','blacks','hlExpand']],
      ['pres','Presence',['vibrance','saturation']],['curve','Tone curve',['curve']],['hsl','Colour mixer',['hslH','hslS','hslL']],['grade','Colour grading',['gShH','gShS','gShL','gMidH','gMidS','gMidL','gHiH','gHiS','gHiL','gBlend','gBalance']],
      ['grain','Grain',['grain','grainSize','grainRough']],['hal','Halation & glow',['halation','glow']],['lens','Lens',['falloff']],['frame','Border',['border']],['crop','Crop & rotation',['crop','angle','rot','flip','aspect']]];
    const on={film:1,tone:1,pres:1,curve:1,hsl:1,grade:1,grain:1,hal:1,lens:1,frame:1};
    const body=$('#dlgBody'); body.innerHTML=''; $('#dlg h2').textContent='Sync settings'; $('#dlgOk').textContent='Synchronize';
    UI.note(body,`Copy settings from <b>${this.cur.name}</b> to ${targets.length} photo${targets.length>1?'s':''}:`);
    groups.forEach(([k,label])=>UI.check(body,'sy_'+k,label,()=>!!on[k],v=>on[k]=v));
    $('#dlg').classList.add('on');
    new Promise(r=>{ $('#dlgOk').onclick=()=>r(true); $('#dlgCancel').onclick=()=>r(false); }).then(go=>{
      $('#dlg').classList.remove('on'); $('#dlg h2').textContent='Export'; $('#dlgOk').textContent='Export'; if(!go) return;
      const keys=groups.filter(g=>on[g[0]]).flatMap(g=>g[2]);
      targets.forEach(t=>{ keys.forEach(k=>t.settings[k]=cloneParams(Engine.p[k])); t.hist=t.hist||[]; t.hist.push(JSON.stringify(t.settings)); t.thumbStale=true; });
      this.toast(`Synced ${keys.length} settings to ${targets.length} photo${targets.length>1?'s':''}`); this.saveSoon(); this.refreshThumbs(targets); });
  },
  async refreshThumbs(list){ const keep=this.cur; for(const t of list){ if(!t.thumbStale) continue; await this.select(t.id); this.makeThumb(); t.thumbStale=false; } if(keep) await this.select(keep.id); },
  renderGrid(){
    const g=$('#grid'); if(!g.classList.contains('on')) return; g.innerHTML='';
    this.visible().forEach(it=>{ const c=document.createElement('div'); c.className='cell'+(it===this.cur?' on':'')+(it.flag==='reject'?' rej':'');
      c.innerHTML=(it.thumb?`<img src="${it.thumb}">`:'')+`<div class="cap">${it.name} · ${Engine.stock(it.settings.stock).name}</div><span class="marks">${this.badge(it)}</span>`;
      c.className+=(it.sel&&it!==this.cur?' sel':''); c.onclick=e=>{ if(e.metaKey||e.ctrlKey||e.shiftKey) this.stripClick(it,e); else { this.items.forEach(x=>x.sel=false); this.select(it.id); } }; c.ondblclick=()=>{ this.setModule('develop'); this.select(it.id); };
      g.appendChild(c); });
  },
  thumbSoon(ms=500){ clearTimeout(this._tt); this._tt=setTimeout(()=>this.makeThumb(),ms); },
  makeThumb(){
    const it=this.cur; if(!it||!Engine.src||this.module==='scan') return;
    const [sw,sh]=Engine.dims(Engine.p), T=220, sc=T/Math.max(sw,sh), w=Math.max(2,Math.round(sw*sc)), h=Math.max(2,Math.round(sh*sc));
    const rt=GLU.target(w,h,'rgba8'); const L={W:w,H:h,dpr:1,scale:sc,fx:0,fy:0,fw:w,fh:h,ix:0,iy:0,iw:w,ih:h,win:[0,0,1,1],b:{l:0,r:0,t:0,b:0}};
    const keep=Engine.before; Engine.before=false;
    Engine.render({layout:L,target:rt,RT:this._thumbRT||(this._thumbRT={}),params:Object.assign({},Engine.p,{border:'none'}),forceAfter:true});
    Engine.before=keep;
    const px=new Uint8Array(w*h*4); Engine.gl.bindFramebuffer(Engine.gl.FRAMEBUFFER,rt.f); Engine.gl.readPixels(0,0,w,h,Engine.gl.RGBA,Engine.gl.UNSIGNED_BYTE,px);
    Engine.gl.bindFramebuffer(Engine.gl.FRAMEBUFFER,null); GLU.free(rt);
    const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); const id=x.createImageData(w,h);
    for(let y=0;y<h;y++) id.data.set(px.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);
    x.putImageData(id,0,0); it.thumb=c.toDataURL('image/jpeg',0.8);
    this.renderStrip(); this.renderGrid(); this.saveSoon();
  },
  drawNavigator(){
    const c=$('#navCanvas'), it=this.cur; const dpr=window.devicePixelRatio||1; const W=c.clientWidth*dpr, H=Math.round(W*0.66);
    c.width=W; c.height=H; c.style.height=(H/dpr)+'px'; const x=c.getContext('2d'); x.fillStyle='#1a1a1a'; x.fillRect(0,0,W,H);
    if(!it||!it.thumb) return; const img=new Image(); img.onload=()=>{ const s=Math.min(W/img.width,H/img.height); const w=img.width*s,h=img.height*s;
      x.drawImage(img,(W-w)/2,(H-h)/2,w,h);
      if(Engine.view.mode!=='fit' && this._lastL){ const L=this._lastL; const [u0,v0,u1,v1]=L.win; x.strokeStyle='#fff'; x.lineWidth=1.5*dpr; x.strokeRect((W-w)/2+u0*w,(H-h)/2+v0*h,(u1-u0)*w,(v1-v0)*h); } };
    img.src=it.thumb;
  },

  // ================================================================ 3D scan module
  async openScan(){
    if(Native.available){ const p=await Native.call('open',{exts:['ply','splat'],multiple:false,dir:(this.info&&this.info.splatDir+'/scans')}); if(p&&p[0]) await this.loadScanPath(p[0]); }
    else { const i=$('#fileIn'); i.accept='.ply,.splat'; i.click(); }
  },
  async loadScanPath(path){
    this.busy('Reading scan…'); try{ const buf=await (await fetch(Native.fileURL(path))).arrayBuffer(); this.loadScanBuffer(buf,path.split('/').pop(),path); } catch(e){ this.toast('Could not read scan: '+e.message); } this.busy();
  },
  loadScanBuffer(buf,name,path){
    try{ const s=/\.splat$/i.test(name)?parseSplat(buf):parsePLY(buf); Splat.cam.up='Y-down'; Splat.load(s); this.scanName=name; this.scanPath=path||null;
      if(path && !this.scans.find(x=>x.path===path)) this.scans.unshift({name:name.replace(/\.(ply|splat)$/i,''),path,thumb:null}); }
    catch(e){ this.toast(e.message); return; }
    this.scanKey=null; this.setModule('scan'); UI.refresh(); this.saveSoon();
  },
  // ---- scan library (separate from the photo library): Documents/Splat/scans/<name>/<name>.ply
  async refreshScans(){
    if(Native.available && this.info){ const root=this.info.splatDir+'/scans';
      try{ const dirs=await Native.call('listDir',{path:root});
        for(const d of dirs){ if(d.startsWith('.')) continue; const files=await Native.call('listDir',{path:root+'/'+d}); 
          const plys=files.filter(f=>/\.(ply|splat)$/i.test(f)); if(!plys.length) continue;
          const pick=plys.find(f=>f.replace(/\.\w+$/,'')===d) || plys.sort().reverse()[0];
          const path=root+'/'+d+'/'+pick; if((this.hiddenScans||[]).includes(path)) continue; if(!this.scans.find(x=>x.path===path)) this.scans.push({name:d,path,thumb:null}); }
      }catch(e){} }
    this.renderStrip();
  },
  scanMenu(sc,anchor){
    const m=$('#ctxMenu'); m.innerHTML=''; const r=anchor.getBoundingClientRect();
    const item=(label,fn)=>{ const b=document.createElement('button'); b.textContent=label; b.onclick=()=>{ m.classList.remove('on'); fn(); }; m.appendChild(b); };
    item('Rename…',async()=>{ const n=await this.ask('Rename scan',sc.name); if(n){ sc.name=n.slice(0,60); this.renderStrip(); this.saveSoon(); } });
    item('Show in Finder',()=>Native.call('reveal',{path:sc.path}).catch(()=>{}));
    item('Rebuild thumbnail',()=>{ sc.thumb=null; if(this.scanPath===sc.path){ Engine.dirty=true; } else this.loadScanPath(sc.path); });
    item('Remove from library',()=>{ this.scans=this.scans.filter(x=>x!==sc); (this.hiddenScans=this.hiddenScans||[]).push(sc.path); this.renderStrip(); this.saveSoon(); this.toast('Removed from the strip — the files stay in Documents/Splat/scans'); });
    m.style.left=Math.min(innerWidth-190,r.left)+'px'; m.style.top=(r.top-4-m.childElementCount*30)+'px'; m.classList.add('on');
    setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m.contains(e.target)){ m.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0);
  },
  scanThumb(){ const sc=this.scans.find(x=>x.path===this.scanPath); if(!sc||sc.thumb||!Splat.sortedCount) return;
    if((this._thumbWait=(this._thumbWait||0)+1)<20) return; this._thumbWait=0;
    const L=this._lastL, v=$('#view'); const c=document.createElement('canvas'); const s=160/Math.max(L.iw,L.ih); c.width=Math.round(L.iw*s); c.height=Math.round(L.ih*s);
    c.getContext('2d').drawImage(v,L.ix,L.H-L.iy-L.ih,L.iw,L.ih,0,0,c.width,c.height); sc.thumb=c.toDataURL('image/jpeg',.8); this.renderStrip(); this.saveSoon(); },
  loadDemo(){ this.busy('Building demo scene…'); setTimeout(()=>{ Splat.load(demoScene()); this.scanName='Demo still life'; this.scanPath=null; this.scanKey=null; this.busy(); this.setModule('scan'); UI.refresh(); },30); },
  async newScan(input){
    if(!Native.available){ this.toast('Building scans runs in the Mac app'); return; }
    if(!input){ const p=await Native.call('open',{files:true,dirs:true,multiple:false,title:'Choose an orbit video, or a folder of photos',dir:this.info&&this.info.splatDir+'/captures'}); if(!p||!p[0]) return; input=p[0]; }
    $('#pipe').classList.add('on'); $('#pipeLog').textContent=''; $('#pipeTitle').textContent='Building scan from '+input.split('/').pop()+'…'; $('#pipeClose').disabled=true;
    this.pipeStart();
    const job=Native.call('runPipeline',{input});
    this._pipeJob=null;
    try{ const r=await job; $('#pipeClose').disabled=false;
      clearInterval(this._pt); if(r&&r.ply){ this.pipeDone(true); $('#pipeTitle').textContent='Scan ready'; await this.loadScanPath(r.ply); $('#pipe').classList.remove('on'); this.toast('Scan loaded — orbit, focus, then Expose'); }
      else { this.pipeDone(false); $('#pipeTitle').textContent='Scan failed (exit '+(r?r.code:'?')+') — see Details'; $('#pipeDetails').open=true; } }
    catch(e){ $('#pipeTitle').textContent='Error: '+e.message; $('#pipeClose').disabled=false; }
  },
  // ---- scan build progress: splat.sh emits "@@progress <stage> <done> <total> <label>"
  PIPE_STAGES:[['Frames','Pull frames'],['Features','Find features'],['Matching','Match frames'],['Cameras','Solve cameras'],['Undistort','Undistort'],['Training','Train splats']],
  PIPE_W:[0,.03,.12,.15,.2,.02,.48],
  pipeStart(){
    this.pp={stage:0,done:0,total:1,label:'Starting…',t0:Date.now(),ts:Date.now(),buf:'',eta:null,counts:{}};
    $('#pipeStages').innerHTML=this.PIPE_STAGES.map((s,i)=>`<div class="pst" id="pst${i+1}"><b>${i+1}. ${s[0]}</b><span>waiting</span></div>`).join('');
    $('#pipeFill').style.width='0%'; $('#pipeNow').textContent='Starting…'; $('#pipeEta').textContent='';
    clearInterval(this._pt); this._pt=setInterval(()=>this.pipeRender(),1000);
  },
  pipeText(t){
    const P=this.pp||(this.pipeStart(),this.pp); P.buf+=t.replace(/\x1b\[[0-9;]*m/g,'');
    const lines=P.buf.split('\n'); P.buf=lines.pop(); let out='';
    for(const l of lines){ const m=l.match(/^@@progress (\d) (\d+) (\d+) (.*)$/);
      if(m){ const st=+m[1]; if(st!==P.stage){ P.stage=st; P.ts=Date.now(); } P.done=+m[2]; P.total=Math.max(1,+m[3]); P.label=m[4]; P.counts[st]=[P.done,P.total]; }
      else out+=l+'\n'; }
    if(out){ const el=$('#pipeLog'); el.textContent+=out; if(el.textContent.length>200000) el.textContent=el.textContent.slice(-150000); el.scrollTop=el.scrollHeight; }
    this.pipeRender();
  },
  pipeRender(){
    const P=this.pp; if(!P) return; const W=this.PIPE_W, now=Date.now(), el=(now-P.t0)/1000;
    let frac=Math.min(1,P.done/P.total);
    // Brush may not print step counts: fall back to time for training (~25 min typical on Apple Silicon)
    if(P.stage===6 && P.done===0) frac=Math.min(0.95,(now-P.ts)/1000/1500);
    let f=0; for(let i=1;i<P.stage;i++) f+=W[i]; if(P.stage) f+=W[P.stage]*frac;
    $('#pipeFill').style.width=(f*100).toFixed(1)+'%';
    for(let i=1;i<=6;i++){ const c=$('#pst'+i); if(!c) continue; c.className='pst'+(i<P.stage?' ok':i===P.stage?' on':'');
      const k=P.counts[i]; c.querySelector('span').textContent = i<P.stage ? 'done' : i===P.stage ? (k&&k[1]>1? `${k[0]} / ${k[1]}` : 'working…') : 'waiting'; }
    const mm=s=>{ s=Math.max(0,Math.round(s)); const m=Math.floor(s/60); return m>=60? Math.floor(m/60)+'h '+(m%60)+'m' : m+':'+String(s%60).padStart(2,'0'); };
    $('#pipeNow').textContent = P.stage ? `Step ${P.stage} of 6 · ${P.label}${P.total>1&&P.done?` · ${P.done}/${P.total}`:''} · ${Math.round(f*100)}%` : 'Starting…';
    // training dominates the time: measure Brush's own step rate instead of extrapolating the bar
    if(P.stage===6){
      if(P.done>0 && !P.s6) P.s6={t:now,d:P.done};
      if(P.s6 && P.done-P.s6.d>=50){ const rate=(P.done-P.s6.d)/((now-P.s6.t)/1000); const e=(P.total-P.done)/rate; P.eta = P.eta==null||P.etaStage!==6 ? e : P.eta*0.85+e*0.15; P.etaStage=6; }
      else { P.eta=null; }
      if(P.done===0){ const t=(now-P.ts)/1000;
        if(t<240) $('#pipeNow').textContent='Step 6 of 6 · Preparing GPU — the first run can take a few minutes';
        else { $('#pipeNow').textContent='Step 6 of 6 · Training splats (Brush isn’t reporting steps — timing estimate)'; P.eta=Math.max(60,1500-t); } }
    } else if(f>0.04){ const e=el*(1-f)/f; P.eta = P.eta==null ? e : P.eta*0.8+e*0.2; }
    $('#pipeEta').textContent = `${mm(el)} elapsed` + (P.eta!=null ? ` · about ${P.eta<90?'1 min':P.eta<3600?Math.round(P.eta/60)+' min':mm(P.eta)} left` : P.stage===6?' · measuring training speed…':' · estimating…');
  },
  pipeDone(ok){ clearInterval(this._pt); if(ok&&this.pp){ this.pp.stage=7; $('#pipeFill').style.width='100%'; document.querySelectorAll('.pst').forEach(c=>{ c.className='pst ok'; c.querySelector('span').textContent='done'; }); $('#pipeEta').textContent=''; } },
  scanLayoutSize(){ // image size for the scan view = fit of sensor aspect into the viewer
    const [sw,sh]=Splat.sensor(); const c=$('#view'), dpr=window.devicePixelRatio||1, W=c.clientWidth*dpr, H=c.clientHeight*dpr;
    const b=Borders.margins(Engine.p.border,sw,sh), pad=28*dpr; const fw0=sw*(1+b.l+b.r), fh0=sh*(1+b.t+b.b);
    const s=Math.min((W-2*pad)/fw0,(H-2*pad)/fh0); return [Math.max(16,Math.round(sw*s)),Math.max(16,Math.round(sh*s))];
  },
  renderScanSource(w,h){
    this.scanRT=GLU.ensure(this.scanRT,w,h,'rgba16f'); Splat.render(this.scanRT);
    if(!this.scanKey && Splat.sortedCount){ // meter once
      const kw=64,kh=Math.max(8,Math.round(64*h/w)); const rt=GLU.target(kw,kh,'rgba8'); Splat.render(rt);
      const px=new Uint8Array(kw*kh*4); const gl=Engine.gl; gl.bindFramebuffer(gl.FRAMEBUFFER,rt.f); gl.readPixels(0,0,kw,kh,gl.RGBA,gl.UNSIGNED_BYTE,px); GLU.free(rt);
      const lum=new Float32Array(kw*kh), lin=v=>{ v/=255; return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4); };
      for(let i=0;i<kw*kh;i++) lum[i]=0.2126*lin(px[i*4])+0.7152*lin(px[i*4+1])+0.0722*lin(px[i*4+2]);
      this.scanKey=Engine.keyFromSamples(lum,kw,kh);
    }
    return {tex:this.scanRT.t,w,h,dispRef:true,encoded:true,flipY:true,key:this.scanKey||0.1,scan:true};
  },
  async exposeFrame(){
    if(!Splat.scene){ this.toast('Load a scan first'); return; }
    const [sw,sh]=Splat.sensor(); const long=3600, w=Math.round(sw>=sh?long:long*sw/sh), h=Math.round(sw>=sh?long*sh/sw:long);
    const rt=GLU.target(w,h,'rgba16f'); Splat.render(rt);
    const src={tex:rt.t,w,h,dispRef:true,encoded:true,flipY:true,key:this.scanKey||0.1};
    const n=this.items.filter(i=>i.kind==='scanframe').length+1;
    const it=this.newItem({name:(this.scanName||'Scan').replace(/\.(ply|splat)$/,'')+' — frame '+n,kind:'scanframe',src,settings:Object.assign(cloneParams(Engine.p),{crop:{x:0,y:0,w:1,h:1},angle:0,rot:0,flip:false,aspect:'free'})});
    it.hist=[JSON.stringify(it.settings)];
    // keep a copy on disk so the frame survives a restart
    if(Native.available && this.info){
      const rt8=GLU.target(w,h,'rgba8'); Splat.render(rt8); const gl=Engine.gl; const px=new Uint8Array(w*h*4);
      gl.bindFramebuffer(gl.FRAMEBUFFER,rt8.f); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); GLU.free(rt8);
      const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); const id=x.createImageData(w,h);
      for(let y=0;y<h;y++) id.data.set(px.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4); x.putImageData(id,0,0);
      const b64=(await this.blobB64(await new Promise(r=>c.toBlob(r,'image/png'))));
      const path=this.info.splatDir+'/frames/'+it.name.replace(/[^\w\- ]+/g,'_')+'_'+Date.now()+'.png';
      try{ await Native.call('writeFile',{path,base64:b64}); it.path=path; }catch(e){}
    }
    this.renderStrip(); this.saveSoon();
    this.flash(); this.toast('Frame exposed → filmstrip. Click it to develop.');
  },
  flash(){ const v=$('#viewer'); v.animate([{background:'#fff'},{background:'#121212'}],{duration:250}); },

  // ================================================================ orbit video (scan module)
  async sortSync(){ while(Splat.sortBusy) await new Promise(r=>setTimeout(r,4));
    await new Promise(r=>{ const prev=Splat.onDirty; Splat.onDirty=()=>{ Splat.onDirty=prev; r(); }; Splat.requestSort(); }); },
  async orbitDialog(){
    if(!Splat.scene){ this.toast('Load a scan first'); return; }
    if(!Native.available){ this.toast('Video export runs in the Mac app'); return; }
    try{ await Native.call('videoEnd',{job:'probe'}); }catch(e){ if(/unknown command/.test(String(e.message||e))){ this.toast('Rebuild the app once to enable video export (see chat)'); return; } }
    const st=Object.assign({secs:6,arc:40,move:'swing',size:1920,fps:30,grain:true},this._orbitPrefs||{});
    const body=$('#dlgBody'); body.innerHTML=''; $('#dlg h2').textContent='Orbit video'; $('#dlgOk').textContent='Render';
    UI.seg(body,'omove','Move',[['swing','Swing'],['orbit','Full orbit'],['push','Push in']],()=>st.move,v=>st.move=v);
    UI.slider(body,'oarc','Swing arc',{min:5,max:120,step:1,def:40,get:()=>st.arc,set:v=>st.arc=v,fmt:x=>Math.round(x)+'°'});
    UI.slider(body,'osecs','Length',{min:2,max:20,step:1,def:6,get:()=>st.secs,set:v=>st.secs=v,fmt:x=>Math.round(x)+' s'});
    UI.seg(body,'osize','Size',[['1080','1080p'],['1920','1920'],['3840','4K']],()=>String(st.size),v=>st.size=+v);
    UI.seg(body,'ofps','Frame rate',[['24','24'],['30','30'],['60','60']],()=>String(st.fps),v=>st.fps=+v);
    UI.check(body,'ograin','Moving grain (new grain every frame, like real film)',()=>st.grain,v=>st.grain=v);
    UI.note(body,'Uses the current camera, lens, focus and film look. Saved as HEVC .mov in Display P3.');
    $('#dlg').classList.add('on');
    const go=await new Promise(r=>{ $('#dlgOk').onclick=()=>r(true); $('#dlgCancel').onclick=()=>r(false); });
    $('#dlg').classList.remove('on'); $('#dlg h2').textContent='Export'; $('#dlgOk').textContent='Export'; if(!go) return;
    this._orbitPrefs=Object.assign({},st);
    try{ await this.renderOrbit(st); }catch(e){ console.error(e); this.busy(); this.toast('Video failed: '+e.message); }
  },
  async renderOrbit(st){
    const name=(this.scanName||'scan').replace(/\.(ply|splat)$/i,'')+' — orbit — '+Engine.stock().name+'.mov';
    const path=await Native.call('pickSave',{name,dir:this.info&&this.info.splatDir+'/exports'}); if(!path) return;
    const [sw,sh]=Splat.sensor(); const long=st.size; let w=Math.round(sw>=sh?long:long*sw/sh), h=Math.round(sw>=sh?long*sh/sw:long); w-=w%2; h-=h%2;
    const job=await Native.call('videoBegin',{path,w,h,fps:st.fps});
    const c=Splat.cam, keep={yaw:c.yaw,pitch:c.pitch,dist:c.dist,target:c.target.slice()}, keepSeed=Engine.grainSeed;
    const frames=Math.round(st.secs*st.fps), gl=Engine.gl;
    const tmp=GLU.target(w,h,'rgba16f'), out=GLU.target(w,h,'rgba8'), RT={};
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h; let x=null; try{ x=cv.getContext('2d',{colorSpace:'display-p3'}); }catch(e){} if(!x) x=cv.getContext('2d');
    const p3=!!(x.getContextAttributes&&x.getContextAttributes().colorSpace==='display-p3');
    const id=p3?x.createImageData(w,h,{colorSpace:'display-p3'}):x.createImageData(w,h), px=new Uint8Array(w*h*4);
    const EP=Object.assign(cloneParams(Engine.p),{crop:{x:0,y:0,w:1,h:1},angle:0,rot:0,flip:false,border:'none'});
    const L={W:w,H:h,dpr:1,scale:1,fx:0,fy:0,fw:w,fh:h,ix:0,iy:0,iw:w,ih:h,win:[0,0,1,1],b:{l:0,r:0,t:0,b:0}};
    this._cancelVideo=false; const t0=performance.now();
    try{
      for(let f=0;f<frames;f++){
        if(this._cancelVideo) throw new Error('cancelled');
        const t=f/frames;
        if(st.move==='swing') c.yaw=keep.yaw+Math.sin(t*2*Math.PI)*st.arc/2*Math.PI/180;
        else if(st.move==='orbit') c.yaw=keep.yaw+t*2*Math.PI;
        else { const e=.5-.5*Math.cos(t*Math.PI); c.dist=keep.dist*(1-.35*e); c.yaw=keep.yaw+(e-.5)*st.arc/3*Math.PI/180; }
        await this.sortSync(); Splat.render(tmp);
        if(st.grain) Engine.grainSeed=(keepSeed+f*2654435761)>>>0;
        const src={tex:tmp.t,w,h,dispRef:true,encoded:true,flipY:true,key:this.scanKey||0.1};
        const ks=Engine.src, kb=Engine.before, kc=Engine.cropMode; Engine.src=src; Engine.before=false; Engine.cropMode=false;
        Engine.render({layout:L,target:out,RT,params:EP,forceAfter:true,p3});
        Engine.src=ks; Engine.before=kb; Engine.cropMode=kc;
        gl.bindFramebuffer(gl.FRAMEBUFFER,out.f); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        for(let y=0;y<h;y++) id.data.set(px.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4); x.putImageData(id,0,0);
        const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.92));
        await Native.call('videoFrame',{job,base64:await this.blobB64(blob)});
        const el=(performance.now()-t0)/1000, eta=el/(f+1)*(frames-f-1);
        this.busy(`Rendering orbit video — frame ${f+1} / ${frames} · ${Math.ceil(eta)} s left  (Esc to cancel)`);
      }
      const done=await Native.call('videoEnd',{job}); this.busy(); this.toast(done?'Saved '+done.split('/').pop():'Video writer failed');
      if(done) Native.call('reveal',{path:done}).catch(()=>{});
    } catch(e){ await Native.call('videoEnd',{job}).catch(()=>{}); throw e; }
    finally{ Object.assign(c,keep); Engine.grainSeed=keepSeed; GLU.free(tmp); GLU.free(out); for(const k in RT) GLU.free(RT[k]); Splat.lastSortView=null; Engine.dirty=true; }
  },
  // ================================================================ export
  async exportDialog(){
    if(!this.cur && this.module!=='scan'){ this.toast('Nothing to export'); return; }
    const sel=this.module==='scan'?[]:this.selected();
    const body=$('#dlgBody'); body.innerHTML='';
    const st=Object.assign({size:'full',fmt:Native.available?'tiff':'jpeg',q:0.95,space:'p3',meta:true,which:sel.length>1?'sel':'cur'},this._exportPrefs||{});
    if(!Native.available && st.fmt==='tiff') st.fmt='jpeg';
    if(sel.length>1) UI.seg(body,'xwhich','Photos',[['cur','This photo'],['sel',sel.length+' selected']],()=>st.which,v=>st.which=v);
    UI.seg(body,'xsize','Size',[['full','Full'],['4096','4096'],['2048','2048']],()=>st.size,v=>st.size=v);
    UI.seg(body,'xfmt','Format',Native.available?[['tiff','TIFF 16-bit'],['jpeg','JPEG'],['heic','HEIC'],['png','PNG']]:[['jpeg','JPEG'],['png','PNG']],()=>st.fmt,v=>st.fmt=v);
    UI.seg(body,'xspace','Colour',[['p3','Display P3'],['srgb','sRGB']],()=>st.space,v=>st.space=v);
    UI.slider(body,'xq','Quality',{min:60,max:100,step:1,def:95,get:()=>Math.round(st.q*100),set:v=>st.q=v/100,fmt:x=>Math.round(x)});
    if(Native.available) UI.check(body,'xmeta','Keep camera metadata (EXIF, GPS)',()=>st.meta,v=>st.meta=v);
    UI.note(body,'Border: '+(Borders.styles.find(b=>b[0]===Engine.p.border)||['', 'None'])[1]+' · Film: '+Engine.stock().name+' on '+Engine.paperFor(Engine.p).name+'<br>Display P3 keeps the film colours that fall outside sRGB (most phones and Macs show it). Choose sRGB for the web or older screens.');
    $('#dlg').classList.add('on');
    const go=await new Promise(r=>{ $('#dlgOk').onclick=()=>r(true); $('#dlgCancel').onclick=()=>r(false); });
    $('#dlg').classList.remove('on'); if(!go) return;
    this._exportPrefs=Object.assign({},st);
    try{
      if(st.which==='sel' && sel.length>1) await this.batchExport(sel,st);
      else await this.doExport(st);
    }catch(e){ console.error(e); this.busy(); this.toast('Export failed: '+e.message); }
  },
  EXT:{tiff:'.tif',jpeg:'.jpg',heic:'.heic',png:'.png'},
  exportName(st,it){ const base=(this.module==='scan'?(this.scanName||'scan'):(it?it.name:'image')).replace(/\.[^.]+$/,'');
    return base+' — '+Engine.stock().name+this.EXT[st.fmt]; },
  async batchExport(items,st){
    let dir=null;
    if(Native.available){ dir=await Native.call('pickFolder',{dir:this.info&&this.info.splatDir+'/exports'}); if(!dir) return; }
    const keep=this.cur; let n=0;
    for(const it of items){ n++; this.busy(`Exporting ${n} / ${items.length} — ${it.name}`); await this.select(it.id);
      await this.doExport(st, dir ? dir+'/'+this.exportName(st,it) : null, true); }
    if(keep) await this.select(keep.id);
    this.busy(); this.toast(`Exported ${items.length} photos`+(dir?' to '+dir.split('/').pop():''));
  },
  // render the current photo (or scan view) at export size into a float target
  async renderExport(st){
    const gl=Engine.gl; let src=Engine.src, tmp=null;
    if(this.module==='scan'){ const [sw,sh]=Splat.sensor(); const long=st.size==='full'?6000:+st.size; const w=Math.round(sw>=sh?long:long*sw/sh), h=Math.round(sw>=sh?long*sh/sw:long);
      tmp=GLU.target(w,h,'rgba16f'); Splat.render(tmp); src={tex:tmp.t,w,h,dispRef:true,encoded:true,flipY:true,key:this.scanKey||0.1}; }
    else if(this.cur && this.cur.path && Native.available && this.cur.kind==='photo'){ const max=st.size==='full'?Math.min(16384,gl.getParameter(gl.MAX_TEXTURE_SIZE)):Math.ceil(+st.size/Math.max(Engine.p.crop.w,Engine.p.crop.h,.05));
      const s2=await this.decode(this.cur,max); s2.key=Engine.src.key; src=s2; tmp={t:s2.tex}; }
    const EP = this.module==='scan' ? Object.assign(cloneParams(Engine.p),{crop:{x:0,y:0,w:1,h:1},angle:0,rot:0,flip:false}) : Engine.p;
    const [dw,dh]=Engine.dims(EP,src); let w=Math.round(dw), h=Math.round(dh);
    if(st.size!=='full'){ const s=Math.min(1,(+st.size)/Math.max(w,h)); w=Math.round(w*s); h=Math.round(h*s); }
    const b=Borders.margins(EP.border,w,h); const fw=Math.round(w*(1+b.l+b.r)), fh=Math.round(h*(1+b.t+b.b));
    const maxRB=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE); if(fw>maxRB||fh>maxRB) throw new Error('image too large for this GPU ('+fw+'×'+fh+')');
    const L={W:fw,H:fh,dpr:1,scale:w/dw,fx:0,fy:0,fw,fh,ix:Math.round(b.l*w),iy:Math.round(b.b*h),iw:w,ih:h,win:[0,0,1,1],b};
    const keepSrc=Engine.src; Engine.src=src;
    const borderTex = EP.border!=='none' ? Borders.texture(EP.border,fw,fh,b,Engine.stock(),this.edgeP(EP)) : null;
    const out=GLU.target(fw,fh,GLU.floatRT?'rgba32f':'rgba8'); const RT={};
    const keep=Engine.before, keepCrop=Engine.cropMode; Engine.before=false; Engine.cropMode=false;
    Engine.render({layout:L,target:out,RT,borderTex,forceAfter:true,params:EP,p3:st.space==='p3'});
    Engine.before=keep; Engine.cropMode=keepCrop; Engine.src=keepSrc;
    for(const k in RT) GLU.free(RT[k]); if(tmp) (tmp.f?GLU.free(tmp):gl.deleteTexture(tmp.t));
    return {out,fw,fh};
  },
  // read rows [y0,y0+n) counted from the TOP as RGBA float
  readRows(out,fw,fh,y0,n){ const gl=Engine.gl; gl.bindFramebuffer(gl.FRAMEBUFFER,out.f); let f;
    if(out.fmt==='rgba32f'){ f=new Float32Array(fw*n*4); gl.readPixels(0,fh-y0-n,fw,n,gl.RGBA,gl.FLOAT,f); }
    else { const u=new Uint8Array(fw*n*4); gl.readPixels(0,fh-y0-n,fw,n,gl.RGBA,gl.UNSIGNED_BYTE,u); f=new Float32Array(u.length); for(let i=0;i<u.length;i++) f[i]=u[i]/255; }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); return f; },
  async doExport(st,path,quiet){
    this.busy('Rendering full resolution…'); await new Promise(r=>setTimeout(r,30));
    const name=this.exportName(st,this.cur);
    let legacy=false;
    if(Native.available && !path){ try{ path=await Native.call('pickSave',{name,dir:this.info&&this.info.splatDir+'/exports'}); }catch(e){ legacy=true; }
      if(!path && !legacy){ this.busy(); return; } }
    if(legacy){ // app shell not rebuilt yet: 8-bit JPEG/PNG through the old save panel
      st=Object.assign({},st,{fmt:st.fmt==='png'?'png':'jpeg'}); const {out,fw,fh}=await this.renderExport(Object.assign({},st,{space:'srgb'}));
      try{ const c=document.createElement('canvas'); c.width=fw; c.height=fh; const x=c.getContext('2d'); const id=x.createImageData(fw,fh);
        const rows=Math.max(1,Math.floor(4e6/(fw*4))); for(let y=0;y<fh;y+=rows){ const n=Math.min(rows,fh-y); const f=this.readRows(out,fw,fh,y,n);
          for(let r=0;r<n;r++){ const so=(n-1-r)*fw*4, d=(y+r)*fw*4; for(let i=0;i<fw*4;i++) id.data[d+i]=(i&3)===3?255:Math.round(Math.min(1,Math.max(0,f[so+i]))*255); } }
        x.putImageData(id,0,0); const blob=await new Promise(r=>c.toBlob(r,st.fmt==='png'?'image/png':'image/jpeg',st.q));
        this.busy(); const p2=await Native.call('save',{name:this.exportName(st,this.cur),base64:await this.blobB64(blob),dir:this.info&&this.info.splatDir+'/exports'}); if(p2) this.toast('Saved '+p2.split('/').pop()+' — rebuild the app for 16-bit TIFF / P3');
      } finally { GLU.free(out); } return; }
    const {out,fw,fh}=await this.renderExport(st);
    try{
      if(Native.available){
        const bits = st.fmt==='tiff' || st.fmt==='png' ? 16 : 8;   // JPEG/HEIC are 8-bit containers here
        const job='x'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
        const rows=Math.max(1,Math.floor(4e6/(fw*4))); let sent=0;
        for(let y=0;y<fh;y+=rows){ const n=Math.min(rows,fh-y); const f=this.readRows(out,fw,fh,y,n);
          // GL rows are bottom-up within the strip: flip to top-down
          const B = bits===16 ? new Uint16Array(fw*n*4) : new Uint8Array(fw*n*4), M = bits===16?65535:255;
          for(let r=0;r<n;r++){ const so=(n-1-r)*fw*4, d=r*fw*4; for(let i=0;i<fw*4;i++){ let v=f[so+i]; if((i&3)===3) v=1; B[d+i]=Math.round(Math.min(1,Math.max(0,v))*M); } }
          await Native.call('chunk',{job,base64:await this.blobB64(new Blob([B.buffer]))});
          sent+=n; this.busy(`Writing ${st.fmt.toUpperCase()} … ${Math.round(sent/fh*100)}%`); }
        const src = st.meta && this.module!=='scan' && this.cur && this.cur.path ? this.cur.path : '';
        await Native.call('writeImage',{job,path,w:fw,h:fh,bits,fmt:st.fmt,quality:st.q,space:st.space,source:src,artist:'Daniel S. Workman'});
        if(!quiet){ this.busy(); this.toast('Saved '+path.split('/').pop()); }
      } else {
        const c=document.createElement('canvas'); c.width=fw; c.height=fh;
        const p3=st.space==='p3'; let x; try{ x=c.getContext('2d',p3?{colorSpace:'display-p3'}:{}); }catch(e){ x=c.getContext('2d'); }
        const id=p3&&x.getContextAttributes&&x.getContextAttributes().colorSpace==='display-p3' ? x.createImageData(fw,fh,{colorSpace:'display-p3'}) : x.createImageData(fw,fh);
        const rows=Math.max(1,Math.floor(4e6/(fw*4)));
        for(let y=0;y<fh;y+=rows){ const n=Math.min(rows,fh-y); const f=this.readRows(out,fw,fh,y,n);
          for(let r=0;r<n;r++){ const so=(n-1-r)*fw*4, d=(y+r)*fw*4; for(let i=0;i<fw*4;i++) id.data[d+i]=(i&3)===3?255:Math.round(Math.min(1,Math.max(0,f[so+i]))*255); } }
        x.putImageData(id,0,0);
        const blob=await new Promise(r=>c.toBlob(r,st.fmt==='png'?'image/png':'image/jpeg',st.q));
        this.busy(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); this.toast('Exported '+fw+'×'+fh);
      }
    } finally { GLU.free(out); }
  },
  blobB64(blob){ return new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result.split(',')[1]); fr.readAsDataURL(blob); }); },

  // ================================================================ persistence
  saveSoon(){ clearTimeout(this._st); this._st=setTimeout(()=>this.save(),800); },
  save(){
    const pj=JSON.stringify(this.userPresets); if(pj!==this._lastPJ){ this._lastPJ=pj; if(this._presetsLoaded) this.syncPresetsOut(); this._presetsLoaded=true; }
    const data={v:1,presets:this.userPresets,lastStock:this.lastStock,scanPath:this.scanPath||null,scans:this.scans.filter(x=>x.path),hiddenScans:this.hiddenScans||[],items:this.items.filter(i=>i.path).map(i=>({id:i.id,name:i.name,path:i.path,kind:i.kind==='scanframe'?'photo':i.kind,settings:i.settings,thumb:i.thumb,versions:i.versions||[],rating:i.rating||0,flag:i.flag||null}))};
    const json=JSON.stringify(data);
    if(Native.available) Native.call('saveState',{json}).catch(()=>{}); else { try{ localStorage.setItem('darkroom.lib',json); }catch(e){} }
  },
  async restore(){
    let json='';
    if(Native.available){ try{ this.info=await Native.call('info'); json=await Native.call('loadState'); }catch(e){} }
    else { try{ json=localStorage.getItem('darkroom.lib')||''; }catch(e){} }
    if(!json) return; try{ const d=JSON.parse(json); this.lastStock=d.lastStock||this.lastStock; this.userPresets=d.presets||[]; this.scans=(d.scans||[]).filter(x=>x&&x.path); this.hiddenScans=d.hiddenScans||[];
      (d.items||[]).forEach(o=>{ const it=this.newItem(o); it.settings=withDefaults(o.settings); it.hist=[JSON.stringify(it.settings)]; });
      this.renderStrip(); }catch(e){ console.warn(e); }
  },

  // ================================================================ module / view
  setModule(m){
    if(Engine.cropMode && m!=='develop') Tools.setCropMode(false);
    if(m!=='develop' && this.compare) this.setCompare(null);
    this.module=m; document.body.classList.toggle('m-scan',m==='scan'); this.renderStrip();
    $('#scanEmpty').classList.toggle('on',m==='scan'&&!Splat.scene);
    document.querySelectorAll('#modules button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
    $('#grid').classList.toggle('on',m==='library'); if(m==='library') this.renderGrid();
    const v=$('#view'); v.className = m==='scan' ? 'cross' : 'grab';
    if(m==='scan'){ $('#empty').classList.add('off'); this.refreshScans(); }
    else if(this.module!=='scan') $('#scanEmpty').classList.remove('on');
    else if(m==='develop'){ if(this.cur && this.cur.src) Engine.setSource(this.cur.src); else if(this.cur) this.select(this.cur.id); else { Engine.setSource(null); $('#empty').classList.remove('off'); } }
    Engine.dirty=true;
  },
  toggleZoom(at){
    if(this.module==='scan' || !Engine.src) return;
    if(Engine.view.mode==='fit'){ const L=this._lastL; let cx=.5,cy=.5;
      if(at&&L){ const r=$('#view').getBoundingClientRect(), dpr=L.dpr; const px=(at.x-r.left)*dpr, py=L.H-(at.y-r.top)*dpr; cx=(px-L.fx)/L.fw; cy=1-(py-L.fy)/L.fh; }
      Engine.view={mode:'zoom',zoom:1/(window.devicePixelRatio||1)*(window.devicePixelRatio||1),cx:Math.min(1,Math.max(0,cx)),cy:Math.min(1,Math.max(0,cy))}; $('#tbZoom').textContent='Fit'; $('#navZoom').textContent='1:1'; }
    else { Engine.view={mode:'fit',cx:.5,cy:.5}; $('#tbZoom').textContent='1:1'; $('#navZoom').textContent='FIT'; }
    Engine.dirty=true;
  },

  // ================================================================ main loop
  loop(){
    try{
      if(this.module==='scan'){
        if(!Splat.scene){ if(Engine.dirty){ Engine.dirty=false; const keep=Engine.src; Engine.src=null; Engine.render({}); Engine.src=keep; UI.drawHisto($('#histo'),null); $('#status').textContent=''; } }
        else if(Engine.dirty){ Engine.dirty=false; const [w,h]=this.scanLayoutSize(); Splat.maybeSort();
          const src=this.renderScanSource(w,h); Engine.src=src; Engine.view={mode:'fit'};
          const p=Object.assign({},Engine.hoverParams||Engine.p,{crop:{x:0,y:0,w:1,h:1},angle:0,rot:0,flip:false});
          const L=Engine.layout(p); this._lastL=L;
          Engine.render({params:p,layout:L,borderTex:this.borderFor(L,p)}); this.scanThumb(); this.histo(); this.status(); }
      } else if(this.module!=='library' && Engine.dirty){
        Engine.dirty=false;
        const p=Engine.hoverParams||Engine.p;
        const L=Engine.layout(); this._lastL=L;
        if(this.compare && Engine.src && !Engine.cropMode){ const Ls=Engine.renderSplit(this.compare.settings,p,(L2,p2)=>this.borderFor(L2,p2)); document.body.classList.toggle('splitV',!!Engine.splitVertical); this._lastL=Object.assign({},Ls[1],{W:L.W,H:L.H}); }
        else Engine.render({params:p,borderTex:this.borderFor(L,p)});
        Tools.overlay(); this.histo(); this.status(); this.navPreview(p);
      }
    }catch(e){ console.error(e); }
    requestAnimationFrame(()=>this.loop());
  },
  edgeP(p){ const i=this.cur?this.items.indexOf(this.cur):0; return Object.assign({},p,{frameNo:p.frameNo||((Math.max(0,i)%36)+1)}); },
  borderFor(L,p){ if(!Engine.src||p.border==='none') return null; return Borders.texture(p.border,L.fw,L.fh,L.b,Engine.stock(p.stock),this.edgeP(p)); },
  histo(){ const p=Engine.hoverParams||Engine.p; const h=Engine.src?Engine.histogram(p):null; Engine._lastHist=h; UI.drawHisto($('#histo'),h); if(Tools.drawCurve&&!this._curveT){ this._curveT=setTimeout(()=>{ this._curveT=null; Tools.drawCurve(); },150); }
    const s=Engine.stock(p.stock);
    const auto=(p.autoExp&&Engine.src&&Engine.src.key)?Math.log2(0.18*0.62/Engine.src.key):0;
    $('#histoInfo').innerHTML=`<span>${s.maker} ${s.name}${Engine.hoverParams?' (preview)':''}</span><span>${Engine.src&&Engine.src.raw?'RAW · ':''}EV ${(p.ev+auto>=0?'+':'')+(p.ev+auto).toFixed(1)}</span>`; },
  status(){ const s=Engine.src; $('#status').textContent = s ? (this.module==='scan' ? `${Splat.cam.format} · ${Math.round(Splat.cam.fmm)}mm · ƒ/${STOPS[Splat.cam.stop]} · ${(Splat.cam.focus*Splat.cam.scale).toFixed(2)} m` : (()=>{ const [w,h]=Engine.dims(Engine.p); return `${Math.round(w)} × ${Math.round(h)}`; })()) : ''; },

  // ================================================================ events
  bindEvents(){
    document.querySelectorAll('#modules button').forEach(b=>b.onclick=()=>this.setModule(b.dataset.m));
    document.querySelectorAll('#left .panel>h3, #right>.panel>h3').forEach(h=>h.addEventListener('click',e=>{ if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON') return; h.parentElement.classList.toggle('open'); }));
    $('#btnImport').onclick=()=>this.importDialog(); $('#emptyImport').onclick=()=>this.importDialog(); $('#seOpen').onclick=()=>this.openScan(); $('#seNew').onclick=()=>this.newScan(); $('#seDemo').onclick=()=>this.loadDemo();
    $('#btnExport').onclick=()=>this.exportDialog();
    $('#presetAdd').onclick=e=>{ e.stopPropagation(); $('#pUserPresets').classList.add('open'); $('#presetNew').classList.toggle('on'); if($('#presetNew').classList.contains('on')){ const n=$('#presetName'); n.value=Engine.stock().name+' — '; n.focus(); n.setSelectionRange(n.value.length,n.value.length); } };
    $('#presetSave').onclick=()=>{ this.savePreset($('#presetName').value,$('#presetWB').checked); $('#presetNew').classList.remove('on'); };
    $('#presetName').addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter') $('#presetSave').click(); if(e.key==='Escape') $('#presetNew').classList.remove('on'); });
    $('#tbBefore').onclick=()=>this.toggleBefore(); $('#tbZoom').onclick=()=>this.toggleZoom();
    $('#tbCrop').onclick=()=>{ if(this.module!=='develop') this.setModule('develop'); Tools.setCropMode(!Engine.cropMode); };
    $('#tbSync').onclick=()=>this.syncDialog();
    $('#libFilter').onchange=e=>{ this.filter=e.target.value; this.renderStrip(); this.renderGrid(); };
    $('#tbCompare').onclick=()=>{ if(this.module!=='develop') this.setModule('develop'); this.toggleCompare(); };
    $('#verAdd').onclick=e=>{ e.stopPropagation(); this.saveVersion(); };
    $('#presetExport').onclick=e=>{ e.stopPropagation(); this.exportPresets(); };
    $('#presetImport').onclick=e=>{ e.stopPropagation(); this.importPresets(); };
    $('#tbExpose').onclick=()=>this.exposeFrame();
    $('#clipLo').onclick=$('#clipHi').onclick=()=>{ Engine.showClip=!Engine.showClip; Engine.dirty=true; };
    $('#fileIn').onchange=e=>{ const f=[...e.target.files]; e.target.value=''; this.addFiles(f); };
    $('#pipeClose').onclick=()=>$('#pipe').classList.remove('on');
    $('#pipeCancel').onclick=()=>{ Native.call('cancelPipeline',{job:this._pipeJobId||-1}).catch(()=>{}); $('#pipe').classList.remove('on'); };
    Native.on('pipelineStarted',d=>{ this._pipeJobId=d.job; });
    Native.on('pipelineLog',d=>this.pipeText(d.text));
    Native.on('drop',paths=>this.addPaths(paths));
    Native.on('menu',cmd=>({update:()=>this.checkUpdate(true),shortcuts:()=>this.shortcuts(),selectAll:()=>{ const a=document.activeElement; if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')) a.select(); else if(this.module!=='scan'){ this.items.forEach(x=>x.sel=true); this.renderStrip(); this.renderGrid(); this.updateSync(); this.toast(this.items.length+' photos selected'); } },import:()=>this.importDialog(),openScan:()=>this.openScan(),newScan:()=>this.newScan(),export:()=>this.exportDialog(),undo:()=>this.undo(),redo:()=>this.redo()}[cmd]||(()=>{}))());
    window.addEventListener('resize',()=>{ Engine.dirty=true; });
    // browser drag & drop
    const vw=$('#viewer'); vw.addEventListener('dragover',e=>e.preventDefault());
    vw.addEventListener('drop',e=>{ e.preventDefault(); if(!Native.available) this.addFiles([...e.dataTransfer.files]); });
    this.bindViewer();
    document.addEventListener('keydown',e=>this.key(e));
  },
  importDialog(){
    if(Native.available){ Native.call('open',{multiple:true,exts:['jpg','jpeg','heic','heif','png','tif','tiff','dng','cr2','cr3','nef','arw','raf','orf','rw2','ply','splat']}).then(p=>p&&p.length&&this.addPaths(p)); }
    else { const i=$('#fileIn'); i.accept='image/*,.heic,.heif,.ply,.splat'; i.click(); }
  },
  toggleBefore(){ Engine.before=!Engine.before; $('#beforeTag').classList.toggle('on',Engine.before); $('#tbBefore').classList.toggle('on',Engine.before); Engine.dirty=true; },
  key(e){
    if(e.key==='Escape' && $('#busy').classList.contains('on')) this._cancelVideo=true;
    if(e.target.tagName==='INPUT'&&e.target.type!=='range'||e.target.tagName==='SELECT') return;
    const k=e.key, meta=e.metaKey||e.ctrlKey;
    if(meta&&k.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?this.redo():this.undo(); return; }
    if(meta&&e.shiftKey&&k.toLowerCase()==='c'){ e.preventDefault(); const cp=cloneParams(Engine.p); PER_PHOTO_KEYS.forEach(k=>delete cp[k]); this.clipboard=JSON.stringify(Engine.p); this._clipLite=JSON.stringify(cp); this.toast('Settings copied'); return; }
    if(meta&&e.shiftKey&&k.toLowerCase()==='v'){ e.preventDefault(); if(this.clipboard){ this.applySettings(Object.assign(cloneParams(Engine.p),JSON.parse(this._clipLite||this.clipboard))); this.commit(); this.toast('Settings pasted'); } return; }
    if(meta&&k.toLowerCase()==='a'&&this.module!=='scan'){ e.preventDefault(); this.items.forEach(x=>x.sel=true); this.renderStrip(); this.renderGrid(); this.updateSync(); this.toast(this.items.length+' photos selected'); return; }
    if(meta&&k==="'"){ e.preventDefault(); this.saveVersion(); return; }
    if(meta&&k.toLowerCase()==='e'){ e.preventDefault(); this.exportDialog(); return; }
    if(meta&&k.toLowerCase()==='o'){ e.preventDefault(); this.importDialog(); return; }
    if(meta) return;
    if(k==='Escape'&&Tools.eyedrop){ Tools.pickWB(false); return; }
    if(k==='Escape'&&Tools.maskEdit){ Tools.setMaskEdit(false); Tools.renderMasks(); return; }
    if((k==='w'||k==='W')&&this.cur&&this.module!=='scan'){ if(this.module!=='develop') this.setModule('develop'); Tools.pickWB(!Tools.eyedrop); return; }
    if((k==='m'||k==='M')&&this.cur&&this.module==='develop'){ if(!Tools.masks().length) Tools.addMask('radial'); else { if(!Tools.maskSel) Tools.maskSel=Tools.masks()[0].id; Tools.setMaskEdit(!Tools.maskEdit); Tools.renderMasks(); } return; }
    if(this.cur&&this.module!=='scan'&&!e.altKey){ if(/^[0-5]$/.test(k)){ this.rate(+k); return; } if(k==='p'||k==='P'){ this.flag('pick'); return; } if(k==='x'||k==='X'){ this.flag('reject'); return; } if(k==='u'||k==='U'){ this.flag(null); return; } }
    if(Engine.cropMode && (k==='Enter'||k==='Escape'||k==='r'||k==='R')){ e.preventDefault(); Tools.setCropMode(false); return; }
    if((k==='r'||k==='R') && this.cur && this.module!=='scan'){ if(this.module!=='develop') this.setModule('develop'); Tools.setCropMode(true); return; }
    if((k==='c'||k==='C')&&this.cur&&this.module!=='scan'){ if(this.module!=='develop') this.setModule('develop'); this.toggleCompare(); return; }
    if(k==='Escape'&&this.compare){ this.setCompare(null); return; }
    if(k==='\\'){ this.toggleBefore(); }
    else if(k==='z'||k==='Z'){ this.toggleZoom(); }
    else if(k==='j'||k==='J'){ Engine.showClip=!Engine.showClip; Engine.dirty=true; }
    else if(k==='g'||k==='G'){ this.setModule('library'); }
    else if(k==='d'||k==='D'){ this.setModule('develop'); }
    else if(k==='s'||k==='S'){ this.setModule('scan'); }
    else if(k===' '&&this.module==='scan'){ e.preventDefault(); this.exposeFrame(); }
    else if(k==='ArrowRight'||k==='ArrowLeft'){ const i=this.items.indexOf(this.cur)+(k==='ArrowRight'?1:-1); if(this.items[i]){ e.preventDefault(); this.select(this.items[i].id); } }
    else if((k==='Backspace'||k==='Delete')&&this.cur&&this.module!=='scan'){ this.remove(this.cur.id); }
  },
  bindViewer(){
    const v=$('#view'); const ptrs=new Map(); let g=null, lastTap=0;
    v.addEventListener('pointermove',e=>{ Tools.cropCursor(e,v); if(Tools.maskEdit&&!this._maskDrag) Tools.maskPointer('hover',e,v); });
    v.addEventListener('pointerleave',()=>{ Tools._cursor=null; Tools.overlay(); });
    v.addEventListener('pointerdown',e=>{ v.setPointerCapture(e.pointerId);
      if(Tools.eyedrop && this.module==='develop'){ Tools.eyedropClick(e,v); return; }
      if(this.module==='develop' && !this.compare && Tools.maskPointer('down',e,v)){ ptrs.clear(); this._maskDrag=true; return; }
      if(Tools.cropPointer('down',e,v)){ ptrs.clear(); this._cropDrag=true; return; } ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,t:performance.now()});
      if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; g={d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2}; }
      if(this.module!=='scan') v.className=Engine.view.mode==='fit'?'grab':'grabbing'; });
    v.addEventListener('pointermove',e=>{ if(this._maskDrag){ Tools.maskPointer('move',e,v); return; } if(this._cropDrag){ Tools.cropPointer('move',e,v); return; } const p=ptrs.get(e.pointerId); if(!p) return; const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
      if(this.module==='scan'){
        const c=Splat.cam;
        if(ptrs.size===1){ if(e.buttons&2||e.shiftKey) Splat.pan(dx,dy); else { c.yaw-=dx*0.006; c.pitch=Math.max(-1.45,Math.min(1.45,c.pitch+dy*0.006)); } Engine.dirty=true; }
        else if(ptrs.size===2&&g){ const [a,b]=[...ptrs.values()], d=Math.hypot(a.x-b.x,a.y-b.y), mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
          c.dist=Math.max(0.05,c.dist*g.d/Math.max(d,1)); Splat.pan(mx-g.mx,my-g.my); g={d,mx,my}; Engine.dirty=true; }
      } else if(Engine.view.mode!=='fit' && this._lastL){ const L=this._lastL, dpr=L.dpr; Engine.view.cx=Math.min(1,Math.max(0,Engine.view.cx-dx*dpr/L.fw)); Engine.view.cy=Math.min(1,Math.max(0,Engine.view.cy-dy*dpr/L.fh)); Engine.dirty=true; }
    });
    const up=e=>{ if(this._maskDrag){ this._maskDrag=false; Tools.maskPointer('up',e,v); return; } if(this._cropDrag){ this._cropDrag=false; Tools.cropPointer('up',e,v); return; } const p=ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if(ptrs.size<2) g=null; if(this.module!=='scan') v.className='grab';
      if(!p||ptrs.size||e.type!=='pointerup'||Math.hypot(e.clientX-p.x0,e.clientY-p.y0)>6||performance.now()-p.t>350) return;
      const now=performance.now(), dbl=now-lastTap<320; lastTap=now;
      if(this.module==='scan'){ const L=this._lastL; if(!L) return; const r=v.getBoundingClientRect(), dpr=L.dpr;
        const px=(e.clientX-r.left)*dpr-L.ix, py=(L.H-(e.clientY-r.top)*dpr)-L.iy; const ix=px, iy=L.ih-py;
        if(ix<0||iy<0||ix>L.iw||iy>L.ih) return;
        const hit=Splat.pick(ix,iy,L.iw,L.ih); if(hit){ Splat.cam.focusLock=hit; if(dbl) Splat.cam.target=Splat.toWorld(hit); this.ring(e.clientX,e.clientY); Engine.dirty=true; }
      } else if(dbl){ this.toggleZoom({x:e.clientX,y:e.clientY}); }
    };
    v.addEventListener('pointerup',up); v.addEventListener('pointercancel',up);
    v.addEventListener('contextmenu',e=>e.preventDefault());
    v.addEventListener('wheel',e=>{ if(this.module!=='scan') return; e.preventDefault(); Splat.cam.dist=Math.max(0.05,Splat.cam.dist*Math.exp(e.deltaY*0.0012)); Engine.dirty=true; },{passive:false});
  },
  // ---- self-update from GitHub (Help → Check for Updates, and once a day on launch)
  async checkUpdate(manual){
    if(!Native.available||!this.info||!(this.info.native>=2)){ if(manual) this.toast('Rebuild the app once to enable updates (see chat)'); return; }
    if(!manual){ try{ const last=+localStorage.getItem('dr.updChk')||0; if(Date.now()-last<20*3600e3) return; localStorage.setItem('dr.updChk',Date.now()); }catch(e){} }
    let r; try{ r=await Native.call('update',{mode:'check'}); }catch(e){ if(manual) this.toast('Update check failed: '+e.message); return; }
    const out=(r&&r.out||'').trim(), m=out.match(/AVAILABLE (\S+) (\S+)/);
    if(!m){ if(manual) this.toast(/UP_TO_DATE/.test(out)?'Splat Darkroom is up to date':'Could not check: '+out.split('\n').pop()); return; }
    const body=$('#dlgBody'); body.innerHTML=''; const h=$('#dlg h2'), ok=$('#dlgOk'), kh=h.textContent, ko=ok.textContent; h.textContent='Update available'; ok.textContent='Update now';
    UI.note(body,`A new version of Splat Darkroom is ready (${m[2]}). Your photos, edits, presets and scans are untouched. If the native shell changed, the app rebuilds and restarts itself (about 30 seconds).`);
    $('#dlg').classList.add('on'); const go=await new Promise(res=>{ ok.onclick=()=>res(true); $('#dlgCancel').onclick=()=>res(false); });
    $('#dlg').classList.remove('on'); h.textContent=kh; ok.textContent=ko; if(!go) return;
    this.save(); this.busy('Updating Splat Darkroom…');
    try{ const a=await Native.call('update',{mode:'apply'}); const o=a&&a.out||'';
      if(!/UPDATED/.test(o)){ this.busy(); alert('Update failed:\n'+o.slice(-800)); return; }
      if(/REBUILD/.test(o)){ this.busy('Restarting…'); await Native.call('relaunch'); } else location.reload();
    }catch(e){ this.busy(); this.toast('Update failed: '+e.message); }
  },
  shortcuts(){ const body=$('#dlgBody'); body.innerHTML=''; const h=$('#dlg h2'), kh=h.textContent; h.textContent='Keyboard shortcuts';
    const rows=[['G · D · S','Library · Develop · 3D Scan'],['← →','Previous / next photo'],['⌘-click · ⇧-click · ⌘A','Select photos'],['1–5 · 0','Star rating · clear'],['P · X · U','Pick · reject · unflag'],
      ['\\','Before / after'],['Z · double-click','Zoom 1:1 / fit'],['C','Compare with a saved version'],["⌘'",'Save version'],['R','Crop & straighten'],['M','Masks overlay'],['W','White balance eyedropper'],['J','Clipping warning'],
      ['⌘⇧C · ⌘⇧V','Copy / paste settings'],['⌘Z · ⌘⇧Z','Undo / redo'],['⌘E','Export'],['Space (3D Scan)','Expose a frame']];
    body.innerHTML='<table class="keys">'+rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')+'</table>';
    $('#dlg').classList.add('on'); const done=()=>{ $('#dlg').classList.remove('on'); h.textContent=kh; }; $('#dlgOk').onclick=done; $('#dlgCancel').onclick=done; },
  ask(title,value){ return new Promise(res=>{ const body=$('#dlgBody'); body.innerHTML=''; const h=$('#dlg h2'), ok=$('#dlgOk'), keepH=h.textContent, keepOk=ok.textContent; h.textContent=title; ok.textContent='OK';
      const i=document.createElement('input'); i.className='askIn'; i.value=value||''; i.spellcheck=false; body.appendChild(i); $('#dlg').classList.add('on'); setTimeout(()=>{ i.focus(); i.select(); },30);
      const done=v=>{ $('#dlg').classList.remove('on'); h.textContent=keepH; ok.textContent=keepOk; res(v); };
      i.onkeydown=e=>{ e.stopPropagation(); if(e.key==='Enter') done(i.value); if(e.key==='Escape') done(null); };
      ok.onclick=()=>done(i.value); $('#dlgCancel').onclick=()=>done(null); }); },
  ring(x,y){ const r=$('#ring'), b=$('#viewer').getBoundingClientRect(); r.style.left=(x-b.left)+'px'; r.style.top=(y-b.top)+'px'; r.classList.add('on'); clearTimeout(this._rt); this._rt=setTimeout(()=>r.classList.remove('on'),800); },
  busy(m){ $('#busy').classList.toggle('on',!!m); $('#busyMsg').textContent=m||''; },
  toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(this._to); this._to=setTimeout(()=>t.classList.remove('on'),2600); },
};
window.addEventListener('DOMContentLoaded',()=>App.start());
