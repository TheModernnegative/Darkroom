// Splat Darkroom — application.
const $ = s=>document.querySelector(s);
const App = {
  items:[], scans:[], cur:null, module:'develop', lastStock:'original', clipboard:null, scanItem:null,
  scanRT:null, scanKey:null, editMax:6144,

  async start(){
    const canvas=$('#view');
    try { Engine.init(canvas); } catch(e){ document.body.innerHTML='<p style="padding:40px">This app needs WebGL2. '+e.message+'</p>'; return; }
    Splat.init(Engine.gl); Splat.onDirty=()=>{ Engine.dirty=true; };
    this.editMax=Math.min(6144, Engine.gl.getParameter(Engine.gl.MAX_TEXTURE_SIZE));
    await Engine.loadManifest();
    $('#credits').innerHTML = 'Colour film models: <a href="https://github.com/andreavolpato/spektrafilm">spektrafilm</a> by Andrea Volpato — profiles &amp; LUTs CC BY-SA 4.0. Black-and-white film and paper models, grain and halation: Splat Darkroom.';
    this.buildDevelopPanels(); this.addToggles(); Studio.init(this); Studio.build($('#fxPanels')); Studio.buildRecipeGrid($('#recipeList'),p=>this.hover(p)); { const r0=UI.refresh; UI.refresh=function(){ r0.apply(UI,arguments); Studio.refreshAssets(); }; } Engine.loadAssets().then(()=>{ Studio.refreshAssets(); Studio.loadPlate(); Studio._rkey=null; Engine.dirty=true; }); this.addStudioToggles(); this.buildScanPanels(); this.buildPresets();
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
    { const fr=UI.check(b,'showFrame','Show frame / border',()=>P().border!=='none'&&!(P().off&&P().off.frame),v=>{ const p=P(); p.off=Object.assign({},p.off||{}); if(v){ delete p.off.frame; if(p.border==='none'){ const d=(Engine.stock(p.stock).defaults||{}).border; p.border=d||'film'; } } else p.off.frame=true; this.changed(); this.commit(); UI.refresh(); this.syncToggles(); }); }
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
    // Grain (placed right under Film below)
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
    b=UI.panel(root,'pLens','Lens',false,()=>{ P().falloff=DEFAULTS.falloff; P().softness=0; this.changed(); this.commit(); UI.refresh(); });
    S(b,'falloff','Falloff',{min:0,max:1.5,step:0.01,fmt:x=>Math.round(x*100)});
    S(b,'softness','Softness',{min:0,max:100,step:1});
    UI.note(b,'Softness blurs the whole frame the way instant film and old lenses resolve less detail; Diffusion (Halation & Glow) adds the hazy bloom.');
    // Frame
    b=UI.panel(root,'pFrame','Frame',false);
    UI.select(b,'border','Border',()=>Borders.styles,()=>Borders.isFilm(P().border)?'film':P().border,v=>{ P().border=v; this.changed(); this.commit(); });
    UI.select(b,'frameTone','Frame color',()=>[['auto','Auto (film’s own)'],['white','White'],['cream','Cream'],['black','Black']],()=>P().frameTone||'auto',v=>{ P().frameTone=v; this.changed(); this.commit(); });
    UI.select(b,'edgeText','Edge print',()=>[['stock','Film stock'],['custom','Custom text'],['none','None']],()=>P().edgeText,v=>{ P().edgeText=v; ct.style.display=v==='custom'?'':'none'; this.changed(); this.commit(); });
    const ct=document.createElement('div'); ct.className='row'; ct.innerHTML='<label>Text</label><input class="askIn" spellcheck="false" maxlength="40" placeholder="e.g. DANIEL S. WORKMAN 400">'; b.appendChild(ct);
    const ci=ct.querySelector('input'); ci.value=P().edgeCustom||''; ct.style.display=P().edgeText==='custom'?'':'none';
    ci.addEventListener('keydown',e=>e.stopPropagation()); ci.oninput=()=>{ P().edgeCustom=ci.value; this.changed(); }; ci.onchange=()=>this.commit();
    UI.sliders.edgeCustom=()=>{ if(document.activeElement!==ci) ci.value=P().edgeCustom||''; ct.style.display=P().edgeText==='custom'?'':'none'; };
    S(b,'frameNo','Frame number',{min:0,max:38,step:1,fmt:x=>x?String(Math.round(x)):'Auto'});
    UI.note(b,'Edge print, frame numbers and DX code appear on the 35mm border; 120 and 4×5 show the edge text.');
    root.insertBefore($('#pGrain'),$('#pFilm').nextSibling);
  },

  buildScanPanels(){ setTimeout(()=>this.renderScanLooks(),0);
    const c=Splat.cam, d=()=>{ Engine.dirty=true; };
    let b=$('#scanSourceBody'); b.innerHTML='';
    const row=document.createElement('div'); row.className='btnrow'; b.appendChild(row);
    UI.button(row,'Open scan…',()=>this.openScan());
    UI.button(row,'Demo',()=>this.loadDemo());
    const row2=document.createElement('div'); row2.className='btnrow'; b.appendChild(row2);
    const nb=UI.button(row2,'New scan…',()=>this.newScan()); nb.title='Make a new 3D scan from a video or a set of photos';
    UI.button(row2,'▶ How to film',()=>Tutorial.open());
    if(!Native.available){ nb.disabled=true; nb.title='Available in the Mac app'; }
    UI.seg(b,'up','Up axis',[['Y-up','Y up'],['Y-down','Y down'],['Z-up','Z up']],()=>c.model?'':c.up,v=>{ c.up=v; c.model=null; c.roll=0; if(Splat.scene&&!Splat.scene.demo) Splat.frame(); Splat.lastSortView=null; this.scanKey=null; this.saveScanView(); d(); });
    { const r=document.createElement('div'); r.className='btnrow'; b.appendChild(r);
      UI.button(r,'⚖ Level  L',()=>this.levelScan(),'tbtn accent'); UI.button(r,'Level to view',()=>{ Splat.levelToView(); this.saveScanView(); UI.refresh(); d(); this.toast('Levelled to the current view'); }); }
    UI.slider(b,'roll','Horizon',{min:-20,max:20,step:0.1,def:0,get:()=>c.roll||0,set:v=>{ c.roll=v; d(); },commit:()=>this.saveScanView(),fmt:x=>(x>0?'+':'')+x.toFixed(1)+'°'});
    UI.seg(b,'bg','Backdrop',[['#0a0a09','Black'],['#7d7a74','Grey'],['#f1efe9','White']],()=>c.bg,v=>{ c.bg=v; d(); });
    UI.slider(b,'scale','Scene scale',{min:0,max:1,step:0.001,def:Math.log(1/0.02)/Math.log(2500),
      get:()=>Math.log(c.scale/0.02)/Math.log(2500), set:v=>{ c.scale=0.02*Math.pow(2500,v); d(); }, fmt:()=>c.scale<1?Math.round(c.scale*100)+' cm':c.scale.toFixed(2)+' m'});
    UI.note(b,'','scanInfo');
    UI.note(b,'Scans have arbitrary units. Set this so the subject is its real size and depth of field behaves like a real lens.');
    const vr=document.createElement('div'); vr.className='btnrow'; b.appendChild(vr);
    UI.button(vr,'Reset view',()=>{ Splat.frame(); this.scanKey=null; d(); },'tbtn');
    UI.button(vr,'Export video…',()=>this.orbitDialog(),'tbtn accent');
    // ---- clean-up brush: paint away floating specks (hidden, never deleted from the file)
    { const cr=document.createElement('div'); cr.className='btnrow'; b.appendChild(cr); const cb=UI.button(cr,'🧹 Clean up specks…',()=>this.setClean(!this.cleanMode)); cb.id='cleanBtn';
      const cp=document.createElement('div'); cp.id='cleanPanel'; b.appendChild(cp);
      UI.slider(cp,'cleanR','Brush size',{min:4,max:200,step:1,def:30,get:()=>this.cleanR||30,set:v=>{ this.cleanR=v; },fmt:x=>Math.round(x)+' px'});
      UI.slider(cp,'cleanFar','Far away',{min:1.5,max:12,step:0.1,def:5,get:()=>this.cleanFar||5,set:v=>{ this.cleanFar=v; this.cleanFarPreview(); },fmt:x=>x.toFixed(1)+'×'});
      const r2=document.createElement('div'); r2.className='btnrow'; cp.appendChild(r2); UI.button(r2,'Remove everything that far out',()=>this.cleanFarApply());
      const r3=document.createElement('div'); r3.className='btnrow'; cp.appendChild(r3); UI.button(r3,'Undo stroke  ⌘Z',()=>this.cleanUndo()); UI.button(r3,'Restore all',()=>this.cleanRestore()); UI.button(r3,'Done',()=>this.setClean(false),'tbtn accent');
      UI.note(cp,'Paint over specks to remove them — it erases everything under the brush, front to back, so orbit to a side where the subject isn’t behind them. [ and ] change the brush. The scan file is never changed; Restore all brings everything back.','cleanNote'); }
    // ---- camera moves: keyframes of position, focus, aperture and focal length, rendered as one smooth shot
    { const h=document.createElement('div'); h.className='ahead'; h.textContent='Camera move (keyframes)'; b.appendChild(h);
      const kl=document.createElement('div'); kl.className='cpList'; kl.id='keyList'; b.appendChild(kl);
      const kr=document.createElement('div'); kr.className='btnrow'; b.appendChild(kr);
      UI.button(kr,'+ Keyframe',()=>this.addKey()); UI.button(kr,'▶ Preview',()=>this.previewKeys()); UI.button(kr,'Clear',()=>{ if((this.scanKeys||[]).length>1&&!confirm('Clear all '+this.scanKeys.length+' keyframes? (instances you saved keep theirs)')) return; this.scanKeys=[]; this.keySel=-1; this.renderKeys(); });
      const tl=document.createElement('div'); tl.id='keyTL'; b.appendChild(tl);
      const ko=document.createElement('div'); ko.id='keyOpts'; b.appendChild(ko);
      UI.note(b,'Frame a shot, press + Keyframe; move, refocus or change aperture / focal length, add another. Export video → “Keyframes” glides between them (dolly, rack focus, aperture pull).');
      setTimeout(()=>this.renderKeys(),0); }
    b=$('#cameraBody'); b.innerHTML='';
    { if(!this.camDefaults) this.camDefaults=this.camSnap();
      UI.select(b,'camPreset','Presets',()=>[['','Choose a saved scan look…']].concat((this.scanPresets||[]).map((x,i)=>[String(i),x.name])),()=>'',v=>{ if(v==='') return; this.applyScanLook(this.scanPresets[+v]); });
      const r=document.createElement('div'); r.className='btnrow'; b.appendChild(r);
      UI.button(r,'Save look…',()=>this.saveCamPreset()); UI.button(r,'Delete…',()=>this.deleteCamPreset()); UI.button(r,'Reset camera',()=>{ this.applyCam(this.camDefaults); this.toast('Camera reset to defaults'); }); }
    UI.select(b,'lens','Lens',()=>[['','Custom']].concat(LENSES.map(l=>[l.id,l.name])),()=>c.lens||'',v=>this.setLens(v));
    UI.note(b,'','lensNote'); this.lensNote();
    UI.seg(b,'cfmt','Format',Object.keys(SCAN_FORMATS).map(k=>[k,k.replace('x','×')]),()=>c.format,v=>{ c.format=v; c.fmm=SCAN_FORMATS[v].f; UI.refresh(); d(); });
    UI.seg(b,'orient','Orientation',[['true','Vertical'],['false','Horizontal']],()=>String(c.portrait),v=>{ c.portrait=v==='true'; d(); });
    UI.slider(b,'fmm','Focal length',{min:14,max:760,step:1,def:150,get:()=>c.fmm,set:v=>{ c.fmm=v; d(); },fmt:x=>Math.round(x)+'mm'});
    UI.slider(b,'stop','Aperture',{min:0,max:STOPS.length-1,step:1,def:6,get:()=>c.stop,set:v=>{ c.stop=v; d(); },fmt:x=>'ƒ/'+STOPS[x]});
    UI.slider(b,'focusS','Focus',{min:0,max:1,step:0.001,def:0.5,get:()=>Math.log(c.focus/0.05)/Math.log(8000),set:v=>{ c.focusLock=null; c.focus=0.05*Math.pow(8000,v); d(); },
      fmt:()=>{ const m=c.focus*c.scale; return m<1?Math.round(m*100)+'cm':m.toFixed(2)+'m'; }});
    UI.slider(b,'tilt','Front tilt',{min:-12,max:12,step:0.5,def:0,get:()=>c.tilt,set:v=>{ c.tilt=v; d(); },fmt:x=>(x>0?'+':'')+x+'°'});
    UI.slider(b,'tiltDir','Tilt direction',{min:-90,max:90,step:1,def:0,get:()=>c.tiltDir||0,set:v=>{ c.tiltDir=v; d(); },fmt:x=>x===0?'Tilt (up/down)':Math.abs(x)===90?'Swing (sideways)':Math.round(x)+'°'});
    UI.check(b,'dof','Depth of field',()=>c.dof,v=>{ c.dof=v; d(); });
    UI.note(b,'<span class="sub">Lens character</span>');
    UI.slider(b,'swirl','Swirl',{min:0,max:1.5,step:0.01,def:0,get:()=>c.swirl||0,set:v=>{ c.swirl=v; c.lens=''; d(); },fmt:x=>Math.round(x*100)});
    UI.slider(b,'catEye',"Cat's-eye bokeh",{min:0,max:1,step:0.01,def:0,get:()=>c.catEye||0,set:v=>{ c.catEye=v; c.lens=''; d(); },fmt:x=>Math.round(x*100)});
    UI.slider(b,'anam','Anamorphic',{min:0,max:1.5,step:0.01,def:0,get:()=>c.anam||0,set:v=>{ c.anam=v; c.lens=''; d(); },fmt:x=>Math.round(x*100)});
    const PP=k=>({get:()=>((c.post||{})[k]??0),set:v=>{ c.post=Object.assign({},c.post||{}); c.post[k]=v; c.lens=''; d(); }});
    UI.slider(b,'lglow','Glow',Object.assign({min:0,max:0.6,step:0.01,def:0,fmt:x=>Math.round(x*100)},PP('glow')));
    UI.slider(b,'lfall','Vignette',Object.assign({min:0,max:1.5,step:0.01,def:0,fmt:x=>Math.round(x*100)},PP('falloff')));
    UI.slider(b,'lfringe','Fringing',Object.assign({min:0,max:60,step:1,def:0},PP('fringe')));
    UI.slider(b,'ldist','Distortion',Object.assign({min:-80,max:40,step:1,def:0},PP('distort')));
    UI.slider(b,'lsoft','Soft corners',Object.assign({min:0,max:80,step:1,def:0},PP('softEdges')));
    UI.note(b,'<span class="sub">Lens flare</span>');
    UI.slider(b,'lflare','Flare',Object.assign({min:0,max:100,step:1,def:0,fmt:x=>Math.round(x)},PP('flare')));
    UI.select(b,'lflareC','Flare colour',()=>[['blue','Anamorphic blue'],['amber','Amber'],['gold','Gold'],['violet','Violet'],['teal','Teal'],['red','Red'],['green','Green'],['white','Clean white']],()=>(c.post||{}).flareColor||'blue',v=>{ c.post=Object.assign({},c.post||{},{flareColor:v}); c.lens=''; d(); });
    UI.slider(b,'lflareL','Streak length',Object.assign({min:0,max:100,step:1,def:60,fmt:x=>Math.round(x)},{get:()=>((c.post||{}).flareLen??60),set:v=>{ c.post=Object.assign({},c.post||{},{flareLen:v}); d(); }}));
    UI.slider(b,'lflareG','Ghosts',Object.assign({min:0,max:100,step:1,def:35,fmt:x=>Math.round(x)},{get:()=>((c.post||{}).flareGhost??35),set:v=>{ c.post=Object.assign({},c.post||{},{flareGhost:v}); d(); }}));
    UI.slider(b,'lflareS','Flare sensitivity',Object.assign({min:0,max:100,step:1,def:50,fmt:x=>Math.round(x)},{get:()=>((c.post||{}).flareSens??50),set:v=>{ c.post=Object.assign({},c.post||{},{flareSens:v}); d(); }}));
    UI.note(b,'Click the image to focus; focus stays locked to that point while you orbit. Double-click to orbit around it.');
  },

  buildPresets(){ UI.favs=new Set(this.favStocks||[]); UI.onFav=f=>{ this.favStocks=f; this.saveSoon(); this.stockThumbsSoon(true); };
    UI.buildPresets($('#presetList'),Engine.manifest.stocks,id=>{ this.setStock(id); this.commit(); },async id=>{
      this.hover(id?Tools.stockParams(Engine.p,id,false):null); });
    $('#scanLinkBox').querySelectorAll('.seg button').forEach(b=>b.onclick=()=>this.setScanLink(b.dataset.v));
    $('#scanLinkBox .slFrom').onchange=e=>{ this.scanLinkFrom=e.target.value; if((this.scanLink||'off')==='off') this.scanLink='studio'; this.setScanLink(this.scanLink); };
    $('#scanFxSwitch').onclick=e=>{ const b=e.target.closest('button'); if(!b) return; document.body.classList.toggle('scanFx',b.dataset.v==='fx'); $('#scanFxSwitch').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); UI.refresh(); };
    $('#stockSheet').onclick=e=>{ e.stopPropagation(); this.sheetMenu(e.target,'stocks'); }; $('#lookSheet').onclick=e=>{ e.stopPropagation(); this.sheetMenu(e.target,'looks'); };
    $('#presetSearch').addEventListener('input',e=>{ UI.filterPresets(e.target.value); this.stockThumbsSoon(); });
    { const el=$('#presetList'), btn=$('#stockGrid'); const set=on=>{ el.classList.toggle('gridmode',on); btn.classList.toggle('on',on); try{ localStorage.stockGrid=on?'1':''; }catch(e){} if(on) this.stockThumbsSoon(true); };
      btn.onclick=e=>{ e.stopPropagation(); set(!el.classList.contains('gridmode')); }; let v=''; try{ v=localStorage.stockGrid; }catch(e){} set(v==='1');
      el.closest('.side').addEventListener('scroll',()=>this.stockThumbsSoon(),{passive:true}); }
    $('#presetSearch').addEventListener('click',e=>e.stopPropagation());
    $('#presetSearch').addEventListener('keydown',e=>e.stopPropagation());
  },

  // ---- contact sheet: the current photo through every film stock (or every look), labelled, as one JPEG
  async contactSheet(kind){ if(!this.cur||!Engine.src){ this.toast('Open a photo first'); return; }
    let items=[]; const orig=p=>Object.assign(withDefaults({}),{crop:cloneParams(p.crop),angle:p.angle,rot:p.rot,flip:p.flip,aspect:p.aspect}), keepIt=this.cur;
    if(kind==='looks') items=STUDIO_RECIPES.map(([n,r])=>({label:n.replace(' · ',' — '),p:()=>Studio.recipeParams(r)}));
    else { const st=Engine.manifest.stocks.filter(s=>s.type!=='original'&&(kind!=='favs'||(this.favStocks||[]).includes(s.id)));
      items=st.map(s=>({label:(s.maker&&s.maker!=='Original'?s.maker+' ':'')+s.name,p:()=>Tools.stockParams(Engine.p,s.id,false)})); }
    if(kind==='ba'){ const sel=this.selected().filter(x=>x.kind!=='scanlook'); items=(sel.length?sel:[this.cur]).flatMap(it=>[{label:it.name.replace(/\.[^.]+$/,'')+' — original',it,p:()=>orig(Engine.p)},{label:it.name.replace(/\.[^.]+$/,'')+' — edited',it,p:()=>cloneParams(Engine.p)}]); }
    else if(items.length) items.unshift({label:'Original',p:()=>orig(Engine.p)});
    if(!items.length){ this.toast(kind==='favs'?'Star some films first (☆ on a film)':'Nothing to show'); return; }
    const T=420, cols=kind==='ba'?4:items.length>24?7:items.length>12?6:4, [sw,sh]=Engine.dims(Engine.p), tw=sw>=sh?T:Math.round(T*sw/sh), th=sw>=sh?Math.round(T*sh/sw):T, pad=14, lab=30, head=60;
    const rows=Math.ceil(items.length/cols), cv=document.createElement('canvas'); cv.width=cols*(tw+pad)+pad; cv.height=head+rows*(th+lab+pad)+pad; const x=cv.getContext('2d');
    x.fillStyle='#111'; x.fillRect(0,0,cv.width,cv.height); x.fillStyle='#ddd'; x.font='600 22px "Helvetica Neue",Arial'; x.fillText((this.cur.name||'Photo')+' — '+(kind==='ba'?'before & after':kind==='looks'?'every look':'every film stock'),pad,38);
    x.font='12px "Helvetica Neue",Arial'; x.fillStyle='#777'; x.fillText('Splat Darkroom · '+new Date().toLocaleDateString(),pad,54);
    this._stopSheet=false;
    for(let i=0;i<items.length;i++){ if(this._stopSheet) break; this.busy(`Contact sheet — ${i+1} / ${items.length}  (Esc to stop)`);
      if(items[i].it&&this.cur!==items[i].it) await this.select(items[i].it.id);
      const p=items[i].p(); try{ await Engine.ensureLuts(p); }catch(e){} const u=this.renderThumb(p,T); if(!u) continue;
      const im=await new Promise(r=>{ const m=new Image(); m.onload=()=>r(m); m.onerror=()=>r(null); m.src=u; }); const cx=pad+(i%cols)*(tw+pad), cy=head+Math.floor(i/cols)*(th+lab+pad);
      if(im){ const sc2=Math.min(tw/im.width,th/im.height), dw=im.width*sc2, dh=im.height*sc2; x.drawImage(im,cx+(tw-dw)/2,cy+(th-dh)/2,dw,dh); } x.fillStyle='#ccc'; x.font='13px "Helvetica Neue",Arial'; x.fillText(items[i].label,cx,cy+th+19,tw); await new Promise(r=>setTimeout(r,0)); }
    if(keepIt&&this.cur!==keepIt) await this.select(keepIt.id); this.busy(); Engine.dirty=true; await Engine.ensureLuts(Engine.p);
    const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.9)), name=(this.cur.name||'photo').replace(/\.[^.]+$/,'')+' — contact sheet.jpg';
    if(Native.available){ const path=await Native.call('pickSave',{name,dir:this.info&&this.info.splatDir+'/exports'}); if(!path) return; await Native.call('writeFile',{path,base64:await this.blobB64(blob)}); this.toast('Saved '+path.split('/').pop()); Native.call('reveal',{path}).catch(()=>{}); }
    else { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); } },
  sheetMenu(btn,kind){ const m=$('#ctxMenu'); m.innerHTML=''; const item=(l,f)=>{ const b=document.createElement('button'); b.textContent=l; b.onclick=()=>{ m.classList.remove('on'); f(); }; m.appendChild(b); };
    if(kind==='looks') item('Contact sheet of every look…',()=>this.contactSheet('looks'));
    else { item('Contact sheet of every film stock…',()=>this.contactSheet('stocks')); item('Contact sheet of favourite films…',()=>this.contactSheet('favs')); }
    item('Before & after of '+(this.selected().length>1?'the '+this.selected().length+' selected photos':'this photo')+'…',()=>this.contactSheet('ba'));
    const r=btn.getBoundingClientRect(); m.style.left=r.left+'px'; m.style.top=(r.bottom+4)+'px'; m.classList.add('on');
    setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m.contains(e.target)){ m.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0); },
  // ---- film stock previews: each visible film rendered on the current photo, a few at a time
  stockThumbsSoon(force){ if(force) this._stKey=null; clearTimeout(this._stt); this._stt=setTimeout(()=>this.stockThumbs(),300); },
  async stockThumbs(){ const el=$('#presetList'); if(!el||!el.classList.contains('gridmode')||!this.cur||!Engine.src||this.module==='scan') return;
    const q=cloneParams(Engine.p); ['stock','paper','filmAmt','grain','grainSize','halation','falloff'].forEach(k=>delete q[k]); const key=this.cur.id+JSON.stringify(q);
    if(key!==this._stKey){ this._stKey=key; this._stDone=new Set(); }
    const job=this._stJob=(this._stJob||0)+1, vh=innerHeight;
    const tiles=[...el.querySelectorAll('.preset')].filter(t=>t.offsetParent&&!this._stDone.has(t.dataset.id)&&(()=>{ const r=t.getBoundingClientRect(); return r.bottom>-200&&r.top<vh+400; })());
    for(const t of tiles){ if(job!==this._stJob) return; const id=t.dataset.id;
      try{ const p=Tools.stockParams(Engine.p,id,false); await Engine.ensureLuts(p); if(job!==this._stJob) return; const u=this.renderThumb(p,180); if(u){ t.querySelector('.pthumb').style.backgroundImage=`url(${u})`; this._stDone.add(id); } }catch(e){}
      await new Promise(r=>setTimeout(r,16)); }
    Engine.dirty=true; },
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
  // ---- Studio: second photo for double exposure (any other photo in the library)
  doubleChooser(b){ this._dblEl=document.createElement('div'); this._dblEl.className='dblPick'; b.appendChild(this._dblEl); this.renderDoubleChooser(); },
  renderDoubleChooser(){ const el=this._dblEl; if(!el) return; el.innerHTML='';
    const others=this.items.filter(i=>i!==this.cur);
    // "this photo": a ghost of the same frame — smear it, echo it, zoom it
    { const g=document.createElement('div'); g.className='selfDbl'+(Engine.p.dblId==='__self'?' on':''); g.textContent='This photo (ghost)'; g.title='Use the same photo as a second exposure — smear, echo and offset it';
      g.onclick=async()=>{ if(Engine.p.dblId==='__self'){ Engine.p.dblId=''; Engine.setDouble(null); } else { Engine.p.dblId='__self'; if((Engine.p.dblSmear||0)===0&&(Engine.p.dblEchoes||1)===1&&!Engine.p.dblX){ Engine.p.dblSmear=35; Engine.p.dblMode='screen'; Engine.p.dblAmt=55; } await this.loadDouble(); } this.changed(); this.commit(); UI.refresh(); this.renderDoubleChooser(); };
      el.appendChild(g); }
    if(!others.length){ const n=document.createElement('div'); n.className='note'; n.style.gridColumn='1/-1'; n.textContent='Import another photo to blend two different pictures.'; el.appendChild(n); return; }
    others.forEach(it=>{ const im=document.createElement('img'); if(it.thumb) im.src=it.thumb; im.title=it.name; if(Engine.p.dblId===it.id) im.className='on';
      im.onclick=async()=>{ if(Engine.p.dblId===it.id){ Engine.p.dblId=''; Engine.setDouble(null); } else { Engine.p.dblId=it.id; await this.loadDouble(); } this.changed(); this.commit(); this.renderDoubleChooser(); };
      el.appendChild(im); }); },
  async loadDouble(){ const id=Engine.p.dblId; if(!id){ Engine.setDouble(null); return; }
    if(id==='__self'){ if(Engine.src) Engine.setDouble(Object.assign({},Engine.src,{own:false}),'__self'); return; }
    if(Engine.dblSrc&&Engine.dblSrc.id===id) return;
    const it=this.items.find(i=>i.id===id); if(!it){ Engine.setDouble(null); return; }
    try{ const src=it.src&&it!==this.cur ? Object.assign({},it.src) : await this.decode(it,3072); if(!it.src) src.own=true; Engine.setDouble(src,id); }catch(e){ this.toast('Could not open the second photo'); } },
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
  // "My looks" thumbnails: each saved look rendered on whatever is open (photo or scan view)
  lookThumbsSoon(){ clearTimeout(this._ltt); this._ltt=setTimeout(()=>this.lookThumbs(),700); },
  async lookThumbs(){ const el=$('#userPresetList'); if(!el||!el.offsetParent||!this.cur||!Engine.src||this._pipeBusy||!(this.userPresets||[]).length) return;
    const key=(this.module==='scan'?'scan'+this.scanPath+this.scanKey:this.cur.id)+'|'+this.userPresets.map(p=>p.name+JSON.stringify(p.settings).length).join(',');
    if(key===this._ltKey) return; this._ltKey=key; const job=this._ltJob=(this._ltJob||0)+1, tiles=[...el.querySelectorAll('.preset.user')];
    for(let i=0;i<tiles.length&&i<this.userPresets.length;i++){ if(job!==this._ltJob) return; const ps=this.userPresets[i];
      try{ const p=this.module==='scan'?this.scanParams(this.presetParams(ps)):this.presetParams(ps); await Engine.ensureLuts(p); if(job!==this._ltJob) return; const u=this.renderThumb(p,120); const t=tiles[i].querySelector('.lthumb'); if(u&&t) t.style.backgroundImage=`url(${u})`; }catch(e){}
      await new Promise(r=>setTimeout(r,16)); } Engine.dirty=true; },
  presetParams(ps){ return Object.assign(cloneParams(Engine.p),cloneParams(ps.settings)); },
  // batch: a look or preset applied while several photos are selected (⌘-click) goes onto all of them
  applyToOthers(fn,name){ if(this.module==='scan') return 0; const others=this.selected().filter(x=>x!==this.cur&&x.kind!=='scanlook'); if(!others.length) return 0;
    others.forEach(it=>{ const s=withDefaults(fn(withDefaults(it.settings))); delete s.crop; s.crop=it.settings.crop; s.angle=it.settings.angle; s.rot=it.settings.rot; s.flip=it.settings.flip; s.aspect=it.settings.aspect; s.masks=it.settings.masks;
      it.settings=s; it.hist=it.hist||[]; it.hist.push(JSON.stringify(s)); it.histT=it.histT||[]; it.histT.push(Date.now()); it.thumbStale=true; });
    this.saveSoon(); setTimeout(()=>{ this.toast('“'+name+'” applied to '+(others.length+1)+' photos — Export → Selected to save them all'); },600); return others.length; },
  async applyPreset(ps){ this.applyToOthers(base=>Object.assign(base,cloneParams(ps.settings)),ps.name); await this.applySettings(this.presetParams(ps)); this.commit(); this.hover(null); this.toast('Applied “'+ps.name+'”');
    this.activePreset={ps,amt:100}; this.renderPresetAmt(); },
  renderPresetAmt(){ const el=$('#presetAmt'); if(!el) return; el.innerHTML=''; const a=this.activePreset;
    if(!a||!this.cur){ el.style.display='none'; return; } el.style.display='';
    UI.slider(el,'presetAmt',a.ps.name.length>14?a.ps.name.slice(0,13)+'…':a.ps.name,{min:0,max:150,step:1,def:100,get:()=>a.amt,
      set:v=>{ a.amt=v; Engine.p=Tools.blendPreset(Engine.p,a.ps.settings,v/100); if(this.cur) this.cur.settings=Engine.p; Engine.curveKey=''; this.changed(); UI.refresh(); },
      commit:()=>this.commit(),fmt:x=>Math.round(x)+'%'}); },
  renderUserPresets(){
    const el=$('#userPresetList'); if(!el) return; el.innerHTML='';
    this._ltKey=null; this.lookThumbsSoon();
    if(!this.userPresets.length){ el.innerHTML='<div class="note">No looks yet. Make an edit, then press <b>+</b> (or Reset ▾ → Save look). Looks work on photos and scans.</div>'; return; }
    this.userPresets.forEach(ps=>{
      const d=document.createElement('div'); d.className='preset user'; d.title='Click to apply · hover to preview';
      const st=Engine.stock(ps.settings.stock);
      d.innerHTML=`<span class="lthumb"></span><span class="pn">${ps.name.replace(/</g,'&lt;')}</span><span class="iso">${ps.settings.stock?st.name:''}</span><b class="pa up" title="Update with current settings">↻</b><b class="pa del" title="Delete preset">×</b>`;
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
    const o=Tools.stockParams(Engine.p,id,true), newAspect=o.aspect!==Engine.p.aspect; Object.assign(Engine.p,o); const p=Engine.p; this.lastStock=id;
    if(newAspect && Engine.src) Tools.applyAspect(false);
    await Engine.ensureLuts(p); this.commit&&this.commit(); this.changed(); UI.refresh(); UI.markPreset(id); this.updateStockNote();
  },
  updateStockNote(){ const s=Engine.stock(), el=$('#stockNote'); if(el) el.innerHTML=`<b style="color:#ddd">${s.maker} ${s.name}</b>${s.iso?' · ISO '+s.iso:''}<br>${s.desc}`; },

  // ================================================================ edits / history
  // on/off switch in each panel header: hides that section's effect without losing its settings
  STUDIO_SECTIONS:{sSilver:['silver'],sTwoTone:['twotone'],sDouble:['dbl'],sLeak:['leak','fx_leak'],sBurn:['fx_burn','fx_flare'],sDust:['dust','fx_dust'],sTexture:['fx_texture'],sPoints:['points'],sFrameFx:['fx_frame'],sAnalog:['analog'],sFlare:['flare'],sLens:['lensfx']},
  addStudioToggles(){ Object.assign(this.PANEL_SECTIONS,this.STUDIO_SECTIONS); this.addToggles(); $('#studioRandom').onclick=e=>{ e.stopPropagation(); Studio.randomLook(); }; $('#studioReset').onclick=e=>{ e.stopPropagation(); Studio.resetAll(); this.toast('Studio effects cleared'); }; },
  PANEL_SECTIONS:{pFilm:['film'],pBasic:['wb','tone','presence'],pCurve:['curve'],pHSL:['hsl'],pGrade:['grade'],pDetail:['detail'],pGrain:['grain'],pHal:['halation'],pLens:['lens'],pFrame:['frame'],pMasks:['masks']},
  addToggles(){
    for(const id in this.PANEL_SECTIONS){ const el=document.getElementById(id); if(!el||el.querySelector('.ptog')) continue; const secs=this.PANEL_SECTIONS[id];
      const b=document.createElement('button'); b.className='ptog'; b.title='Turn this section on / off (keeps its settings)';
      b.onclick=e=>{ e.stopPropagation(); const p=Engine.p; p.off=Object.assign({},p.off||{}); const off=!secs.every(k=>p.off[k]); secs.forEach(k=>{ if(off) p.off[k]=true; else delete p.off[k]; }); this.changed(); this.commit(); this.syncToggles(); };
      el.querySelector('h3').appendChild(b); }
    this.syncToggles(); },
  syncToggles(){ if(UI.sliders.showFrame) UI.sliders.showFrame(); const off=Engine.p.off||{}; for(const id in this.PANEL_SECTIONS){ const el=document.getElementById(id); if(!el) continue; const o=this.PANEL_SECTIONS[id].every(k=>off[k]); el.classList.toggle('secoff',o); const b=el.querySelector('.ptog'); if(b) b.textContent=o?'OFF':'ON'; } },
  dots(){ this.syncToggles&&this.syncToggles(); const e=Tools.edited(Engine.p), map={pMasks:'masks',pDetail:'effects',pFilm:'film',pBasic:'light',pCurve:'light',pCrop:'crop',pHSL:'color',pGrade:'color',pGrain:'effects',pHal:'effects',pLens:'effects',pFrame:'effects'};
    const own={pMasks:['masks'],pDetail:['sharpen','sharpRadius','nr','nrColor'],pBasic:['temp','tint','ev','contrast','highlights','shadows','whites','blacks','vibrance','saturation','hlExpand'],pCurve:['curve'],pHSL:['hslH','hslS','hslL'],pGrade:['gShS','gShL','gMidS','gMidL','gHiS','gHiL'],pGrain:['grain','grainSize','grainRough'],pHal:['halation','glow'],pLens:['falloff'],pFrame:['border'],pCrop:['crop','angle','rot','flip']};
    for(const id in map){ const el=document.getElementById(id); if(!el) continue; const ks=own[id]; const on = ks ? ks.some(k=>JSON.stringify(Engine.p[k])!==JSON.stringify(DEFAULTS[k])) : e[map[id]]; el.classList.toggle('edited',!!on); }
    // Studio panels
    for(const id in this.STUDIO_OWN){ const el=document.getElementById(id); if(el) el.classList.toggle('edited',this.studioEdited(id)); }
    const any=Object.keys(this.STUDIO_OWN).some(id=>this.studioEdited(id)); const nav=document.querySelector('[data-m="studio"]'); if(nav) nav.classList.toggle('edited',any); },
  STUDIO_OWN:{sSilver:[SILVER_KEYS],sTwoTone:[['ttOn']],sDouble:[['dblId']],sLeak:[['leakAmt'],'leak'],sBurn:[[],'burn','flare'],sDust:[['dustAmt','scratchAmt','hairAmt'],'dust'],sTexture:[[],'texture'],sFrameFx:[[],'frame'],sPoints:[['cps']],sAnalog:[['anOn']],sFlare:[['flare']],sLens:[['zoomBlur','motionBlur','softEdges','tiltShift','fringe','distort']]},
  studioEdited(id){ const [ks,...cats]=this.STUDIO_OWN[id], p=Engine.p, fx=p.fx||{};
    if(id==='sSilver'&&!p.silver) return false; if(id==='sTwoTone'&&!p.ttOn) return false;
    return ks.some(k=>JSON.stringify(p[k])!==JSON.stringify(DEFAULTS[k]))||cats.some(c=>Object.keys(fx).some(k=>k.replace(/\d+$/,'')===c&&fx[k]&&fx[k].id&&fx[k].amt>0)); },
  // after a look: open the panels it used, fold the rest, so you can fine-tune it
  openEdited(){ this.dots(); for(const id in this.STUDIO_OWN){ const el=document.getElementById(id); if(el) el.classList.toggle('open',this.studioEdited(id)); }
    const first=Object.keys(this.STUDIO_OWN).map(id=>document.getElementById(id)).find(el=>el&&el.classList.contains('open')); if(first) first.scrollIntoView({block:'start',behavior:'smooth'}); },
  changed(){ Engine.dirty=true; Engine.histDirty=true; clearTimeout(this._dt); this._dt=setTimeout(()=>this.dots(),120); if(this.cur){ this.cur.settings=Engine.p; this.thumbSoon(); this.saveSoon(); } },
  commit(){ const it=this.cur; if(!it) return; const snap=JSON.stringify(it.kind==='scanlook'&&Splat.scene?Object.assign({},Engine.p,{__cam:this.camSnap()}):Engine.p);
    it.hist=it.hist||[]; it.histT=it.histT||[]; it.fut=[]; const H=it.hist, n=H.length;
    if(H[n-1]!==snap){ let merge=false; try{ if(n>=2&&Date.now()-(it.histT[n-1]||0)<6000) merge=this.histLabel(H[n-2],H[n-1])===this.histLabel(H[n-1],snap); }catch(e){}
      if(merge){ H[n-1]=snap; it.histT[n-1]=Date.now(); if(H[n-2]===snap){ H.pop(); it.histT.pop(); } } else { H.push(snap); it.histT.push(Date.now()); } }
    while(it.hist.length>200){ it.hist.shift(); it.histT.shift(); } while(it.histT.length<it.hist.length) it.histT.unshift(0); this.renderHistorySoon(); },
  // ---- history log: every committed step, newest first; click one to go back to it (that becomes a new step)
  HNAMES:{stock:'Film',paper:'Paper',filmAmt:'Film strength',format:'Format',ev:'Exposure',contrast:'Contrast',highlights:'Highlights',shadows:'Shadows',whites:'Whites',blacks:'Blacks',temp:'White balance',tint:'White balance',
    vibrance:'Vibrance',saturation:'Saturation',grain:'Grain',grainSize:'Grain size',halation:'Halation',glow:'Glow',falloff:'Vignette',crop:'Crop',angle:'Straighten',curve:'Tone curve',hsl:'Colour mixer',border:'Frame',
    showFrame:'Frame',silver:'Black & white',structure:'Structure',sTone:'Toning',fx:'Overlays',flare:'Lens flare',anOn:'Analog media',ttOn:'Two-tone',dblId:'Double exposure',masks:'Masks',sharpen:'Sharpening',nr:'Noise reduction',push:'Push/pull',
    leakAmt:'Light leak',dustAmt:'Dust',scratchAmt:'Scratches',softEdges:'Soft edges',fringe:'Fringing',distort:'Distortion',zoomBlur:'Zoom blur',motionBlur:'Motion blur',tiltShift:'Tilt-shift'},
  histLabel(a,b){ if(!a) return 'Opened'; const A=JSON.parse(a), B=JSON.parse(b), out=new Set();
    for(const k in B){ if(k==='__cam'||k==='lookUndo') continue; if(JSON.stringify(A[k])!==JSON.stringify(B[k])){ const n=this.HNAMES[k]||(/^g(Sh|Mid|Hi)/.test(k)?'Colour grading':/^s[A-Z]/.test(k)?'Silver':/^an[A-Z]/.test(k)?'Analog media':/^tt/.test(k)?'Two-tone':/^dbl/.test(k)?'Double exposure':/^leak/.test(k)?'Light leak':/^dust|^hair/.test(k)?'Dust':/^flare/.test(k)?'Lens flare':k); out.add(n); } }
    if(A.__cam&&B.__cam){ const C={lens:'Lens',stop:'Aperture',focus:'Focus',fmm:'Focal length',format:'Camera format',portrait:'Orientation',tilt:'Tilt',post:'Lens character',swirl:'Swirl',catEye:'Cat\'s-eye',anam:'Anamorphic',bg:'Backdrop',dof:'Depth of field'};
      for(const k in B.__cam) if(JSON.stringify(A.__cam[k])!==JSON.stringify(B.__cam[k])) out.add(C[k]||k); }
    if(B.stock!==A.stock&&B.stock){ const st=Engine.stock&&Engine.stock(B.stock); out.delete('Film'); out.add('Film: '+(st?st.name:B.stock)); }
    const l=[...out]; return l.length?l.slice(0,3).join(', ')+(l.length>3?' +'+(l.length-3):''):'(no change)'; },
  renderHistorySoon(){ clearTimeout(this._hrs); this._hrs=setTimeout(()=>this.renderHistory(),250); },
  renderHistory(){ const el=$('#histList'); if(!el) return; el.innerHTML=''; const it=this.cur; if(!it||!it.hist||!it.hist.length){ el.innerHTML='<div class="note">Edits will be listed here.</div>'; return; }
    const n=it.hist.length, fmt=t=>t?new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
    for(let i=n-1;i>=Math.max(0,n-80);i--){ const r=document.createElement('div'); r.className='hrow'+(i===n-1?' on':'');
      r.innerHTML='<span class="ht"></span><span class="hl"></span>'; r.querySelector('.ht').textContent=fmt((it.histT||[])[i]); r.querySelector('.hl').textContent=this.histLabel(it.hist[i-1],it.hist[i]);
      if(i<n-1) r.onclick=()=>{ this.applySettings(JSON.parse(it.hist[i])).then(()=>{ this.commit(); this.toast('Went back to that step'); }); };
      el.appendChild(r); } },
  undo(){ const it=this.cur; if(!it||!it.hist||it.hist.length<2) return; it.fut.push(it.hist.pop()); this.applySettings(JSON.parse(it.hist[it.hist.length-1])); this.toast('Undo'); },
  redo(){ const it=this.cur; if(!it||!it.fut||!it.fut.length) return; const s=it.fut.pop(); it.hist.push(s); this.applySettings(JSON.parse(s)); this.toast('Redo'); },
  async applySettings(s){ if(s&&s.__cam){ const c=s.__cam; s=Object.assign({},s); delete s.__cam; if(this.module==='scan') this.applyCam(c); } Engine.p=withDefaults(s); setTimeout(()=>Tools.renderMasks(),0); if(this.cur) this.cur.settings=Engine.p; await Engine.ensureLuts(Engine.p); UI.refresh(); UI.markPreset(Engine.p.stock); this.updateStockNote(); Engine.dirty=true; this.thumbSoon(); this.saveSoon(); },

  // ================================================================ library
  newItem(o){ const it=Object.assign({id:'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), settings:withDefaults({}), thumb:null, hist:[], fut:[]},o);
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
    this.renderStrip(); UI.refresh(); UI.markPreset(Engine.p.stock); this.updateStockNote(); this.dots(); Tools.renderMasks(); this.renderHistory();
    await Engine.ensureLuts(Engine.p);
    if(it.kind==='scanframe' && it.src){ Engine.setSource(it.src); }
    else {
      if(!it.src){ this.busy('Opening '+it.name+'…'); try{ it.src=await this.decode(it,this.editMax); } catch(e){ this.busy(); this.toast('Could not open '+it.name+': '+e.message); return; } this.busy(); }
      Engine.setSource(it.src);
    }
    this.setCompare(null); this.renderVersions(); this.loadDouble(); this.renderDoubleChooser&&this.renderDoubleChooser();
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
    const tex=gl.createTexture(); gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D,tex);
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
  // ---- stacks: duplicates live together under one cover photo; collapse/expand, pin members to stay out
  members(sid){ return this.items.filter(x=>x.stack===sid); },
  cover(sid){ const m=this.members(sid); return m.find(x=>x.stackTop)||m[0]; },
  visible(){ const all=this.filtered(), out=[], seen=new Set();
    all.forEach(it=>{ if(!it.stack){ out.push(it); return; } if(seen.has(it.stack)) return; seen.add(it.stack);
      const m=all.filter(x=>x.stack===it.stack); if(m.length<2){ out.push(...m); return; }
      const top=m.find(x=>x.stackTop)||m[0], open=top.stackOpen;
      m.sort((a,b)=>(b===top)-(a===top)); m.forEach((x,i)=>{ x._stk={n:m.length,first:i===0,last:i===m.length-1,open};
        if(open||x===top||x.pinned||x===this.cur) out.push(x); }); });
    return out; },
  toggleStack(it){ const top=this.cover(it.stack); top.stackOpen=!top.stackOpen; this.renderStrip(); this.renderGrid(); this.saveSoon(); },
  makeCover(it){ this.members(it.stack).forEach(x=>{ if(x.stackTop&&x!==it){ x.stackTop=false; it.stackOpen=x.stackOpen; } }); it.stackTop=true; this.renderStrip(); this.renderGrid(); this.saveSoon(); this.toast('Now the cover of this stack'); },
  pinItem(it){ it.pinned=!it.pinned; this.renderStrip(); this.renderGrid(); this.saveSoon(); this.toast(it.pinned?'Pinned — stays visible when the stack is closed':'Unpinned'); },
  stackSelected(){ const sel=this.items.filter(x=>x.sel||x===this.cur); if(sel.length<2){ this.toast('Select two or more photos (⌘-click) to stack them'); return; }
    const sid=sel.find(x=>x.stack)?.stack||sel[0].id; const first=this.items.indexOf(sel[0]);
    sel.forEach(x=>{ x.stack=sid; x.stackTop=false; }); sel[0].stackTop=true; sel[0].stackOpen=false;
    const rest=this.items.filter(x=>!sel.includes(x)); rest.splice(Math.min(first,rest.length),0,...sel); this.items=rest;
    this.items.forEach(x=>x.sel=false); this.renderStrip(); this.renderGrid(); this.saveSoon(); this.toast('Stacked '+sel.length+' photos'); },
  unstack(it){ const sid=it.stack; if(!sid) return; const m=this.members(sid); if(m.length<=2) m.forEach(x=>{ delete x.stack; x.stackTop=false; x.pinned=false; }); else { delete it.stack; if(it.stackTop){ it.stackTop=false; const n=this.members(sid)[0]; n.stackTop=true; n.stackOpen=it.stackOpen; } it.pinned=false; }
    this.renderStrip(); this.renderGrid(); this.saveSoon(); },
  filtered(){ let f=this.filter||'all', q=this.query||''; if(f.startsWith('sc:')){ const c=(this.smart||[]).find(x=>x.id===f.slice(3)); f=c?c.filter:'all'; q=((c?c.q:'')+' '+q).trim(); }
    let tag=null; if((this.filter||'').startsWith('sc:')){ const c=(this.smart||[]).find(x=>x.id===this.filter.slice(3)); tag=c&&c.tag; }
    const toks=q.toLowerCase().split(/\s+/).filter(Boolean);
    const test=(it,t)=>{ let m; if(m=t.match(/^(\d)\s*(?:★|\*|stars?)?\+$/)||t.match(/^(\d)(?:★|\*)$/)) return (it.rating||0)>=+m[1]; if(m=t.match(/^[<>]=?(\d)$/)) return t[0]==='>'?(it.rating||0)>+m[1]-(t[1]==='='?1:0):(it.rating||0)<+m[1]+(t[1]==='='?1:0);
      if(/^picks?$/.test(t)) return it.flag==='pick'; if(/^rejects?$/.test(t)) return it.flag==='reject'; if(t==='unrated') return !it.rating; if(t==='edited') return this.isEdited(it.settings); if(t==='bw'||t==='b&w') return !!it.settings.silver||/tri-x|hp5|delta|pan|acros|t-max|tmax/i.test(Engine.stock(it.settings.stock).name||'');
      if(t.startsWith('-')&&t.length>1) return !test(it,t.slice(1));
      const st=Engine.stock(it.settings.stock)||{}; const hay=(it.name+' '+(st.maker||'')+' '+(st.name||'')+' '+(it.settings.lookName||'')+' '+(it.settings.format||'')+' '+(it.kind==='scanframe'||it.inst?'scan frame 3d':'')+' '+(it.tags||[]).join(' ')).toLowerCase(); return hay.includes(t); };
    return this.items.filter(it=>( f==='all' ? true : f==='picks' ? it.flag==='pick' : f==='made3d' ? !!(it.inst||it.kind==='scanframe') : f==='rejects' ? it.flag==='reject' : f==='unrated' ? !it.rating : (it.rating||0)>=+f ) && (!tag||(it.tags||[]).includes(tag)) && toks.every(t=>test(it,t))); },
  renderLibFilter(){ const el=$('#libFilter'); if(!el) return; const v=this.filter||'all'; el.querySelectorAll('.sc').forEach(x=>x.remove());
    const g=document.createElement('optgroup'); g.className='sc'; g.label='Smart collections'; (this.smart||[]).forEach(c=>{ const o=document.createElement('option'); o.value='sc:'+c.id; o.textContent='⚙ '+c.name; g.appendChild(o); });
    const o1=document.createElement('option'); o1.value='__savesc'; o1.textContent='＋ Save this search as a smart collection…'; g.appendChild(o1);
    if((this.smart||[]).length){ const o2=document.createElement('option'); o2.value='__delsc'; o2.textContent='Delete a smart collection…'; g.appendChild(o2); }
    el.appendChild(g); el.value=v; if(el.value!==v) el.value='all'; },
  async libFilterChange(v){ if(v==='__savesc'){ const base=(this.filter||'all').startsWith('sc:')?'all':(this.filter||'all'); const def=[base!=='all'?$('#libFilter').querySelector(`option[value="${base}"]`).textContent:'',this.query||''].filter(Boolean).join(' · ');
        if(base==='all'&&!this.query){ this.toast('Type a search first (e.g. “4+ portra”), or pick a rating, then save it'); this.renderLibFilter(); return; }
        const n=await this.ask('Name this smart collection',def); if(n){ const c={id:Date.now().toString(36),name:n.slice(0,40),filter:base,q:this.query||''}; (this.smart=this.smart||[]).push(c); this.filter='sc:'+c.id; this.query=''; $('#libSearch').value=''; this.saveSoon(); this.toast('Smart collection “'+c.name+'” — it updates as you rate and edit'); } }
      else if(v==='__delsc'){ const n=await this.ask('Delete which smart collection? ('+this.smart.map(x=>x.name).join(', ')+')',''); const i=(this.smart||[]).findIndex(x=>x.name===n); if(i>=0){ if(this.filter==='sc:'+this.smart[i].id) this.filter='all'; this.smart.splice(i,1); this.saveSoon(); } }
      else this.filter=v;
      this.renderLibFilter(); this.renderStrip(); this.renderGrid(); },
  badge(it){ return (it.inst||it.kind==='scanframe'?'<i class="b3d" title="Made in 3D — right-click → Open in 3D">3D</i>':'')+(it.flag==='pick'?'<i class="fl pk">⚑</i>':it.flag==='reject'?'<i class="fl rj">✕</i>':'')+(it.rating?`<i class="st">${'★'.repeat(it.rating)}</i>`:''); },
  renderStrip(){
    const el=$('#strip'); el.innerHTML='';
    if(this.module==='scan'){
      const scans=this.scans.slice(); if(this.snapsFor(null).length) scans.unshift(this._demoSc||(this._demoSc={name:'Demo scan',path:null,thumb:null,demo:true}));
      if(!scans.length){ el.innerHTML='<div class="stripNote">No scans yet — build one with “New scan from video / photos…”. Scans live in Documents/Splat/scans.</div>'; return; }
      scans.forEach(sc=>{ const t=document.createElement('div'); t.className='thumb scan'+(sc.path===this.scanPath&&(!sc.demo||!this.scanPath)?' on':''); t.title=sc.name;
        t.innerHTML=(sc.thumb?`<img src="${sc.thumb}">`:'<div class="scanIco">3D</div>')+`<span class="badge">${sc.name}${sc.size>0?' · '+this.fmtBytes(sc.size):''}</span>`;
        t.onclick=()=>sc.demo?this.loadDemo():this.loadScanPath(sc.path);
        const mb=document.createElement('button'); mb.className='tmore'; mb.textContent='⋯'; mb.title='Rename · Show in Finder · Remove';
        mb.onclick=e=>{ e.stopPropagation(); this.scanMenu(sc,mb); }; t.appendChild(mb); t.oncontextmenu=e=>{ e.preventDefault(); this.scanMenu(sc,t,e.clientX,e.clientY); };
        const snaps=this.snapsFor(sc.path); if(snaps.length){ const b=document.createElement('button'); b.className='stkBtn'; b.innerHTML=(sc.snapOpen?'−':'+')+'<b>'+snaps.length+'</b>'; b.title=sc.snapOpen?'Collapse instances':'Show the '+snaps.length+' instance'+(snaps.length>1?'s':'')+' saved from this scan';
          b.onclick=e=>{ e.stopPropagation(); sc.snapOpen=!sc.snapOpen; this.renderStrip(); this.saveSoon(); }; t.appendChild(b); t.classList.add('stk'); if(sc.snapOpen) t.classList.add('stkOpen','stkFirst'); else t.classList.add('stkShut'); }
        el.appendChild(t);
        if(sc.snapOpen) snaps.forEach((sn,j)=>{ const d=document.createElement('div'); d.className='thumb snap stk stkOpen'+(j===snaps.length-1?' stkLast':'')+(this.curSnap===sn.id?' on':''); d.title=sn.name+' — click to go back to this instance · right-click for more';
          d.innerHTML=(sn.thumb?`<img src="${sn.thumb}">`:'<div class="scanIco">◎</div>')+'<span class="badge"></span>'; d.querySelector('.badge').textContent=sn.name;
          d.onclick=()=>this.openSnap(sc,sn); d.oncontextmenu=e=>{ e.preventDefault(); this.snapMenu(sc,sn,d); };
          const m2=document.createElement('button'); m2.className='tmore'; m2.textContent='⋯'; m2.title='Update · Rename · Export · Delete'; m2.onclick=e=>{ e.stopPropagation(); this.snapMenu(sc,sn,m2); }; d.appendChild(m2); el.appendChild(d); }); });
      return; }
    this.visible().forEach(it=>{ const t=document.createElement('div'); t.className='thumb'+(it===this.cur?' on':'')+(it.flag==='reject'?' rej':''); t.title=it.name;
      if(it.sel&&it!==this.cur) t.className+=' sel';
      t.innerHTML=(it.thumb?`<img src="${it.thumb}">`:'')+`<span class="badge">${(Engine.stock(it.settings.stock).name||'').replace('Superia ','')}</span><span class="marks">${this.badge(it)}</span>`;
      t.onclick=e=>this.stripClick(it,e);
      t.oncontextmenu=e=>{ e.preventDefault(); this.photoMenu(it,e.clientX,e.clientY); };
      this.stackDecor(t,it);
      const mb=document.createElement('button'); mb.className='tmore'; mb.textContent='⋯'; mb.title='Duplicate · Reset · Remove';
      mb.onclick=e=>{ e.stopPropagation(); const r=mb.getBoundingClientRect(); this.photoMenu(it,r.left,r.top); }; t.appendChild(mb);
      el.appendChild(t); });
  },
  // ---- reset / duplicate (virtual copies share the original file)
  isEdited(set){ const d=withDefaults({}); return Object.keys(d).some(k=>k!=='off'&&JSON.stringify(set[k])!==JSON.stringify(d[k])); },
  // save the whole current look (film + Develop + Studio, not crop) as a user preset
  async saveLookPreset(){ const st=Engine.stock(Engine.p.stock); const name=await this.ask('Name this look',(st&&st.id!=='original'?st.name+' · ':'')+'my look'); if(!name) return false;
    const o=cloneParams(Engine.p); ['crop','angle','rot','flip','aspect','masks','lookUndo'].forEach(k=>delete o[k]);
    this.userPresets.push({id:'p'+Date.now().toString(36),name,settings:o,t:Date.now()}); this.renderUserPresets(); this.saveSoon(); this.toast('Saved look “'+name+'” — it’s in Presets'); return true; },
  async resetPhoto(keepVersion){ const it=this.cur; if(!it) return;
    if(!this.isEdited(Engine.p)){ this.toast('Already the original'); return; }
    if(keepVersion){ this.saveVersion(); }
    if(this.compare) this.setCompare(null);
    await this.applySettings(withDefaults({})); Engine.p.dblId=''; Engine.setDouble&&Engine.setDouble(null); this.commit(); this.renderVersions();
    this.toast(keepVersion?'Saved your edit as a version and reset to the original (⌘Z to undo)':'Reset to the original (⌘Z to undo)'); },
  async duplicate(it,asOriginal){ it=it||this.cur; if(!it) return;
    const base=it.name.replace(/ \((copy|original)( \d+)?\)$/,'');
    const n=this.items.filter(x=>x.name.startsWith(base+' (')).length+1, tag=asOriginal?'original':'copy';
    const set=asOriginal?withDefaults({}):cloneParams(it===this.cur?Engine.p:it.settings);
    const d=this.newItem({name:`${base} (${tag}${n>1?' '+n:''})`,path:it.path,file:it.file,kind:it.kind==='scanframe'?'photo':it.kind,settings:set,thumb:asOriginal?null:it.thumb});
    if(it.kind==='scanframe'&&it.src){ d.kind='scanframe'; d.src=it.src; }
    const sid=it.stack||it.id; if(!it.stack){ it.stack=sid; it.stackTop=true; } d.stack=sid; d.stackTop=false; this.cover(sid).stackOpen=true;
    const m=this.members(sid).filter(x=>x!==d); this.items.splice(this.items.indexOf(d),1); this.items.splice(this.items.indexOf(m[m.length-1])+1,0,d);
    this.renderStrip(); this.renderGrid&&this.renderGrid(); this.saveSoon(); await this.select(d.id);
    this.toast(asOriginal?'Duplicated as the original — your edit is still on the first copy':'Duplicated with this edit'); },
  stackDecor(t,it){ const k=it.stack&&it._stk; if(!k||k.n<2) return; const top=this.cover(it.stack);
    t.classList.add('stk'); if(k.open){ t.classList.add('stkOpen'); if(k.first) t.classList.add('stkFirst'); if(k.last) t.classList.add('stkLast'); }
    if(it.pinned) t.insertAdjacentHTML('beforeend','<i class="pin" title="Pinned">📌</i>');
    if(it===top){ const b=document.createElement('button'); b.className='stkBtn'; b.innerHTML=(k.open?'−':'+')+'<b>'+k.n+'</b>'; b.title=k.open?'Close the stack':'Show all '+k.n+' versions';
      b.onclick=e=>{ e.stopPropagation(); this.toggleStack(it); }; t.appendChild(b); if(!k.open) t.classList.add('stkShut'); } },
  photoMenuReset(x0,y0){ const m=$('#ctxMenu'); m.innerHTML='';
    const item=(label,fn,kb)=>{ const b=document.createElement('button'); b.innerHTML=label+(kb?`<kbd>${kb}</kbd>`:''); b.onclick=()=>{ m.classList.remove('on'); fn(); }; m.appendChild(b); };
    const hr=()=>m.appendChild(document.createElement('hr'));
    if(this.module==='scan'){
      item('Start over from the original scan…',()=>this.resetScanFull()); item('Reset just the edits (keep camera &amp; keyframes)',()=>this.resetScan(false),'⇧⌘R'); item('Reset edits and camera (keep keyframes)',()=>this.resetScan(true));
      hr(); item('Save instance — keyframes, camera &amp; edits…',()=>this.saveSnap(),'⇧S'); item('Save look — just the edits…',()=>this.saveLookPreset()); item('Save instance, then start over…',async()=>{ await this.saveSnap(); this.resetScanFull(); });
      hr(); item('Save as scan look (camera + lens + edits)…',()=>this.saveCamPreset()); item('Save as scan look, then reset…',async()=>{ if(await this.saveCamPreset()!==false) this.resetScan(false); });
    } else if(this.module==='studio'){
      item('Reset Studio effects',()=>{ Studio.resetAll(); this.toast('Studio effects cleared — ⌘Z to undo'); }); item('Reset everything to original',()=>this.resetPhoto(false),'⇧⌘R');
      hr(); item('Save as version, then reset',()=>this.resetPhoto(true)); item('Save as look (preset)…',()=>this.saveLookPreset()); item('Save as look, then reset…',async()=>{ if(await this.saveLookPreset()) this.resetPhoto(false); });
      hr(); item('Duplicate with this edit',()=>this.duplicate(this.cur,false),'⌘D'); item('Duplicate as original',()=>this.duplicate(this.cur,true),'⇧⌘D');
    } else {
      item('Reset to original',()=>this.resetPhoto(false),'⇧⌘R'); item('Save as version, then reset',()=>this.resetPhoto(true));
      item('Save as look (preset)…',()=>this.saveLookPreset()); item('Save as look, then reset…',async()=>{ if(await this.saveLookPreset()) this.resetPhoto(false); });
      hr(); item('Duplicate with this edit',()=>this.duplicate(this.cur,false),'⌘D'); item('Duplicate as original',()=>this.duplicate(this.cur,true),'⇧⌘D');
    }
    m.style.left=Math.min(innerWidth-230,x0)+'px'; m.classList.add('on'); m.style.top=Math.max(8,y0-m.offsetHeight-4)+'px';
    setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m.contains(e.target)){ m.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0); },
  photoMenu(it,x0,y0){
    const m=$('#ctxMenu'); m.innerHTML='';
    const item=(label,fn,kb)=>{ const b=document.createElement('button'); b.innerHTML=label+(kb?`<kbd>${kb}</kbd>`:''); b.onclick=()=>{ m.classList.remove('on'); fn(); }; m.appendChild(b); };
    const sep=()=>{ const h=document.createElement('hr'); m.appendChild(h); };
    const open=async()=>{ if(it!==this.cur) await this.select(it.id); };
    if(it.inst){ item('Open in 3D — back to this exact view',()=>this.openInstOf(it)); item('Re-render from 3D at full quality',()=>this.rerender3D(it)); sep(); }
    if((it.tags||[]).length){ it.tags.slice(0,8).forEach(t=>item('🏷 '+t.replace(/</g,'&lt;'),()=>{ const q=$('#libSearch'); q.value=t.includes(' ')?t.split(' ')[0]:t; q.oninput(); this.toast('Showing photos tagged “'+t+'”'); })); sep(); }
    item('Print layout…',()=>this.printDialog(),'⌘P');
    if(it.stack&&this.members(it.stack).length>1){ const top=this.cover(it.stack);
      if(it!==top) item('Make cover of stack',()=>this.makeCover(it)); else item(top.stackOpen?'Close stack':'Open stack',()=>this.toggleStack(it));
      if(it!==top) item(it.pinned?'Unpin':'Pin (show when stack is closed)',()=>this.pinItem(it));
      item('Remove from stack',()=>this.unstack(it),'⇧⌘G'); sep(); }
    if(this.items.filter(x=>x.sel||x===this.cur).length>1) { item('Stack selected photos',()=>this.stackSelected(),'⌘G'); sep(); }
    item('Duplicate',()=>this.duplicate(it,false),'⌘D');
    item('Duplicate as original',()=>this.duplicate(it,true),'⇧⌘D');
    sep();
    item('Save as version, then reset',async()=>{ await open(); this.resetPhoto(true); });
    item('Reset to original',async()=>{ await open(); this.resetPhoto(false); },'⇧⌘R');
    sep();
    item('Remove from library',()=>this.remove(it.id));
    m.style.left=Math.min(innerWidth-230,x0)+'px'; m.classList.add('on'); m.style.top=Math.max(8,y0-m.offsetHeight-4)+'px';
    setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m.contains(e.target)){ m.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0);
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
      c.className+=(it.sel&&it!==this.cur?' sel':''); c.onclick=e=>{ if(e.metaKey||e.ctrlKey||e.shiftKey) this.stripClick(it,e); else { this.items.forEach(x=>x.sel=false); this.select(it.id); } }; c.ondblclick=()=>{ this.setModule('develop'); this.select(it.id); }; c.oncontextmenu=e=>{ e.preventDefault(); this.photoMenu(it,e.clientX,e.clientY); }; this.stackDecor(c,it);
      g.appendChild(c); });
  },
  thumbSoon(ms=500){ if(this.cur&&this.cur.kind==='scanlook') return; clearTimeout(this._tt); this._tt=setTimeout(()=>this.makeThumb(),ms); },
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
  loadScanBuffer(buf,name,path){ this._scanBytes=buf.byteLength; setTimeout(()=>this.renderScanInfo(),50);
    try{ const s=/\.splat$/i.test(name)?parseSplat(buf):parsePLY(buf); Splat.cam.up='Y-down'; Splat.cam.model=null; Splat.cam.roll=0; Splat.load(s); this.scanName=name; this.scanPath=path||null; this.keysToScan(); this.applyClean();
      { const sc=this.scans.find(x=>x.path===path); if(sc&&sc.view){ const v=sc.view; Object.assign(Splat.cam,{up:v.up||'Y-down',model:v.model||null,roll:v.roll||0,scale:v.scale||Splat.cam.scale}); if(v.lens) this.setLens(v.lens); Splat.frame(); } }
      if(path && !/\/export_\d+\.ply$/.test(path) && !this.scans.find(x=>x.path===path)) this.scans.unshift({name:name.replace(/\.(ply|splat)$/i,''),path,thumb:null}); }
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
    this.renderStrip(); this.statScans();
  },
  fmtBytes(n){ if(!(n>=0)) return ''; const u=['B','KB','MB','GB']; let i=0; while(n>=1000&&i<3){ n/=1000; i++; } return (n>=100||i===0?Math.round(n):n.toFixed(1))+' '+u[i]; },
  // sizes: the scan file itself, its folder (frames, camera solve, checkpoints) and the checkpoints you can clear
  async statScans(){
    if(!Native.available||!this.info||!(this.info.native>=3)) return;
    try{ const paths=[]; this.scans.forEach(sc=>{ paths.push(sc.path); paths.push(sc.path.replace(/\/[^/]+$/,'')); });
      const r=await Native.call('stat',{paths}); const m={}; r.forEach(x=>m[x.path]=x.size);
      for(const sc of this.scans){ const dir=sc.path.replace(/\/[^/]+$/,''); sc.size=m[sc.path]; sc.dirSize=m[dir];
        try{ const files=await Native.call('listDir',{path:dir}); const cps=files.filter(f=>/^export_\d+\.ply$/.test(f)&&dir+'/'+f!==sc.path).map(f=>dir+'/'+f);
          const cs=cps.length?await Native.call('stat',{paths:cps}):[]; sc.checkpoints=cs.filter(x=>x.size>0); }catch(e){} }
      this.renderStrip(); this.renderScanInfo(); }catch(e){} },
  renderScanInfo(){ const el=$('#scanInfo'); if(!el) return; const sc=this.scans.find(x=>x.path===this.scanPath);
    if(!Splat.scene){ el.innerHTML=''; return; }
    const n=Splat.scene.n, size=sc&&sc.size>0?sc.size:(this._scanBytes||0);
    let h=`<b>${(n/1e6).toFixed(n>=1e6?2:3)}M splats</b> · ${this.fmtBytes(size)} scan`;
    if(sc&&sc.dirSize>0) h+=` · ${this.fmtBytes(sc.dirSize)} with working files`;
    el.innerHTML=h;
    const cps=(sc&&sc.checkpoints)||[]; if(cps.length){ const tot=cps.reduce((a,x)=>a+x.size,0);
      const b=document.createElement('button'); b.className='tbtn'; b.style.marginTop='6px'; b.textContent=`Move ${cps.length} training checkpoints to Trash (${this.fmtBytes(tot)})`;
      b.onclick=async()=>{ const n2=await Native.call('trash',{paths:cps.map(x=>x.path)}); this.toast(`Moved ${n2} checkpoint files to the Trash`); this.statScans(); };
      el.appendChild(document.createElement('br')); el.appendChild(b); } },
  scanMenu(sc,anchor,cx,cy){
    const m=$('#ctxMenu'); m.innerHTML=''; const r=cx!=null?{left:cx,top:cy}:anchor.getBoundingClientRect();
    const item=(label,fn,kb)=>{ const b=document.createElement('button'); b.innerHTML=label+(kb?`<kbd>${kb}</kbd>`:''); b.onclick=()=>{ m.classList.remove('on'); fn(); }; m.appendChild(b); };
    const here=async()=>{ if(sc.path!==this.scanPath||!Splat.scene){ if(sc.demo) await this.loadDemo(); else await this.loadScanPath(sc.path); } };
    const live=sc.path===this.scanPath&&Splat.scene;
    if(live){ item('Save instance — keyframes, camera &amp; edits…',()=>this.saveSnap(),'⇧S'); item('Save look — just the edits, for any photo or scan…',()=>this.saveLookPreset()); m.appendChild(document.createElement('hr'));
      item('Start over from the original scan…',()=>this.resetScanFull());
      const sns=this.snapsFor(sc.path); if(sns.length){ m.appendChild(document.createElement('hr'));
        if(sns.length>1) item('Build a camera move from its '+sns.length+' instances',()=>{ if((this.scanKeys||[]).length>1&&!confirm('Replace your current '+this.scanKeys.length+' keyframes?')) return; this.scanKeys=sns.filter(x=>x.view).map(x=>this.instKey(x)); this.keySel=-1; this.renderKeys(); this.toast(this.scanKeys.length+' keyframes, one per instance — ▶ Preview, drag on the timeline to retime'); });
        item('Export every instance as an image…',()=>this.exportInstances(sc)); } }
    else item('Open',()=>here());
    m.appendChild(document.createElement('hr'));
    if(sc.demo){ m.style.left=Math.min(innerWidth-330,r.left)+'px'; m.classList.add('on'); m.style.top=Math.max(8,r.top-4-m.offsetHeight)+'px'; setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m.contains(e.target)){ m.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0); return; }
    item('Rename…',async()=>{ const n=await this.ask('Rename scan',sc.name); if(n){ sc.name=n.slice(0,60); this.renderStrip(); this.saveSoon(); } });
    item('Show in Finder',()=>Native.call('reveal',{path:sc.path}).catch(()=>{}));
    item('Rebuild thumbnail',()=>{ sc.thumb=null; if(this.scanPath===sc.path){ Engine.dirty=true; } else this.loadScanPath(sc.path); });
    item('Remove from library',()=>{ this.scans=this.scans.filter(x=>x!==sc); (this.hiddenScans=this.hiddenScans||[]).push(sc.path); this.renderStrip(); this.saveSoon(); this.toast('Removed from the strip — the files stay in Documents/Splat/scans'); });
    m.style.left=Math.min(innerWidth-330,r.left)+'px'; m.classList.add('on'); m.style.top=Math.max(8,r.top-4-m.offsetHeight)+'px';
    setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m.contains(e.target)){ m.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0);
  },
  // ---- copy / paste settings: pick which parts travel (⌘⇧C), paste onto this photo and every selected one (⌘⇧V)
  COPY_GROUPS:[['film','Film stock, print & format',['stock','paper','filmAmt','format','autoExp','push','hlExpand','edgeText','edgeCustom','frameNo','frameTone','border'],1],
    ['wb','White balance',['temp','tint'],1],['tone','Exposure & tone',['ev','contrast','highlights','shadows','whites','blacks'],1],['presence','Vibrance & saturation',['vibrance','saturation'],1],
    ['curve','Tone curve',['curve'],1],['color','HSL & colour grading',['hslH','hslS','hslL','gShH','gShS','gShL','gMidH','gMidS','gMidL','gHiH','gHiS','gHiL','gBlend','gBalance'],1],
    ['detail','Sharpening & noise',['sharpen','sharpRadius','nr','nrColor'],1],['grain','Grain, halation & glow',['grain','grainSize','grainRough','halation','glow'],1],['lens','Lens falloff & softness',['falloff','softness'],1],
    ['crop','Crop & rotation',['crop','angle','rot','flip','aspect'],0],['masks','Masks',['masks'],0],['studio','Studio effects (B&W, toning, double exposure, leaks, dust, frames, analog…)',null,1]],
  groupKeys(id){ const g=this.COPY_GROUPS.find(x=>x[0]===id); if(g[2]) return g[2]; const taken=new Set(this.COPY_GROUPS.flatMap(x=>x[2]||[]).concat(['off','lookUndo'])); return Object.keys(DEFAULTS).filter(k=>!taken.has(k)); },
  async copyDialog(){ if(!this.cur){ this.toast('Nothing to copy'); return; }
    let on=this._copyOn; if(!on){ try{ on=JSON.parse(localStorage.getItem('darkroom.copyGroups')); }catch(e){} } on=on||Object.fromEntries(this.COPY_GROUPS.map(g=>[g[0],!!g[3]]));
    const body=$('#dlgBody'); body.innerHTML=''; const h=$('#dlg h2'), ok=$('#dlgOk'), keepH=h.textContent, keepOk=ok.textContent; h.textContent='Copy settings'; ok.textContent='Copy';
    const grid=document.createElement('div'); grid.className='copyGrid'; body.appendChild(grid);
    const boxes=this.COPY_GROUPS.map(g=>{ const l=document.createElement('label'); l.className='chk'; l.innerHTML='<input type="checkbox"><span></span>'; l.querySelector('span').textContent=g[1]; const c=l.querySelector('input'); c.checked=!!on[g[0]]; c.onchange=()=>on[g[0]]=c.checked; grid.appendChild(l); return c; });
    const row=document.createElement('div'); row.className='btnrow'; body.appendChild(row);
    UI.button(row,'All',()=>{ this.COPY_GROUPS.forEach((g,i)=>{ on[g[0]]=true; boxes[i].checked=true; }); }); UI.button(row,'None',()=>{ this.COPY_GROUPS.forEach((g,i)=>{ on[g[0]]=false; boxes[i].checked=false; }); }); UI.button(row,'Look only',()=>{ this.COPY_GROUPS.forEach((g,i)=>{ on[g[0]]=!['wb','tone','crop','masks'].includes(g[0]); boxes[i].checked=on[g[0]]; }); });
    UI.note(body,'Paste with <b>⌘⇧V</b> — onto this photo, or onto every selected photo at once (⌘-click or ⇧-click thumbnails to select).');
    $('#dlg').classList.add('on'); const go=await new Promise(r=>{ ok.onclick=()=>r(true); $('#dlgCancel').onclick=()=>r(false); }); $('#dlg').classList.remove('on'); h.textContent=keepH; ok.textContent=keepOk; if(!go) return;
    this._copyOn=on; try{ localStorage.setItem('darkroom.copyGroups',JSON.stringify(on)); }catch(e){}
    const keys=this.COPY_GROUPS.filter(g=>on[g[0]]).flatMap(g=>this.groupKeys(g[0])); if(!keys.length){ this.toast('Nothing ticked'); return; }
    const src=Engine.p, o={}; keys.forEach(k=>{ if(k in src) o[k]=cloneParams(src[k]); });
    const offs={}; for(const sec in SECTIONS) if(SECTIONS[sec].some(k=>keys.includes(k))) offs[sec]=!!(src.off||{})[sec]; if(on.studio) for(const k in (src.off||{})) if(!(k in SECTIONS)) offs[k]=!!src.off[k];
    this.clip={o,offs,n:this.COPY_GROUPS.filter(g=>on[g[0]]).length}; this.toast(`Copied ${this.clip.n} part${this.clip.n>1?'s':''} of the edit — ⌘⇧V to paste`); },
  async pasteSettings(){ const c=this.clip; if(!c){ this.toast('Copy settings first (⌘⇧C)'); return; } if(!this.cur) return;
    const fn=base=>{ Object.assign(base,cloneParams(c.o)); base.off=Object.assign({},base.off||{}); for(const k in c.offs){ if(c.offs[k]) base.off[k]=true; else delete base.off[k]; } return base; };
    const n=this.applyToOthers(b=>fn(b),'Paste settings'); await this.applySettings(fn(cloneParams(Engine.p))); this.commit(); this.toast(n?`Pasted onto ${n+1} photos`:'Settings pasted'); },
  // ---- print layout: several photos on one page with margins, gaps and captions, rendered at 300 dpi
  PAPERS:{letter:['Letter 8.5×11',8.5,11],a4:['A4',8.27,11.69],p4x6:['4×6',4,6],p5x7:['5×7',5,7],p8x10:['8×10',8,10],p11x14:['11×14',11,14],p13x19:['13×19',13,19],a3:['A3',11.69,16.54]},
  async printDialog(){ const photos=this.selected().filter(x=>x.kind!=='scanlook'); if(!photos.length){ this.toast('Select photos first (⌘-click in the strip)'); return; }
    const st=Object.assign({paper:'letter',land:false,cols:2,rows:2,margin:0.5,gap:0.25,fill:false,caption:true,keyline:false,bg:'white'},this._printPrefs||{}); if(!this._printPrefs){ const n=photos.length; const g=n<=1?[1,1]:n<=2?[1,2]:n<=4?[2,2]:n<=6?[2,3]:n<=9?[3,3]:[4,5]; st.cols=g[0]; st.rows=g[1]; }
    const body=$('#dlgBody'); body.innerHTML=''; const h=$('#dlg h2'), ok=$('#dlgOk'), kh=h.textContent, ko=ok.textContent; h.textContent='Print layout — '+photos.length+' photo'+(photos.length>1?'s':''); ok.textContent='Save pages…';
    const pv=document.createElement('canvas'); pv.className='printPrev'; body.appendChild(pv); const info=document.createElement('div'); info.className='note'; body.appendChild(info);
    const draw=()=>{ const [,pw0,ph0]=this.PAPERS[st.paper], pw=st.land?Math.max(pw0,ph0):Math.min(pw0,ph0), ph=st.land?Math.min(pw0,ph0):Math.max(pw0,ph0); const S=Math.min(320/pw,240/ph); pv.width=pw*S*2; pv.height=ph*S*2; pv.style.width=pw*S+'px'; pv.style.height=ph*S+'px';
      const x=pv.getContext('2d'); x.scale(2,2); x.fillStyle=st.bg==='black'?'#111':'#fff'; x.fillRect(0,0,pw*S,ph*S); const cells=this.printCells(st,pw,ph);
      const per=st.cols*st.rows, pages=Math.ceil(photos.length/per); cells.forEach((c,i)=>{ const it=photos[i]; x.strokeStyle='#bbb'; x.lineWidth=0.5; if(!it){ x.strokeRect(c.x*S,c.y*S,c.w*S,c.h*S); return; }
        const im=it._pim||(it.thumb&&(it._pim=Object.assign(new Image(),{src:it.thumb,onload:draw}))); if(im&&im.complete&&im.naturalWidth){ const r=this.printFit(im.naturalWidth,im.naturalHeight,c,st.fill); x.save(); x.beginPath(); x.rect(c.x*S,c.y*S,c.w*S,c.h*S); x.clip(); x.drawImage(im,r.x*S,r.y*S,r.w*S,r.h*S); x.restore(); } else { x.fillStyle='#999'; x.fillRect(c.x*S,c.y*S,c.w*S,c.h*S); } });
      info.textContent=`${pages} page${pages>1?'s':''} · ${this.PAPERS[st.paper][0]} at 300 dpi · each photo up to ${(cells[0].w).toFixed(1)}×${(cells[0].h).toFixed(1)} in`; };
    UI.select(body,'prPaper','Paper',()=>Object.entries(this.PAPERS).map(([k,v])=>[k,v[0]]),()=>st.paper,v=>{ st.paper=v; draw(); });
    UI.seg(body,'prOr','Orientation',[['false','Portrait'],['true','Landscape']],()=>String(st.land),v=>{ st.land=v==='true'; draw(); });
    UI.seg(body,'prGrid','Layout',[['1x1','1'],['1x2','2'],['2x2','4'],['2x3','6'],['3x3','9'],['3x4','12'],['4x5','20']],()=>st.cols+'x'+st.rows,v=>{ const [c,r]=v.split('x').map(Number); st.cols=st.land?r:c; st.rows=st.land?c:r; draw(); });
    UI.slider(body,'prMargin','Margin',{min:0,max:2,step:0.05,def:0.5,get:()=>st.margin,set:v=>{ st.margin=v; draw(); },fmt:x=>x.toFixed(2)+' in'});
    UI.slider(body,'prGap','Gap',{min:0,max:1.5,step:0.05,def:0.25,get:()=>st.gap,set:v=>{ st.gap=v; draw(); },fmt:x=>x.toFixed(2)+' in'});
    UI.seg(body,'prFill','Photos',[['false','Fit whole photo'],['true','Fill the cell (crop)']],()=>String(st.fill),v=>{ st.fill=v==='true'; draw(); });
    UI.seg(body,'prBg','Paper colour',[['white','White'],['black','Black']],()=>st.bg,v=>{ st.bg=v; draw(); });
    UI.check(body,'prCap','File names under photos',()=>st.caption,v=>{ st.caption=v; draw(); }); UI.check(body,'prKey','Thin keyline round each photo',()=>st.keyline,v=>{ st.keyline=v; draw(); });
    draw(); $('#dlg').classList.add('on'); const go=await new Promise(r=>{ ok.onclick=()=>r(true); $('#dlgCancel').onclick=()=>r(false); }); $('#dlg').classList.remove('on'); h.textContent=kh; ok.textContent=ko; if(!go) return;
    this._printPrefs=Object.assign({},st); await this.renderPrint(photos,st); },
  printCells(st,pw,ph){ const cap=st.caption?0.22:0, W=pw-2*st.margin, H=ph-2*st.margin, cw=(W-(st.cols-1)*st.gap)/st.cols, ch=(H-(st.rows-1)*st.gap)/st.rows-cap, out=[];
    for(let r=0;r<st.rows;r++) for(let c=0;c<st.cols;c++) out.push({x:st.margin+c*(cw+st.gap),y:st.margin+r*(ch+cap+st.gap),w:cw,h:ch,cap}); return out; },
  printFit(iw,ih,c,fill){ const s=fill?Math.max(c.w/iw,c.h/ih):Math.min(c.w/iw,c.h/ih), w=iw*s, h=ih*s; return {x:c.x+(c.w-w)/2,y:c.y+(c.h-h)/2,w,h}; },
  async renderPrint(photos,st){ const DPI=300, [,pw0,ph0]=this.PAPERS[st.paper], pw=st.land?Math.max(pw0,ph0):Math.min(pw0,ph0), ph=st.land?Math.min(pw0,ph0):Math.max(pw0,ph0), per=st.cols*st.rows, pages=Math.ceil(photos.length/per), keep=this.cur;
    let dir=null, base=(photos[0].name||'Print').replace(/\.[^.]+$/,'')+' — print';
    if(Native.available){ const pth=await Native.call('pickSave',{name:base+(pages>1?' 1':'')+'.jpg',dir:this.info&&this.info.splatDir+'/exports'}); if(!pth) return; dir=pth.replace(/\/[^\/]+$/,''); base=pth.split('/').pop().replace(/( 1)?\.jpe?g$/i,''); }
    for(let pg=0;pg<pages;pg++){ const cv=document.createElement('canvas'); cv.width=Math.round(pw*DPI); cv.height=Math.round(ph*DPI); const x=cv.getContext('2d'); x.fillStyle=st.bg==='black'?'#0d0d0d':'#fff'; x.fillRect(0,0,cv.width,cv.height);
      const cells=this.printCells(st,pw,ph);
      for(let i=0;i<per;i++){ const it=photos[pg*per+i]; if(!it) break; const c=cells[i]; this.busy(`Print page ${pg+1}/${pages} — ${it.name}`); await this.select(it.id); await Engine.ensureLuts(Engine.p);
        const u=this.renderThumb(Engine.p,Math.min(4096,Math.round(Math.max(c.w,c.h)*DPI*(st.fill?1.6:1)))); if(!u) continue; const im=await new Promise(r=>{ const m=new Image(); m.onload=()=>r(m); m.onerror=()=>r(null); m.src=u; }); if(!im) continue;
        const r=this.printFit(im.width,im.height,c,st.fill); x.save(); x.beginPath(); x.rect(c.x*DPI,c.y*DPI,c.w*DPI,c.h*DPI); x.clip(); x.drawImage(im,r.x*DPI,r.y*DPI,r.w*DPI,r.h*DPI); x.restore();
        if(st.keyline){ x.strokeStyle=st.bg==='black'?'#888':'#222'; x.lineWidth=2; const k=st.fill?c:r; x.strokeRect(k.x*DPI,k.y*DPI,k.w*DPI,k.h*DPI); }
        if(st.caption){ x.fillStyle=st.bg==='black'?'#aaa':'#444'; x.font=`${Math.round(0.11*DPI)}px "Helvetica Neue",Arial`; x.textAlign='center'; x.fillText(it.name.replace(/\.[^.]+$/,''),(c.x+c.w/2)*DPI,(c.y+c.h+0.16)*DPI,c.w*DPI); } }
      const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.95)), name=base+(pages>1?' '+(pg+1):'')+'.jpg';
      if(dir) await Native.call('writeFile',{path:dir+'/'+name,base64:await this.blobB64(blob)}); else { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); } }
    if(keep&&this.cur!==keep) await this.select(keep.id); this.busy(); this.toast('Saved '+pages+' print page'+(pages>1?'s':'')+' (300 dpi JPEG)'); },
  shortcutSheet(){ let el=$('#keysheet'); if(el){ el.remove(); return; } el=document.createElement('div'); el.id='keysheet'; el.className='modal on';
    const S=[['Everywhere',[['G / D / T / S','Library · Develop · Studio · 3D Scan'],['⌘Z / ⇧⌘Z','Undo / redo'],['⌘E','Export'],['⌘P','Print layout'],['⌘O','Import'],['⇧⌘C / ⇧⌘V','Copy settings (choose parts) / paste'],['⇧⌘R','Reset to original'],['?','This sheet']]],
      ['Photos',[['0–5','Star rating'],['P / X / U','Pick / reject / clear flag'],['← →','Previous / next photo'],['⌘A','Select all'],['⌘F','Search the library'],['⌘D / ⇧⌘D','Duplicate with edit / as original'],['⌘G / ⇧⌘G','Stack / unstack'],["⌘'",'Save as version'],['⌫','Remove from library']]],
      ['Develop',[['W','White-balance eyedropper'],['R','Crop & straighten'],['M','Masks'],['C','Compare'],['\\','Before / after'],['|','Split view'],['Z','Zoom 1:1'],['J','Clipping warning']]],
      ['3D Scan',[['drag','Orbit'],['⇧-drag / right-drag / arrows','Move the camera'],['⇧+arrows','Orbit'],['scroll / + −','Dolly in / out'],['click','Focus'],['double-click','Orbit pivot'],['L','Level'],['space','Expose a frame'],['⇧S','Save an instance (keyframes + camera + edits)']]]];
    el.innerHTML='<div class="sheet keysheet"><h2>Keyboard shortcuts</h2><div class="kcols">'+S.map(([t,r])=>'<div><h4>'+t+'</h4>'+r.map(([k,d])=>'<div class="krow"><kbd>'+k+'</kbd><span>'+d+'</span></div>').join('')+'</div>').join('')+'</div><div class="dlgBtns"><button class="tbtn accent">Close</button></div></div>';
    el.onclick=e=>{ if(e.target===el||e.target.tagName==='BUTTON') el.remove(); }; document.body.appendChild(el); },
  // ---- scan snapshots: camera + lens + film + Develop + Studio, saved under the scan they came from
  snapKey(path){ return path||'__demo'; },
  snapsFor(path){ return ((this.scanSnaps=this.scanSnaps||{})[this.snapKey(path)])||[]; },
  viewThumb(size){ const L=this._lastL, v=$('#view'); if(!L) return null; const c=document.createElement('canvas'); const s=size/Math.max(L.iw,L.ih); c.width=Math.round(L.iw*s); c.height=Math.round(L.ih*s);
    c.getContext('2d').drawImage(v,L.ix,L.H-L.iy-L.ih,L.iw,L.ih,0,0,c.width,c.height); return c.toDataURL('image/jpeg',.82); },
  grabView(size){ return new Promise(r=>{ this._snapCb=()=>r(this.viewThumb(size)); Engine.dirty=true; setTimeout(()=>{ if(this._snapCb){ this._snapCb=null; r(null); } },3000); }); },
  async saveSnap(update){ if(!Splat.scene){ this.toast('Open a scan first'); return; }
    const list=(this.scanSnaps=this.scanSnaps||{})[this.snapKey(this.scanPath)]=this.snapsFor(this.scanPath).slice(); let sn=update&&list.find(x=>x.id===update);
    if(!sn){ const st=Engine.stock(Engine.p.stock), L=LENSES.find(l=>l.id===Splat.cam.lens); const name=await this.ask('Name this instance (keyframes, camera and every edit)',[(st&&st.id!=='original'?st.name:''),(L?L.name.split(' · ')[0]:'')].filter(Boolean).join(' · ')||'Instance '+(list.length+1)); if(!name) return;
      sn={id:'s'+Date.now().toString(36),name:name.slice(0,60)}; list.push(sn); }
    { const c=Splat.cam; sn.view={yaw:c.yaw,pitch:c.pitch,dist:c.dist,target:c.target.slice(),roll:c.roll,up:c.up,model:c.model?JSON.parse(JSON.stringify(c.model)):null,scale:c.scale,focusLock:c.focusLock?JSON.parse(JSON.stringify(c.focusLock)):null}; } sn.keys=JSON.parse(JSON.stringify(this.scanKeys||[])); sn.fit=Splat.fit?JSON.parse(JSON.stringify(Splat.fit)):null; sn.cam=this.camSnap(); sn.look=cloneParams(this.linkMerge(Engine.p)); delete sn.look.lookUndo; sn.t=Date.now(); sn.thumb=await this.grabView(220)||sn.thumb||null; this.curSnap=sn.id;
    const sc=this.scans.find(x=>x.path===this.scanPath); if(sc) sc.snapOpen=true; this.renderStrip(); this.saveSoon(); this.toast(update?'Updated “'+sn.name+'”':'Saved instance “'+sn.name+'” — it’s next to the scan in the strip'); },
  instData(){ const c=Splat.cam; return {scanPath:this.scanPath,scanName:this.scanName,cam:this.camSnap(),view:{yaw:c.yaw,pitch:c.pitch,dist:c.dist,target:c.target.slice(),roll:c.roll,up:c.up,model:c.model?JSON.parse(JSON.stringify(c.model)):null,scale:c.scale,focusLock:c.focusLock?JSON.parse(JSON.stringify(c.focusLock)):null},
    look:(()=>{ const l=cloneParams(this.linkMerge(Engine.p)); delete l.lookUndo; return l; })(),keys:JSON.parse(JSON.stringify(this.scanKeys||[])),fit:Splat.fit?JSON.parse(JSON.stringify(Splat.fit)):null}; },
  async rerender3D(it){ const back=this.module==='scan'?'develop':this.module, keepId=it.id; await this.openInstOf(it); if(this.module!=='scan'||!Splat.scene) return;
    this.busy('Re-rendering “'+it.name+'” from the scan…'); await new Promise(r=>setTimeout(r,600));
    const [sw,sh]=Splat.sensor(); const long=3600, w=Math.round(sw>=sh?long:long*sw/sh), h=Math.round(sw>=sh?long*sh/sw:long); const rt=GLU.target(w,h,'rgba16f'); Splat.render(rt);
    it.src={tex:rt.t,w,h,dispRef:true,encoded:true,flipY:true,key:Math.random()}; it.thumb=null; it.thumbStale=true;
    if(Native.available&&this.info){ try{ const rt8=GLU.target(w,h,'rgba8'); Splat.render(rt8); const gl=Engine.gl, px=new Uint8Array(w*h*4); gl.bindFramebuffer(gl.FRAMEBUFFER,rt8.f); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); GLU.free(rt8);
      const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'), id=x.createImageData(w,h); for(let y=0;y<h;y++) id.data.set(px.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4); x.putImageData(id,0,0);
      const path=this.info.splatDir+'/frames/'+it.name.replace(/[^\w\- ]+/g,'_')+'_'+Date.now()+'.png'; await Native.call('writeFile',{path,base64:await this.blobB64(await new Promise(r=>c.toBlob(r,'image/png')))}); it.path=path; }catch(e){} }
    it.inst=this.instData(); this.busy(); this.setModule(back); await this.select(keepId); this.saveSoon(); this.toast('Re-rendered “'+it.name+'” — its own edits are kept'); },
  instKey(sn){ const v=sn.view, c=sn.cam||{}; return {yaw:v.yaw,pitch:v.pitch,dist:v.dist,target:v.target.slice(),focus:c.focus!=null?c.focus:Splat.cam.focus,fnum:STOPS[c.stop!=null?c.stop:Splat.cam.stop],fmm:c.fmm||Splat.cam.fmm,roll:v.roll||0}; },
  async exportInstances(sc){ const sns=this.snapsFor(sc.path); if(!sns.length) return; let dir=null;
    if(Native.available){ dir=await Native.call('pickFolder',{dir:this.info&&this.info.splatDir+'/exports'}); if(!dir) return; }
    const st=Object.assign({size:'full',fmt:'jpeg',q:0.95,space:'p3',meta:false},this._exportPrefs||{}); this._cancelVideo=false; let n=0;
    for(const sn of sns){ if(this._cancelVideo) break; n++; this.busy(`Exporting instance ${n} / ${sns.length} — ${sn.name}  (Esc to stop)`); await this.openSnap(sc,sn); await new Promise(r=>setTimeout(r,400));
      await this.doExport(st, dir?dir+'/'+(sc.name||'scan').replace(/\.[^.]+$/,'')+' — '+sn.name.replace(/[\/:]/g,'-')+this.EXT[st.fmt]:null, true); }
    this.busy(); this.toast('Exported '+n+' instance'+(n>1?'s':'')+(dir?' to '+dir.split('/').pop():'')); },
  async openInstOf(it){ const d=it.inst; if(!d) return; const sc=this.scans.find(x=>x.path===d.scanPath)||(d.scanPath?{path:d.scanPath,name:d.scanName}:{path:null,demo:true});
    if(d.scanPath&&!this.scans.some(x=>x.path===d.scanPath)){ try{ const st=await Native.call('stat',{paths:[d.scanPath]}); if(!st[0]||st[0].size<0){ this.toast('That scan file isn’t there any more ('+d.scanName+')'); return; } }catch(e){} }
    await this.openSnap(sc,Object.assign({id:'lib_'+it.id,name:it.name},d)); },
  async openSnap(sc,sn){ if(this.module!=='scan') this.setModule('scan');
    if(sc.path!==this.scanPath||!Splat.scene){ if(sc.path) await this.loadScanPath(sc.path); else await this.loadDemo(); }
    if(this.scanLink&&this.scanLink!=='off') this.setScanLink('off');
    this.applyCam(sn.cam||{}); if(sn.view){ const v=JSON.parse(JSON.stringify(sn.view)); Object.assign(Splat.cam,v); Splat.lastSortView=null; Engine.dirty=true; } await this.applySettings(cloneParams(sn.look||{})); this.commit(); if(sn.keys&&sn.keys.length){ this.scanKeys=JSON.parse(JSON.stringify(sn.keys)); this.keySel=-1; this.renderKeys(); } this.curSnap=sn.id; this.renderStrip(); this.toast('Back in “'+sn.name+'” — export it, or keep editing and choose ⋯ → Update'); },
  snapMenu(sc,sn,anchor){ const m=$('#ctxMenu'); m.innerHTML=''; const r=anchor.getBoundingClientRect();
    const item=(label,fn)=>{ const b=document.createElement('button'); b.textContent=label; b.onclick=()=>{ m.classList.remove('on'); fn(); }; m.appendChild(b); };
    const here=()=>this.curSnap===sn.id&&this.scanPath===sc.path;
    item('Open',()=>this.openSnap(sc,sn));
    item('Update with the current view',async()=>{ if(!here()) await this.openSnap(sc,sn).then(()=>{}); if(here()) this.saveSnap(sn.id); });
    item('Save image…',async()=>{ if(!here()) await this.openSnap(sc,sn); this.exportDialog(); });
    if((sn.keys||[]).length>1) item('Export its video…',async()=>{ if(!here()) await this.openSnap(sc,sn); this.orbitDialog(); });
    item('Save its edits as a look…',async()=>{ if(!here()) await this.openSnap(sc,sn); this.saveLookPreset(); });
    if(sc.path===this.scanPath&&Splat.scene&&sn.view) item('Add its view as a keyframe',()=>{ this.scanKeys=this.scanKeys||[]; this.scanKeys.push(this.instKey(sn)); this.renderKeys(); this.toast('Keyframe '+this.scanKeys.length+' from “'+sn.name+'”'); });
    if((sn.keys||[]).length>1&&this.scans.filter(x=>x.path!==sc.path).length) item('Use this move on another scan…',()=>this.pickScan('Use “'+sn.name+'” camera move on…',sc.path,t=>this.useMoveOn(sc,sn,t)));
    { const others=this.snapsFor(sc.path).filter(x=>x!==sn); if(others.length) item('Compare side by side with…',()=>{ const m2=$('#ctxMenu'); m2.innerHTML='<div class="mtitle">Compare “'+sn.name.replace(/</g,'&lt;')+'” with…</div>'; others.forEach(o=>{ const b=document.createElement('button'); b.textContent=o.name; b.onclick=()=>{ m2.classList.remove('on'); this.compareInstances(sc,sn,o); }; m2.appendChild(b); }); m2.classList.add('on'); setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m2.contains(e.target)){ m2.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0); }); }
    item('Rename…',async()=>{ const n=await this.ask('Rename instance',sn.name); if(n){ sn.name=n.slice(0,60); this.renderStrip(); this.saveSoon(); } });
    item('Delete',()=>{ if(!confirm('Delete the instance “'+sn.name+'”? (the scan itself stays)')) return; const k=this.snapKey(sc.path); this.scanSnaps[k]=this.snapsFor(sc.path).filter(x=>x!==sn); if(this.curSnap===sn.id) this.curSnap=null; this.renderStrip(); this.saveSoon(); });
    m.style.left=Math.min(innerWidth-260,r.left)+'px'; m.classList.add('on'); m.style.top=Math.max(8,r.top-4-m.offsetHeight)+'px';
    setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m.contains(e.target)){ m.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0); },
  async compareInstances(sc,a,b){ const shots=[]; for(const sn of [a,b]){ this.busy('Rendering “'+sn.name+'”…'); await this.openSnap(sc,sn); await new Promise(r=>setTimeout(r,500)); shots.push(await this.grabView(1400)); } this.busy();
    let el=$('#cmpOverlay'); if(el) el.remove(); el=document.createElement('div'); el.id='cmpOverlay'; const esc=t=>t.replace(/</g,'&lt;');
    el.innerHTML=`<div class="cmpTop"><span>Compare instances</span><button class="tbtn" data-a="wipe">Wipe</button><button class="tbtn" data-a="close">Close  Esc</button></div><div class="cmpBody"><figure><img src="${shots[0]||''}"><figcaption>${esc(a.name)} <button class="tbtn" data-a="0">Open</button></figcaption></figure><figure><img src="${shots[1]||''}"><figcaption>${esc(b.name)} <button class="tbtn" data-a="1">Open</button></figcaption></figure></div>`;
    document.body.appendChild(el); const close=()=>{ el.remove(); removeEventListener('keydown',kd,true); }, kd=e=>{ if(e.key==='Escape'){ e.stopPropagation(); close(); } }; addEventListener('keydown',kd,true);
    el.onclick=async e=>{ const t=e.target.dataset.a; if(t==='close'||e.target===el) close(); else if(t==='0'||t==='1'){ close(); await this.openSnap(sc,[a,b][+t]); }
      else if(t==='wipe'){ el.classList.toggle('wipe'); e.target.textContent=el.classList.contains('wipe')?'Side by side':'Wipe'; } };
    el.querySelector('.cmpBody').onpointermove=e=>{ if(!el.classList.contains('wipe')) return; const r=e.currentTarget.getBoundingClientRect(); el.style.setProperty('--wx',((e.clientX-r.left)/r.width*100)+'%'); }; },
  pickScan(title,exclude,fn){ const m=$('#ctxMenu'); m.innerHTML='<div class="mtitle"></div>'; m.firstChild.textContent=title;
    this.scans.filter(x=>x.path!==exclude).forEach(sc=>{ const b=document.createElement('button'); b.textContent=sc.name; b.onclick=()=>{ m.classList.remove('on'); fn(sc); }; m.appendChild(b); });
    m.classList.add('on'); setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m.contains(e.target)){ m.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0); },
  async useMoveOn(srcSc,sn,dst){ const f1=sn.fit; await this.loadScanPath(dst.path); const f2=Splat.fit;
    const K=JSON.parse(JSON.stringify(sn.keys)); if(f1&&f2){ const k=f2.r/f1.r; K.forEach(q=>{ q.target=q.target.map((v,j)=>f2.ctr[j]+(v-f1.ctr[j])*k); q.dist*=k; q.focus*=k; }); }
    this.scanKeys=K; this.keySel=-1; this.renderKeys(); this.keyCamAt(this.keyTimeline(1),0); Splat.lastSortView=null; Engine.dirty=true;
    this.toast('“'+sn.name+'” move fitted to '+dst.name+(f1?'':' (not rescaled: update that instance once so it records its scan size)')+' — ▶ Preview, then save an instance here'); },
  scanThumb(){ const sc=this.scans.find(x=>x.path===this.scanPath); if(!sc||sc.thumb||!Splat.sortedCount) return;
    if((this._thumbWait=(this._thumbWait||0)+1)<20) return; this._thumbWait=0;
    const L=this._lastL, v=$('#view'); const c=document.createElement('canvas'); const s=160/Math.max(L.iw,L.ih); c.width=Math.round(L.iw*s); c.height=Math.round(L.ih*s);
    c.getContext('2d').drawImage(v,L.ix,L.H-L.iy-L.ih,L.iw,L.ih,0,0,c.width,c.height); sc.thumb=c.toDataURL('image/jpeg',.8); this.renderStrip(); this.saveSoon(); },
  // the demo is a real scan shipped with the app (data/demo.splat); the procedural scene is only a fallback
  async loadDemo(){ this.busy('Loading demo scan…');
    try{ const [b,j]=await Promise.all([fetch('data/demo.splat'),fetch('data/demo.json')]); if(!b.ok) throw 0; const buf=await b.arrayBuffer(), meta=j.ok?await j.json():{};
      const s=parseSplat(buf); this._scanBytes=buf.byteLength; Splat.load(s); const v=meta.view||{};
      Object.assign(Splat.cam,{up:v.up||'Y-down',model:v.model||null,roll:v.roll||0,scale:v.scale||Splat.cam.scale}); if(v.lens) this.setLens(v.lens); if(meta.cam) Object.assign(Splat.cam,meta.cam); Splat.frame();
      // focus on whatever is in the middle of the frame
      setTimeout(()=>{ const L=this._lastL; if(!L) return; const hit=Splat.pick(L.iw/2,L.ih/2,L.iw,L.ih); if(hit){ Splat.cam.focusLock=hit; Engine.dirty=true; } },400);
      this.scanName=meta.name||'Demo scan'; this.scanPath=null; this.scanKey=null; this.keysToScan(); this.applyClean(); this.busy(); this.setModule('scan'); UI.refresh(); setTimeout(()=>this.renderScanInfo(),50); }
    catch(e){ setTimeout(()=>{ Splat.load(demoScene()); this.scanName='Demo still life'; this.scanPath=null; this.scanKey=null; this.keysToScan(); this.applyClean(); this.busy(); this.setModule('scan'); UI.refresh(); },30); } },
  async newScan(input){
    if(!Native.available){ this.toast('Building scans runs in the Mac app'); return; }
    if(!input){ const p=await Native.call('open',{files:true,dirs:true,multiple:false,title:'Choose an orbit video, or a folder of photos',dir:this.info&&this.info.splatDir+'/captures'}); if(!p||!p[0]) return; input=p[0]; }
    this._pipeOut=(this.info&&this.info.splatDir||'')+'/scans/'+input.split('/').pop().replace(/\.[^.\/]+$/,''); this._pipeState='running';
    this._pipeBusy=true; $('#pipe').classList.add('on'); $('#pipeLog').textContent=''; $('#pipeTitle').textContent='Building scan from '+input.split('/').pop()+'…'; $('#pipeClose').disabled=true;
    this.pipeStart();
    const job=Native.call('runPipeline',{input});
    this._pipeJob=null;
    try{ const r=await job; this._pipeBusy=false; this._pipeState=null; this.pipeMini(); Engine.dirty=true; $('#pipeClose').disabled=false; $('#pipe').classList.add('on');
      clearInterval(this._pt); if(r&&r.ply){ this.pipeDone(true); $('#pipeTitle').textContent='Scan ready'; await this.loadScanPath(r.ply); $('#pipe').classList.remove('on'); this.toast('Scan loaded — orbit, focus, then Add to library'); if(this._quitAfterScan){ this.saveNow&&this.saveNow(); setTimeout(()=>Native.call('quit').catch(()=>{}),1500); } }
      else { this._quitAfterScan=false; this.pipeDone(false); $('#pipeTitle').textContent='Scan failed (exit '+(r?r.code:'?')+') — see Details'; $('#pipeDetails').open=true; } }
    catch(e){ this._pipeBusy=false; $('#pipeTitle').textContent='Error: '+e.message; $('#pipeClose').disabled=false; }
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
      else if(/^@@state /.test(l)){ this._pipeState=l.slice(8).trim(); if(this._pipeState==='running'&&P.pausedAt){ P.t0+=Date.now()-P.pausedAt; if(P.s6) P.s6.t+=Date.now()-P.pausedAt; P.pausedAt=null; } this.pipeMini(); }
      else out+=l+'\n'; }
    if(out){ P.log=(P.log||'')+out; if(P.log.length>60000) P.log=P.log.slice(-40000); }
    // touch the page at most twice a second, and the log only when Details is open
    const now=Date.now(); if(now-(P.lastDraw||0)<500) return; P.lastDraw=now;
    if(P.log!==P.shown&&$('#pipeDetails').open){ const el=$('#pipeLog'); el.textContent=P.log; el.scrollTop=el.scrollHeight; P.shown=P.log; }
    this.pipeRender();
  },
  // ---- training controls: pause (and preview), resume, finish now, hide
  pipeCtl(cmd){ if(!this._pipeOut) return; Native.call('writeFile',{path:this._pipeOut+'/.control',base64:btoa(cmd)}).catch(e=>this.toast('Could not reach the trainer: '+e.message));
    const P=this.pp; if(cmd==='pause'&&P&&!P.pausedAt) P.pausedAt=Date.now(); this._pipeState=cmd==='pause'?'paused':cmd==='finish'?'finishing':'running';
    this._pipeBusy=cmd!=='pause'&&$('#pipe').classList.contains('on'); this.pipeMini(); },
  finishThenQuit(){ this._quitAfterScan=true; this.pipeCtl('finish'); this.toast('Finishing the scan with its newest checkpoint — the app will quit when it’s saved'); },
  async previewCheckpoint(){ let files=[]; try{ files=await Native.call('listDir',{path:this._pipeOut}); }catch(e){}
    const ck=files.filter(f=>/^export_\d+\.ply$/.test(f)).sort(); if(!ck.length){ this.toast('No checkpoint yet — the first one is saved at step 2,500'); return; }
    const f=ck[ck.length-1]; $('#pipe').classList.remove('on'); this._pipeBusy=false; this.pipeMini(); this.setModule('scan');
    await this.loadScanPath(this._pipeOut+'/'+f); this.toast('Previewing checkpoint at step '+(+f.match(/\d+/)[0]).toLocaleString()+' — Resume when you’re done looking'); },
  pipeMini(){ const m=$('#pipeMini'); if(!m) return; const st=this._pipeState, shown=$('#pipe').classList.contains('on'), P=this.pp;
    const on=!!st&&!shown; m.classList.toggle('on',on); m.classList.toggle('paused',st==='paused');
    const k=P&&P.counts&&P.counts[6]; $('#pmText').textContent=(st==='paused'?'Training paused':st==='finishing'?'Finishing…':'Training')+(k?` · ${k[0].toLocaleString()} / ${k[1].toLocaleString()}`:'');
    $('#pmPause').textContent=st==='paused'?'Resume':'Pause'; $('#pmFinish').style.display=P&&P.stage===6&&st!=='finishing'?'':'none'; $('#pmPreview').style.display=P&&P.stage===6?'':'none';
    const sh=P&&P.stage===6&&st&&st!=='finishing'; $('#pipePause').style.display=sh?'':'none'; $('#pipeFinish').style.display=sh?'':'none'; $('#pipeHide').style.display=st?'':'none';
    $('#pipePause').textContent=st==='paused'?'Resume':'Pause & preview'; },
  pipeRender(){
    const P=this.pp; if(!P) return; if(P.pausedAt){ $('#pipeEta').textContent='Paused'; $('#pipeNow').textContent=`Paused at ${(P.done||0).toLocaleString()} / ${P.total.toLocaleString()} — the trainer is frozen, your Mac's graphics are free`; this.pipeMini(); return; } const W=this.PIPE_W, now=Date.now(), el=(now-P.t0)/1000;
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
    const b=Borders.margins(Engine.eff(Engine.p).border,sw,sh), pad=28*dpr; const fw0=sw*(1+b.l+b.r), fh0=sh*(1+b.t+b.b);
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
    const inst=this.instData(), it=this.newItem({inst,name:(this.scanName||'Scan').replace(/\.(ply|splat)$/,'')+' — frame '+n,kind:'scanframe',src,settings:Object.assign(this.scanParams(cloneParams(Engine.p)),{crop:{x:0,y:0,w:1,h:1},angle:0,rot:0,flip:false,aspect:'free'})});
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
    this.flash(); this.toast('Added to the library as “'+it.name+'” — right-click it later → Open in 3D to come back to this exact view');
  },
  flash(){ const v=$('#viewer'); v.animate([{background:'#fff'},{background:'#121212'}],{duration:250}); },

  // ---- camera presets (lens, format, aperture, character, flare, backdrop — not the scene's framing)
  CAM_KEYS:['format','portrait','fmm','stop','tilt','tiltDir','dof','bg','lens','swirl','catEye','anam','post','focus'],
  camSnap(){ const c=Splat.cam, o={}; this.CAM_KEYS.forEach(k=>o[k]=JSON.parse(JSON.stringify(c[k]??null))); return o; },
  applyCam(o){ const c=Splat.cam; this.CAM_KEYS.forEach(k=>{ if(k in o) c[k]=JSON.parse(JSON.stringify(o[k])); }); c.focusLock=null; this.lensNote(); this.scanKey=null; Splat.lastSortView=null; Engine.dirty=true; UI.refresh(); },
  renderScanLooks(){ const el=$('#scanLookList'); if(!el) return; el.innerHTML=''; const L=this.scanPresets||[];
    if(!L.length){ el.innerHTML='<div class="note">Found something you like? Press + to save the camera, lens, film and Studio look together.</div>'; return; }
    L.forEach((x,i)=>{ const r=document.createElement('div'); r.className='upreset'; const lens=LENSES.find(l=>l.id===(x.cam||{}).lens), st=x.look&&Engine.stock(x.look.stock);
      r.className='preset user'; r.innerHTML='<span class="pn"></span><span class="iso"></span><b class="pa uf'+(x.keepFocus?' on':'')+'" title="'+(x.keepFocus?'This look brings back its own focus point — click to leave your focus alone':(x.focusLock?'Click so this look also brings back the focus point it was saved with':'Re-save this look (+ with the same name) to store its focus point'))+'">◎</b><b class="pa del ux" title="Delete">×</b>'; r.querySelector('.pn').textContent=x.name;
      r.querySelector('.uf').onclick=e=>{ e.stopPropagation(); if(!x.focusLock&&!x.keepFocus){ this.toast('This look was saved before focus points were stored — set your focus, then press + and use the same name'); return; } x.keepFocus=!x.keepFocus; this.saveSoon(); this.renderScanLooks(); this.toast(x.keepFocus?'“'+x.name+'” now brings back its focus point too':'“'+x.name+'” leaves your focus alone'); };
      r.querySelector('.iso').textContent=[lens?lens.name.split(' · ')[0]:'',st?st.name:'',x.look?'':'camera only'].filter(Boolean).join(' · ');
      r.onclick=e=>{ if(e.target.classList.contains('ux')||e.target.classList.contains('uf')) return; this.applyScanLook(x); };
      r.querySelector('.ux').onclick=async e=>{ e.stopPropagation(); if(!confirm('Delete the scan look “'+x.name+'”?')) return; L.splice(i,1); this.saveSoon(); this.renderScanLooks(); this.buildScanPanels(); };
      el.appendChild(r); }); },
  async applyScanLook(x){ const c=Splat.cam, keepF={focus:c.focus,focusLock:c.focusLock?JSON.parse(JSON.stringify(c.focusLock)):null}; // a look never moves your focus point
    if(x.cam) this.applyCam(x.cam); if(x.look){ const l=cloneParams(x.look); delete l.__cam; await this.applySettings(l); } Object.assign(c,x.keepFocus&&x.focusLock?{focus:x.focus,focusLock:JSON.parse(JSON.stringify(x.focusLock))}:keepF); Engine.dirty=true; UI.refresh(); this.commit(); this.toast('Loaded “'+x.name+'”'); },
  async resetScanFull(){ const nk=(this.scanKeys||[]).length;
    if(!confirm('Start over from the original scan?\n\nCamera, lens, film, Develop and Studio edits'+(nk?' and your '+nk+' keyframes':'')+' go back to the start.\nYour saved instances and looks are kept, and ⌘Z undoes the edits.')) return;
    if(this.camDefaults) this.applyCam(this.camDefaults); Splat.frame(); Splat.lastSortView=null; this.scanKeys=[]; this.keySel=-1; this.renderKeys(); this.curSnap=null;
    await this.applySettings(withDefaults({})); this.commit(); this.renderStrip(); Engine.dirty=true; this.toast('Back to the original scan — a clean start'); },
  async resetScan(all){ if(all&&this.camDefaults) this.applyCam(this.camDefaults); await this.applySettings(withDefaults({})); this.commit(); this.toast(all?'Camera and look back to the original — History has every step':'Look back to the original — History has every step'); },
  async saveCamPreset(){ const L=LENSES.find(l=>l.id===Splat.cam.lens); const name=await this.ask('Name this scan look (camera + lens + film + Studio)',(L?L.name.split(' · ')[0]:'My camera')+' · ƒ/'+STOPS[Splat.cam.stop]); if(!name) return false;
    this.scanPresets=this.scanPresets||[]; const i=this.scanPresets.findIndex(x=>x.name===name); const e={name,cam:this.camSnap(),look:cloneParams(Engine.p),focus:Splat.cam.focus,focusLock:Splat.cam.focusLock?JSON.parse(JSON.stringify(Splat.cam.focusLock)):null,keepFocus:false}; if(i>=0&&this.scanPresets[i].keepFocus) e.keepFocus=true; if(i>=0) this.scanPresets[i]=e; else this.scanPresets.push(e);
    this.saveSoon(); this.buildScanPanels(); this.renderScanLooks(); this.toast('Saved scan look “'+name+'”'); },
  async deleteCamPreset(){ const L=this.scanPresets||[]; if(!L.length){ this.toast('No camera presets yet'); return; }
    const name=await this.ask('Delete which preset? ('+L.map(x=>x.name).join(', ')+')',L[L.length-1].name); const i=L.findIndex(x=>x.name===name); if(i<0) return; L.splice(i,1); this.saveSoon(); this.buildScanPanels(); this.toast('Deleted “'+name+'”'); },
  setLens(id){ const c=Splat.cam, L=LENSES.find(l=>l.id===id); c.lens=id; if(!L){ this.lensNote(); return; }
    c.format=L.format; c.fmm=L.fmm; c.swirl=L.swirl||0; c.catEye=L.catEye||0; c.anam=L.anam||0; c.tilt=L.tilt||0; c.tiltDir=L.tiltDir||0; c.post=Object.assign({},L.post);
    let i=0; STOPS.forEach((x,j)=>{ if(Math.abs(x-L.f)<Math.abs(STOPS[i]-L.f)) i=j; }); c.stop=i; if(L.landscape) c.portrait=false;
    UI.refresh(); this.lensNote(); this.scanKey=null; Engine.dirty=true; this.toast(L.name); },
  lensNote(){ const el=$('#lensNote'); if(!el) return; const L=LENSES.find(l=>l.id===Splat.cam.lens); el.innerHTML=L?L.desc:'Pick a lens to load its focal length, widest aperture and rendering character — then adjust anything.'; },
  // the scan view renders with the photo look from Develop plus the lens's own traits
  setClean(on){ this.cleanMode=!!on&&!!Splat.scene; document.body.classList.toggle('cleaning',this.cleanMode); const b=$('#cleanBtn'); if(b) b.classList.toggle('accent',this.cleanMode); $('#cleanPanel').style.display=this.cleanMode?'block':'none';
    if(!this.cleanMode){ $('#brushRing').style.display='none'; this.saveClean(); } else this.toast('Clean-up: paint over specks · [ ] brush size · ⌘Z undo'); },
  cleanKey(){ return this.snapKey(this.scanPath); },
  saveClean(){ const H=Splat.hidden; if(!H) return; this.cleanBy=this.cleanBy||{}; let any=false; const b=new Uint8Array((H.length+7)>>3); for(let i=0;i<H.length;i++) if(H[i]){ b[i>>3]|=1<<(i&7); any=true; }
    if(!any){ delete this.cleanBy[this.cleanKey()]; } else { let str=''; for(let i=0;i<b.length;i+=0x8000) str+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000)); this.cleanBy[this.cleanKey()]={n:H.length,b:btoa(str)}; } this.saveSoon(); },
  applyClean(){ this._cleanUndo=[]; const c=(this.cleanBy||{})[this.cleanKey()]; if(!c||!Splat.scene||c.n!==Splat.scene.n) return; const raw=atob(c.b), idx=[];
    for(let j=0;j<raw.length;j++){ const v=raw.charCodeAt(j); if(v) for(let k=0;k<8;k++) if(v&(1<<k)) idx.push(j*8+k); } Splat.hideIdx(idx,true); this.scanKey=null; Engine.dirty=true; },
  cleanStroke(e,v,first){ const L=this._lastL; if(!L) return; const r=v.getBoundingClientRect(), dpr=L.dpr, px=(e.clientX-r.left)*dpr-L.ix, py=(e.clientY-r.top)*dpr-(L.H-L.iy-L.ih);
    const idx=Splat.brushIdx(px,py,(this.cleanR||30)*dpr,L.iw,L.ih); if(first) this._cleanUndo.push([]); if(idx.length){ this._cleanUndo[this._cleanUndo.length-1].push(...idx); Splat.hideIdx(idx,true); this.scanKey=null; Splat.lastSortView=null; Engine.dirty=true; } },
  cleanUndo(){ const u=(this._cleanUndo||[]).pop(); if(!u){ this.toast('Nothing to undo'); return; } Splat.hideIdx(u,false); this.scanKey=null; Engine.dirty=true; this.saveClean(); },
  cleanRestore(){ const H=Splat.hidden; if(!H) return; const idx=[]; for(let i=0;i<H.length;i++) if(H[i]) idx.push(i); if(!idx.length) return; this._cleanUndo=this._cleanUndo||[]; Splat.hideIdx(idx,false); this.scanKey=null; Engine.dirty=true; this.saveClean(); this.toast('Restored '+idx.length.toLocaleString()+' splats'); },
  cleanFarPreview(){ clearTimeout(this._cfp); this._cfp=setTimeout(()=>{ const n=Splat.farIdx(this.cleanFar||5).length; const el=$('#cleanNote'); if(el&&this.cleanMode) el.innerHTML='<b>'+n.toLocaleString()+'</b> splats are further than '+(this.cleanFar||5).toFixed(1)+'× the subject size from its centre — press the button to remove them. Then paint any specks that are left.'; },150); },
  cleanFarApply(){ const idx=Splat.farIdx(this.cleanFar||5); if(!idx.length){ this.toast('Nothing that far out — try a smaller value'); return; } (this._cleanUndo=this._cleanUndo||[]).push(idx); Splat.hideIdx(idx,true); this.scanKey=null; Engine.dirty=true; this.saveClean(); this.toast('Removed '+idx.length.toLocaleString()+' far-away splats — ⌘Z to undo'); },
  linkSrc(){ const id=this.scanLinkFrom||'auto';
    if(id.startsWith('look:')){ const ps=(this.userPresets||[]).find(x=>x.name===id.slice(5)); if(ps) return {name:ps.name,settings:Object.assign(withDefaults({}),cloneParams(ps.settings)),look:true}; }
    if(id.startsWith('item:')){ const it=this.items.find(x=>x.id==id.slice(5)); if(it) return it; }
    const it=this._prevCur; return it&&this.items.includes(it)&&it.kind!=='scanlook'?it:null; },
  linkMerge(base){ const m=this.scanLink, it=this.linkSrc(); if(!m||m==='off'||!it) return base; const o=Object.assign({},base), src=it.settings;
    const skip=new Set(['crop','angle','rot','flip','aspect','masks','lookUndo']);
    const keys=m==='all'?Object.keys(DEFAULTS).filter(k=>!skip.has(k)&&k!=='off'):STUDIO_KEYS; keys.forEach(k=>{ if(k in src) o[k]=cloneParams(src[k]); });
    const off=Object.assign({},base.off||{}); const so=src.off||{}; for(const k in Object.assign({},off,so)){ const isStudio=!(k in SECTIONS); if(m==='all'||isStudio){ if(so[k]) off[k]=true; else delete off[k]; } } o.off=off; return o; },
  renderScanLink(){ const el=$('#scanLinkBox'); if(!el) return; const it=this.linkSrc(), m=this.scanLink||'off';
    { const sel=el.querySelector('.slFrom'), cur=this.scanLinkFrom||'auto', last=this._prevCur&&this.items.includes(this._prevCur)?this._prevCur:null; const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
      sel.innerHTML=`<option value="auto">The photo you last had open${last?' — '+esc(last.name.replace(/\.[^.]+$/,'')):''}</option>`+((this.userPresets||[]).length?'<optgroup label="My looks">'+this.userPresets.map(ps=>`<option value="look:${esc(ps.name)}">${esc(ps.name)}</option>`).join('')+'</optgroup>':'')
        +'<optgroup label="Photos">'+this.items.filter(x=>x.kind!=='scanlook').slice(0,300).map(x=>`<option value="item:${x.id}">${esc(x.name.replace(/\.[^.]+$/,''))}${this.isEdited(x.settings)?' ✎':''}</option>`).join('')+'</optgroup>';
      sel.value=cur; if(sel.value!==cur) sel.value='auto'; }
    el.querySelectorAll('.seg button').forEach(b=>{ b.classList.toggle('on',b.dataset.v===m); b.disabled=!it&&b.dataset.v!=='off'; });
    el.classList.toggle('active',m!=='off'&&!!it); el.querySelector('.slNote').textContent=m!=='off'&&it?(it.look?(m==='studio'?'The look’s Studio effects are used on the scan.':'The whole look is used on the scan.'):(m==='studio'?'Studio effects come live from that photo — change them in Studio and they show here. The sliders below are the scan’s own edits.':'That photo’s whole edit (film, tone, grain and Studio) is used live on the scan.')):''; },
  setScanLink(m){ this.scanLink=m; this.renderScanLink(); this.scanKey=null; Engine.dirty=true; this.saveSoon(); },
  scanParams(base){ base=this.linkMerge(base); const post=Splat.cam.post||{}; const o=Object.assign({},base,{crop:{x:0,y:0,w:1,h:1},angle:0,rot:0,flip:false});
    if('falloff' in post) o.falloff=post.falloff; if('glow' in post) o.glow=Math.max(o.glow||0,post.glow);
    for(const k of ['fringe','distort','softEdges','flare','flareLen','flareGhost','flareColor','flareSens']) if(k in post) o[k]=post[k];
    o.format={'35mm':'35mm','6x7':'6x7','4x5':'4x5','8x10':'8x10'}[Splat.cam.format]||o.format; return o; },
  levelScan(){ if(!Splat.scene){ this.toast('Load a scan first'); return; } if(Splat.scene.demo){ this.toast('The demo is already level'); return; }
    const ok=Splat.autoLevel(); this.saveScanView(); this.scanKey=null; Engine.dirty=true; UI.refresh();
    this.toast(ok?'Levelled to the ground plane — use Horizon to fine-tune':'No clear ground plane — try “Level to view”'); },
  saveScanView(){ const sc=this.scans.find(x=>x.path===this.scanPath); if(!sc) return; const c=Splat.cam; sc.view={model:c.model,up:c.up,roll:c.roll||0,lens:c.lens,scale:c.scale}; this.saveSoon(); },
  // ================================================================ orbit video (scan module)
  async sortSync(){ while(Splat.sortBusy) await new Promise(r=>setTimeout(r,4));
    await new Promise(r=>{ const prev=Splat.onDirty; Splat.onDirty=()=>{ Splat.onDirty=prev; r(); }; Splat.requestSort(); }); },
  keySnap(){ const c=Splat.cam; return {yaw:c.yaw,pitch:c.pitch,dist:c.dist,target:c.target.slice(),focus:c.focus,fnum:c.fnum||STOPS[c.stop],fmm:c.fmm,roll:c.roll||0}; },
  addKey(){ if(!Splat.scene){ this.toast('Load a scan first'); return; } this.scanKeys=this.scanKeys||[]; this.scanKeys.push(this.keySnap()); this.renderKeys(); this.toast('Keyframe '+this.scanKeys.length+' saved'); },
  // keyframes live with the scan they were made on (kept across quits), and moves can be saved by name
  keysToScan(){ const k=this.snapKey(this.scanPath); this.keysBy=this.keysBy||{}; this._keysFor=k; this.scanKeys=JSON.parse(JSON.stringify(this.keysBy[k]||[])); this.keySel=-1; this.renderKeys(); },
  movesFor(){ return ((this.movesBy=this.movesBy||{})[this.snapKey(this.scanPath)])||[]; },
  async saveMove(){ const K=this.scanKeys||[]; if(K.length<2){ this.toast('Add at least two keyframes first'); return; } const list=this.movesFor().slice();
    const n=await this.ask('Name this camera move','Move '+(list.length+1)); if(!n) return; const ex=list.find(m=>m.name===n);
    if(ex&&!confirm('Replace the move “'+n+'”?')) return; if(ex) list.splice(list.indexOf(ex),1); list.push({name:n.slice(0,50),keys:JSON.parse(JSON.stringify(K)),t:Date.now()});
    this.movesBy[this.snapKey(this.scanPath)]=list; this.renderMoves(); this.saveSoon(); this.toast('Saved move “'+n+'” — pick it any time from Saved moves'); },
  renderMoves(){ const mr=$('#moveRow'); if(!mr) return; mr.innerHTML=''; const M=this.movesFor();
    const s=document.createElement('select'); s.className='moveSel'; s.innerHTML='<option value="">'+(M.length?'Saved moves ('+M.length+')…':'No saved moves yet')+'</option>'+M.map((m,i)=>`<option value="${i}">${m.name.replace(/</g,'&lt;')} · ${m.keys.length} keys</option>`).join('')+(M.length?'<option value="del">Delete a saved move…</option>':'');
    s.onchange=async()=>{ const v=s.value; s.value=''; if(v==='del'){ const n=await this.ask('Delete which move? ('+M.map(m=>m.name).join(', ')+')',''); const i=M.findIndex(m=>m.name===n); if(i>=0){ M.splice(i,1); this.movesBy[this.snapKey(this.scanPath)]=M; this.renderMoves(); this.saveSoon(); } return; }
      if(v==='') return; const m=M[+v]; if((this.scanKeys||[]).length>1&&!confirm('Replace your current '+this.scanKeys.length+' keyframes with “'+m.name+'”?')) return; this.scanKeys=JSON.parse(JSON.stringify(m.keys)); this.keySel=-1; this.renderKeys(); this.toast('Loaded “'+m.name+'” — ▶ Preview or Export video'); };
    mr.appendChild(s); UI.button(mr,'Save move…',()=>this.saveMove()); },
  renderKeys(){ if(this._keysFor!==undefined){ (this.keysBy=this.keysBy||{})[this._keysFor]=JSON.parse(JSON.stringify(this.scanKeys||[])); this.saveSoon(); } this.renderTimeline();
    const el=$('#keyList'), ko=$('#keyOpts'); if(!el) return; el.innerHTML=''; if(ko) ko.innerHTML=''; const K=this.scanKeys||[];
    if(!K.length){ el.innerHTML='<span class="note">No keyframes yet.</span>'; return; }
    if(this.keySel>=K.length) this.keySel=K.length-1;
    if(ko&&this.keySel>=0&&K[this.keySel]){ const k=K[this.keySel];
      UI.slider(ko,'kHold','Hold here',{min:0,max:5,step:0.1,def:0,get:()=>k.hold||0,set:v=>k.hold=v,fmt:x=>x?x.toFixed(1)+' s':'No hold'});
      UI.seg(ko,'kEase','Move to next',[['smooth','Smooth'],['in','Ease in'],['out','Ease out'],['linear','Linear']],()=>k.ease||'smooth',v=>k.ease=v);
      const r=document.createElement('div'); r.className='btnrow'; ko.appendChild(r); UI.button(r,'Update to current view',()=>{ Object.assign(k,this.keySnap()); this.toast('Keyframe '+(this.keySel+1)+' updated'); }); UI.button(r,'Delete',()=>{ K.splice(this.keySel,1); this.keySel--; this.renderKeys(); }); }
    K.forEach((k,i)=>{ const t=document.createElement('button'); t.className='ltab'+(i===this.keySel?' on':''); t.textContent=String(i+1); t.title='Jump to keyframe '+(i+1)+' · right-click to delete';
      t.onclick=()=>{ this.keySel=i; this.renderKeys(); const c=Splat.cam; Object.assign(c,{yaw:k.yaw,pitch:k.pitch,dist:k.dist,target:k.target.slice(),focus:k.focus,fmm:k.fmm,roll:k.roll,focusLock:null}); let si=0; STOPS.forEach((x,j)=>{ if(Math.abs(x-k.fnum)<Math.abs(STOPS[si]-k.fnum)) si=j; }); c.stop=si; c.fnum=null; Splat.lastSortView=null; Engine.dirty=true; UI.refresh(); };
      t.oncontextmenu=e=>{ e.preventDefault(); K.splice(i,1); this.renderKeys(); }; el.appendChild(t); }); },
  // keyframe timeline: hold at each key, then move to the next over moveDur seconds with that key's easing
  keyTimeline(moveDur){ const K=this.scanKeys||[], segs=[]; let t=0;
    K.forEach((k,i)=>{ const h=k.hold||0; k._t=t; if(h>0){ segs.push({hold:true,i,t0:t,t1:t+h}); t+=h; } if(i<K.length-1){ const d=k.dur>0?k.dur:moveDur; segs.push({i,t0:t,t1:t+d}); t+=d; } }); return {segs,T:t}; },
  defMove(){ const K=this.scanKeys||[]; return ((this._orbitPrefs&&this._orbitPrefs.secs)||6)/Math.max(1,K.length-1); },
  // timeline strip: keyframe markers on a time ruler — drag a marker to change how long the move into it takes; click the ruler to scrub
  renderTimeline(){ const el=$('#keyTL'); if(!el) return; const K=this.scanKeys||[]; if(K.length<2){ el.innerHTML=''; el.style.display='none'; return; } el.style.display='';
    const tl=this.keyTimeline(this.defMove()), T=Math.max(tl.T,0.5); el.innerHTML='<div class="tlBar"></div><div class="tlTime"></div>'; const bar=el.firstChild;
    el.querySelector('.tlTime').textContent=tl.T.toFixed(1)+' s · drag a number to retime · click the bar to scrub';
    tl.segs.forEach(sg=>{ const d=document.createElement('div'); d.className='tlSeg'+(sg.hold?' hold':''); d.style.left=(sg.t0/T*100)+'%'; d.style.width=((sg.t1-sg.t0)/T*100)+'%'; if(!sg.hold) d.title=(sg.t1-sg.t0).toFixed(1)+' s to keyframe '+(sg.i+2); else d.title='hold '+(sg.t1-sg.t0).toFixed(1)+' s'; bar.appendChild(d); });
    const ph=document.createElement('div'); ph.className='tlHead'; ph.style.display='none'; bar.appendChild(ph); this._tlHead=ph;
    K.forEach((k,i)=>{ const m=document.createElement('div'); m.className='tlKey'+(i===this.keySel?' on':''); m.textContent=i+1; m.style.left=(k._t/T*100)+'%'; m.title=i?'Drag to change how long the move into keyframe '+(i+1)+' takes':'Start';
      m.onpointerdown=e=>{ e.preventDefault(); e.stopPropagation(); this.keySel=i; if(!i){ this.renderKeys(); this.scrubKeys(0); return; }
        K.forEach(q=>{ if(!(q.dur>0)) q.dur=this.defMove(); }); const w=bar.getBoundingClientRect().width, x0=e.clientX, prev=K[i-1], d0=prev.dur, scale=T/w; m.setPointerCapture(e.pointerId);
        m.onpointermove=ev=>{ prev.dur=Math.max(0.2,Math.round((d0+(ev.clientX-x0)*scale)*10)/10); const t2=this.keyTimeline(this.defMove()); m.style.left=Math.min(100,(K[i]._t/T*100))+'%'; el.querySelector('.tlTime').textContent=t2.T.toFixed(1)+' s · move into '+(i+1)+': '+prev.dur.toFixed(1)+' s'; };
        m.onpointerup=()=>{ m.onpointermove=null; this.renderKeys(); this.scrubKeys(K[i]._t); }; };
      bar.appendChild(m); });
    this.renderLanes(el,tl,T);
    bar.onpointerdown=e=>{ if(e.target.classList.contains('tlKey')) return; const r=bar.getBoundingClientRect(); const go=ev=>this.scrubKeys(Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width))*T); go(e); bar.setPointerCapture(e.pointerId); bar.onpointermove=go; bar.onpointerup=()=>{ bar.onpointermove=null; }; }; },
  laneAt(tl,t,f){ const K=this.scanKeys; let sg=tl.segs.find(s=>t>=s.t0&&t<s.t1)||tl.segs[tl.segs.length-1]; if(!sg) return K[0][f];
    const A=K[sg.i], B=sg.hold?A:K[sg.i+1]; let u=sg.hold?0:Math.min(1,(t-sg.t0)/(sg.t1-sg.t0)); const ez={linear:u,in:u*u*u,out:1-Math.pow(1-u,3)}[A.ease]; const e=ez!==undefined?ez:u*u*(3-2*u);
    return Math.exp(Math.log(Math.max(1e-3,A[f]))+(Math.log(Math.max(1e-3,B[f]))-Math.log(Math.max(1e-3,A[f])))*e); },
  // focus / aperture / focal-length lanes: each keyframe is a dot you drag up or down; the line shows how it glides between keys
  renderLanes(el,tl,T){ const K=this.scanKeys, c=Splat.cam; if(this._lanesOpen===undefined) this._lanesOpen=false;
    const tog=document.createElement('button'); tog.className='laneTog'; tog.textContent=(this._lanesOpen?'▾':'▸')+' Focus · aperture · focal length'; tog.onclick=()=>{ this._lanesOpen=!this._lanesOpen; this.renderTimeline(); }; el.appendChild(tog); if(!this._lanesOpen) return;
    const LN=[['focus','Focus',v=>{ const m=v*(c.scale||1); return m<1?Math.round(m*100)+' cm':m.toFixed(2)+' m'; }],['fnum','Aperture',v=>'ƒ/'+(v<10?v.toFixed(1):Math.round(v)).toString().replace('.0','')],['fmm','Focal length',v=>Math.round(v)+' mm']];
    LN.forEach(([f,label,fmt])=>{ const row=document.createElement('div'); row.className='lane'; row.innerHTML='<span class="lnName"></span><div class="lnPlot"></div>'; row.firstChild.textContent=label; el.appendChild(row); const plot=row.lastChild;
      const vals=K.map(k=>Math.log(Math.max(1e-3,k[f]))); let lo=Math.min(...vals), hi=Math.max(...vals); if(f==='fnum'){ lo=Math.log(STOPS[0]); hi=Math.log(STOPS[STOPS.length-1]); } else { const pad=Math.max(0.35,(hi-lo)*0.25); lo-=pad; hi+=pad; }
      const H=34, yOf=v=>H-2-(Math.log(Math.max(1e-3,v))-lo)/(hi-lo)*(H-4);
      let pts=''; for(let i=0;i<=80;i++){ const t=i/80*tl.T; pts+=`${(t/T*100).toFixed(2)},${yOf(this.laneAt(tl,t,f)).toFixed(1)} `; }
      plot.innerHTML=`<svg viewBox="0 0 100 ${H}" preserveAspectRatio="none"><polyline points="${pts}" vector-effect="non-scaling-stroke"/></svg>`;
      K.forEach((k,i)=>{ const d=document.createElement('div'); d.className='lnDot'+(i===this.keySel?' on':''); d.style.left=(k._t/T*100)+'%'; d.style.top=yOf(k[f])+'px'; d.title=label+' at keyframe '+(i+1)+': '+fmt(k[f])+' — drag up or down'; plot.appendChild(d);
        d.onpointerdown=e=>{ e.preventDefault(); e.stopPropagation(); d.setPointerCapture(e.pointerId); const y0=e.clientY, v0=Math.log(Math.max(1e-3,k[f])), per=(hi-lo)/(H-4); this.keySel=i;
          const tip=document.createElement('div'); tip.className='lnTip'; plot.appendChild(tip);
          d.onpointermove=ev=>{ let v=Math.exp(Math.min(hi,Math.max(lo,v0-(ev.clientY-y0)*per))); if(f==='fnum'){ let si=0; STOPS.forEach((x,j)=>{ if(Math.abs(Math.log(x)-Math.log(v))<Math.abs(Math.log(STOPS[si])-Math.log(v))) si=j; }); v=STOPS[si]; } k[f]=v; d.style.top=yOf(v)+'px'; tip.textContent=fmt(v); tip.style.left=d.style.left; tip.style.top=(yOf(v)-18)+'px';
            this.keyCamAt(this.keyTimeline(this.defMove()),k._t); Splat.lastSortView=null; Engine.dirty=true; };
          d.onpointerup=()=>{ d.onpointermove=null; tip.remove(); this.renderKeys(); this.scrubKeys(k._t); }; }; }); }); },
  scrubKeys(t){ const tl=this.keyTimeline(this.defMove()); this.keyCamAt(tl,Math.min(t,tl.T)); Splat.lastSortView=null; Engine.dirty=true; this.tlHead(t,tl.T); },
  tlHead(t,T){ const h=this._tlHead; if(!h||!h.isConnected) return; h.style.display=''; h.style.left=(Math.min(t,T)/Math.max(T,0.5)*100)+'%'; },
  keyCamAt(tl,time){ const K=this.scanKeys, c=Splat.cam; let sg=tl.segs.find(s=>time>=s.t0&&time<s.t1)||tl.segs[tl.segs.length-1]; if(!sg) return;
    const A=K[sg.i], B=sg.hold?A:K[sg.i+1]; let u=sg.hold?0:Math.min(1,(time-sg.t0)/(sg.t1-sg.t0)); if(time>=tl.T&&!sg.hold) u=1;
    const ez={linear:u,in:u*u*u,out:1-Math.pow(1-u,3)}[A.ease]; const e=ez!==undefined?ez:u*u*(3-2*u);
    let dy=B.yaw-A.yaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy)); const L=(a,b)=>a+(b-a)*e;
    c.yaw=A.yaw+dy*e; c.pitch=L(A.pitch,B.pitch); c.dist=Math.exp(L(Math.log(A.dist),Math.log(B.dist))); c.target=A.target.map((v,j)=>L(v,B.target[j]));
    c.focusLock=null; c.focus=Math.exp(L(Math.log(Math.max(1e-3,A.focus)),Math.log(Math.max(1e-3,B.focus)))); c.fnum=Math.exp(L(Math.log(A.fnum),Math.log(B.fnum))); c.fmm=Math.exp(L(Math.log(A.fmm),Math.log(B.fmm))); c.roll=L(A.roll||0,B.roll||0); },
  previewKeys(){ const K=this.scanKeys||[]; if(K.length<2){ this.toast('Add at least two keyframes'); return; }
    if(this._kprev){ this._kprev=false; return; } const tl=this.keyTimeline(this.defMove()), c=Splat.cam;
    const keep={yaw:c.yaw,pitch:c.pitch,dist:c.dist,target:c.target.slice(),focus:c.focus,focusLock:c.focusLock,fmm:c.fmm,fnum:c.fnum,roll:c.roll}; const t0=performance.now(); this._kprev=true;
    this.toast('Previewing the move ('+tl.T.toFixed(1)+' s) — click ▶ Preview again to stop');
    const step=()=>{ const t=(performance.now()-t0)/1000; if(!this._kprev||t>tl.T+0.4){ this._kprev=false; Object.assign(c,keep); c.fnum=keep.fnum||null; Splat.lastSortView=null; Engine.dirty=true; return; }
      this.keyCamAt(tl,Math.min(t,tl.T)); this.tlHead(t,tl.T); Splat.lastSortView=null; Engine.dirty=true; requestAnimationFrame(step); }; requestAnimationFrame(step); },
  async orbitDialog(){
    if(!Splat.scene){ this.toast('Load a scan first'); return; }
    if(!Native.available){ this.toast('Video export runs in the Mac app'); return; }
    try{ await Native.call('videoEnd',{job:'probe'}); }catch(e){ if(/unknown command/.test(String(e.message||e))){ this.toast('Rebuild the app once to enable video export (see chat)'); return; } }
    const st=Object.assign({secs:6,arc:40,move:'swing',size:1920,fps:30,grain:true},this._orbitPrefs||{});
    const body=$('#dlgBody'); body.innerHTML=''; $('#dlg h2').textContent='Orbit video'; $('#dlgOk').textContent='Render';
    if((this.scanKeys||[]).length>=2&&!st._k){ st.move='keys'; st._k=1; }
    UI.seg(body,'omove','Move',[['swing','Swing'],['orbit','Full orbit'],['push','Push in']].concat((this.scanKeys||[]).length>=2?[['keys','Keyframes ('+this.scanKeys.length+')']]:[]),()=>st.move,v=>st.move=v);
    UI.slider(body,'oarc','Swing arc',{min:5,max:120,step:1,def:40,get:()=>st.arc,set:v=>st.arc=v,fmt:x=>Math.round(x)+'°'});
    UI.slider(body,'osecs','Length',{min:2,max:20,step:1,def:6,get:()=>st.secs,set:v=>st.secs=v,fmt:x=>Math.round(x)+' s'});
    UI.seg(body,'osize','Size',[['1080','1080p'],['1920','1920'],['3840','4K']],()=>String(st.size),v=>st.size=+v);
    UI.seg(body,'ofps','Frame rate',[['24','24'],['30','30'],['60','60']],()=>String(st.fps),v=>st.fps=+v);
    UI.check(body,'ograin','Moving grain (new grain every frame, like real film)',()=>st.grain,v=>st.grain=v);
    st.dmg=Object.assign({},FilmDamage.DEFAULTS,st.dmg||{});
    { const D=st.dmg, box=document.createElement('div'); box.className='dmgBox'; body.appendChild(box);
      UI.check(box,'odmg','Dust & scratches — moving, like a real print going through a projector',()=>D.on,v=>{ D.on=v; inner.style.display=v?'':'none'; });
      const inner=document.createElement('div'); box.appendChild(inner); inner.style.display=D.on?'':'none';
      const pv=document.createElement('canvas'); pv.className='dmgPrev'; inner.appendChild(pv);
      const S=(k,l,f)=>UI.slider(inner,'od_'+k,l,{min:0,max:100,step:1,def:FilmDamage.DEFAULTS[k],get:()=>D[k],set:v=>{ D[k]=v; },fmt:f||(x=>Math.round(x))});
      S('amount','Overall'); S('dust','Dust density'); S('dustSize','Dust size'); S('scratch','Scratches'); S('hair','Hairs'); S('weave','Gate weave'); S('flicker','Flicker');
      UI.seg(inner,'od_col','Dirt shows as',[['dark','Dark (print)'],['light','White (negative)'],['mix','Both']],()=>D.colour,v=>D.colour=v);
      const r=document.createElement('div'); r.className='btnrow'; inner.appendChild(r); UI.button(r,'New random pattern',()=>{ D.seed=1+Math.floor(Math.random()*1e6); st0=null; });
      // live preview: the current view through the damage at 24 fps
      const L=this._lastL, img=this.viewThumb(520); let st0=null, im=new Image(); im.src=img||''; const anim=()=>{ if(!pv.isConnected) return; if(D.on&&im.complete&&im.naturalWidth){ const w=im.naturalWidth, h=im.naturalHeight; if(pv.width!==w){ pv.width=w; pv.height=h; }
          const x=pv.getContext('2d'); if(!st0||st0.p.seed!==D.seed) st0=FilmDamage.make(D,w,h); st0.p=Object.assign(st0.p,D); x.drawImage(im,0,0); FilmDamage.frame(x,st0,pv); } setTimeout(()=>requestAnimationFrame(anim),1000/24); }; anim(); }
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
    const c=Splat.cam, keep={yaw:c.yaw,pitch:c.pitch,dist:c.dist,target:c.target.slice(),focus:c.focus,focusLock:c.focusLock,fmm:c.fmm,fnum:c.fnum,roll:c.roll}, keepSeed=Engine.grainSeed;
    const tl=st.move==='keys'?this.keyTimeline(st.secs/Math.max(1,(this.scanKeys||[]).length-1)):null; const frames=Math.round((tl?tl.T:st.secs)*st.fps), gl=Engine.gl;
    const tmp=GLU.target(w,h,'rgba16f'), out=GLU.target(w,h,'rgba8'), RT={};
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h; let x=null; try{ x=cv.getContext('2d',{colorSpace:'display-p3'}); }catch(e){} if(!x) x=cv.getContext('2d');
    const p3=!!(x.getContextAttributes&&x.getContextAttributes().colorSpace==='display-p3');
    const id=p3?x.createImageData(w,h,{colorSpace:'display-p3'}):x.createImageData(w,h), px=new Uint8Array(w*h*4);
    const EP=Object.assign(this.scanParams(cloneParams(Engine.p)),{border:'none'});
    const L={W:w,H:h,dpr:1,scale:1,fx:0,fy:0,fw:w,fh:h,ix:0,iy:0,iw:w,ih:h,win:[0,0,1,1],b:{l:0,r:0,t:0,b:0}};
    this._cancelVideo=false; const t0=performance.now(), dmg=st.dmg&&st.dmg.on?FilmDamage.make(st.dmg,w,h):null;
    try{
      for(let f=0;f<frames;f++){
        if(this._cancelVideo) throw new Error('cancelled');
        const t=f/frames;
        if(st.move==='swing') c.yaw=keep.yaw+Math.sin(t*2*Math.PI)*st.arc/2*Math.PI/180;
        else if(st.move==='orbit') c.yaw=keep.yaw+t*2*Math.PI;
        else if(st.move==='keys'){ this.keyCamAt(tl,f/st.fps); }
        else { const e=.5-.5*Math.cos(t*Math.PI); c.dist=keep.dist*(1-.35*e); c.yaw=keep.yaw+(e-.5)*st.arc/3*Math.PI/180; }
        await this.sortSync(); Splat.render(tmp);
        if(st.grain) Engine.grainSeed=(keepSeed+f*2654435761)>>>0;
        const src={tex:tmp.t,w,h,dispRef:true,encoded:true,flipY:true,key:this.scanKey||0.1};
        const ks=Engine.src, kb=Engine.before, kc=Engine.cropMode; Engine.src=src; Engine.before=false; Engine.cropMode=false;
        Engine.frameSeed=f+1; Engine.render({layout:L,target:out,RT,params:EP,forceAfter:true,p3}); Engine.frameSeed=0;
        Engine.src=ks; Engine.before=kb; Engine.cropMode=kc;
        gl.bindFramebuffer(gl.FRAMEBUFFER,out.f); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        for(let y=0;y<h;y++) id.data.set(px.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4); x.putImageData(id,0,0);
        if(dmg) FilmDamage.frame(x,dmg,cv);
        const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.92));
        await Native.call('videoFrame',{job,base64:await this.blobB64(blob)});
        const el=(performance.now()-t0)/1000, eta=el/(f+1)*(frames-f-1);
        this.busy(`Rendering orbit video — frame ${f+1} / ${frames} · ${Math.ceil(eta)} s left  (Esc to cancel)`);
      }
      const done=await Native.call('videoEnd',{job}); this.busy(); this.toast(done?'Saved '+done.split('/').pop():'Video writer failed');
      if(done) Native.call('reveal',{path:done}).catch(()=>{});
    } catch(e){ await Native.call('videoEnd',{job}).catch(()=>{}); throw e; }
    finally{ Object.assign(c,keep); c.fnum=keep.fnum||null; Engine.grainSeed=keepSeed; GLU.free(tmp); GLU.free(out); for(const k in RT) GLU.free(RT[k]); Splat.lastSortView=null; Engine.dirty=true; }
  },
  // ================================================================ export
  async exportDialog(){
    if(!this.cur && this.module!=='scan'){ this.toast('Nothing to export'); return; }
    const sel=this.module==='scan'?[]:this.selected();
    const body=$('#dlgBody'); body.innerHTML='';
    const st=Object.assign({size:'full',fmt:'jpeg',q:0.95,space:'p3',meta:true,which:sel.length>1?'sel':'cur'},this._exportPrefs||{});
    if(!Native.available && st.fmt==='tiff') st.fmt='jpeg';
    if(sel.length>1) UI.seg(body,'xwhich','Photos',[['cur','This photo'],['sel',sel.length+' selected']],()=>st.which,v=>st.which=v);
    this.xPresets=this.xPresets||[];
    const pre=UI.select(body,'xpreset','Preset',()=>[['','—'],...this.xPresets.map((x,i)=>[String(i),x.name]),['__save','Save these settings as a preset…'],...(this.xPresets.length?[['__del','Delete a preset…']]:[])],()=>'',async v=>{
      if(v==='__save'){ const n=await this.ask('Name this export preset',(st.fmt==='jpeg'?'JPEG':st.fmt.toUpperCase())+' '+(st.size==='full'?'full size':st.size+' px')); if(n){ const e={name:n,st:Object.assign({},st)}; delete e.st.which; this.xPresets.push(e); this.saveSoon(); } }
      else if(v==='__del'){ const n=await this.ask('Delete which preset? ('+this.xPresets.map(x=>x.name).join(', ')+')',''); const i=this.xPresets.findIndex(x=>x.name===n); if(i>=0){ this.xPresets.splice(i,1); this.saveSoon(); } }
      else if(v!==''){ Object.assign(st,this.xPresets[+v].st); this.toast('Loaded “'+this.xPresets[+v].name+'”'); }
      UI.refresh(); });
    UI.seg(body,'xsize','Size',[['full','Full'],['4096','4096'],['3000','3000'],['2048','2048'],['1080','1080']],()=>st.size,v=>st.size=v);
    UI.seg(body,'xfmt','Format',Native.available?[['tiff','TIFF 16-bit'],['jpeg','JPEG'],['heic','HEIC'],['png','PNG']]:[['jpeg','JPEG'],['png','PNG']],()=>st.fmt,v=>st.fmt=v);
    UI.seg(body,'xspace','Colour',[['p3','Display P3'],['srgb','sRGB']],()=>st.space,v=>st.space=v);
    UI.slider(body,'xq','Quality',{min:60,max:100,step:1,def:95,get:()=>Math.round(st.q*100),set:v=>st.q=v/100,fmt:x=>Math.round(x)});
    if(Native.available) UI.check(body,'xmeta','Keep camera metadata (EXIF, GPS)',()=>st.meta,v=>st.meta=v);
    { const d=document.createElement('div'); d.className='row'; d.innerHTML='<label>File name</label><input class="askIn tplIn" spellcheck="false">'; const i=d.querySelector('input'); i.value=st.tpl||'{name} — {film}';
      const ex=document.createElement('div'); ex.className='note tplEx'; const upd=()=>{ st.tpl=i.value; ex.innerHTML='e.g. <b>'+this.exportName(st,this.cur,1).replace(/</g,'&lt;')+'</b><br>Tokens: {name} {film} {n} {date} {stars} {look}'+(this.module==='scan'?' {lens}':''); };
      i.oninput=upd; i.onkeydown=e=>e.stopPropagation(); UI.sliders.xtpl=()=>{ i.value=st.tpl||'{name} — {film}'; upd(); }; body.appendChild(d); body.appendChild(ex); upd(); }
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
  exportName(st,it,n){ const base=(this.module==='scan'?(this.scanName||'scan'):(it?it.name:'image')).replace(/\.[^.]+$/,''), p=(it&&it!==this.cur&&it.settings)||Engine.p, s=Engine.stock(p.stock);
    const d=new Date(), L=this.module==='scan'&&LENSES.find(l=>l.id===Splat.cam.lens), sn=this.module==='scan'&&this.curSnap&&this.snapsFor(this.scanPath).find(x=>x.id===this.curSnap);
    const T={name:base,film:s.id==='original'?'Original':s.name,n:String(n||1).padStart(3,'0'),date:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
      stars:it&&it.rating?it.rating+'★':'',look:(sn&&sn.name)||p.lookName||'',lens:L?L.name.split(' · ')[0]:''};
    let out=(st.tpl||'{name} — {film}').replace(/\{(\w+)\}/g,(m,k)=>k in T?T[k]:m).replace(/[\/:]/g,'-').replace(/\s*—\s*(—\s*)+/g,' — ').replace(/^[\s—-]+|[\s—-]+$/g,'').trim()||base;
    return out+this.EXT[st.fmt]; },
  async batchExport(items,st){
    let dir=null;
    if(Native.available){ dir=await Native.call('pickFolder',{dir:this.info&&this.info.splatDir+'/exports'}); if(!dir) return; }
    const keep=this.cur; let n=0; this._cancelVideo=false;
    for(const it of items){ if(this._cancelVideo) break; n++; this.busy(`Exporting ${n} / ${items.length} — ${it.name}  (Esc to stop)`); await this.select(it.id);
      await this.doExport(st, dir ? dir+'/'+this.exportName(st,it,n) : null, true); }
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
    const EP = Engine.eff(this.module==='scan' ? this.scanParams(cloneParams(Engine.p)) : Engine.p);
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
    const sl=this.scanItem||this._scanLookSaved; const data={v:1,favStocks:this.favStocks||[],scanLook:sl?{settings:sl.settings,hist:(sl.hist||[]).slice(-60)}:null,presets:this.userPresets,scanPresets:this.scanPresets||[],scanSnaps:this.scanSnaps||{},cleanBy:this.cleanBy||{},scanLink:this.scanLink||'off',scanLinkFrom:this.scanLinkFrom||'auto',keysBy:this.keysBy||{},movesBy:this.movesBy||{},xPresets:this.xPresets||[],smart:this.smart||[],lastStock:this.lastStock,scanPath:this.scanPath||null,scans:this.scans.filter(x=>x.path),hiddenScans:this.hiddenScans||[],items:this.items.filter(i=>i.path).map(i=>({id:i.id,name:i.name,path:i.path,kind:i.kind==='scanframe'?'photo':i.kind,settings:i.settings,thumb:i.thumb,versions:i.versions||[],rating:i.rating||0,flag:i.flag||null,stack:i.stack||undefined,stackTop:!!i.stackTop,stackOpen:!!i.stackOpen,pinned:!!i.pinned,tags:i.tags||undefined,lrId:i.lrId||undefined,inst:i.inst||undefined}))};
    const json=JSON.stringify(data);
    if(Native.available) Native.call('saveState',{json}).catch(()=>{}); else { try{ localStorage.setItem('darkroom.lib',json); }catch(e){} }
  },
  async restore(){
    let json='';
    if(Native.available){ try{ this.info=await Native.call('info'); json=await Native.call('loadState'); }catch(e){} }
    else { try{ json=localStorage.getItem('darkroom.lib')||''; }catch(e){} }
    if(!json) return; try{ const d=JSON.parse(json); this.lastStock=d.lastStock||this.lastStock; this.userPresets=d.presets||[]; this.scanPresets=d.scanPresets||[]; this.scanSnaps=d.scanSnaps||{}; this.cleanBy=d.cleanBy||{}; this.scanLink=d.scanLink||'off'; this.scanLinkFrom=d.scanLinkFrom||'auto'; this.keysBy=d.keysBy||{}; this.movesBy=d.movesBy||{}; if(this._keysFor!==undefined) this.keysToScan(); this.xPresets=d.xPresets||[]; this.smart=d.smart||[]; this._scanLookSaved=d.scanLook||null; this.favStocks=d.favStocks||[]; if(UI._bp){ UI.favs=new Set(this.favStocks); UI.buildPresets(...UI._bp); } this.scans=(d.scans||[]).filter(x=>x&&x.path); this.hiddenScans=d.hiddenScans||[];
      (d.items||[]).forEach(o=>{ const it=this.newItem(o); it.settings=withDefaults(o.settings); it.hist=[JSON.stringify(it.settings)]; });
      this.renderStrip(); }catch(e){ console.warn(e); }
  },

  // ================================================================ module / view
  // ---- 3D Scan has its own look (not the selected photo's): its own history, reset and saved looks
  enterScanLook(){ if(this.cur&&this.cur.kind==='scanlook') return;
    if(!this.scanItem){ const base=this._scanLookSaved||{settings:cloneParams(this.cur?this.cur.settings:withDefaults({})),hist:[]};
      this.scanItem={id:'__scan',name:'3D Scan look',kind:'scanlook',settings:withDefaults(base.settings),hist:base.hist||[],fut:[],versions:[]}; }
    this._prevCur=this.cur; this.cur=this.scanItem; setTimeout(()=>this.renderScanLink(),0); Engine.p=withDefaults(this.scanItem.settings); this.scanItem.settings=Engine.p;
    if(!this.scanItem.hist.length) this.commit(); this.afterLookSwap(); },
  leaveScanLook(){ if(!this.cur||this.cur.kind!=='scanlook') return; const it=this._prevCur&&this.items.includes(this._prevCur)?this._prevCur:null; this.cur=it;
    Engine.p=it?withDefaults(it.settings):withDefaults({}); if(it) it.settings=Engine.p; this.afterLookSwap(); },
  afterLookSwap(){ Engine.ensureLuts(Engine.p).then(()=>{ Engine.dirty=true; }); UI.refresh(); UI.markPreset(Engine.p.stock); this.updateStockNote(); this.dots(); Tools.renderMasks&&Tools.renderMasks(); this.renderHistory&&this.renderHistory(); },
  setModule(m){ $('#placeBox')&&$('#placeBox').classList.remove('on');
    if(m==='scan'&&this.module!=='scan') this.enterScanLook(); else if(m!=='scan'&&this.module==='scan') this.leaveScanLook();
    if(Engine.cropMode && m!=='develop') Tools.setCropMode(false);
    if(m==='studio') this.renderDoubleChooser&&this.renderDoubleChooser();
    if(m!=='develop' && this.compare) this.setCompare(null);
    this.module=m; document.body.classList.toggle('m-scan',m==='scan'); document.body.classList.toggle('m-studio',m==='studio'); this.renderStrip();
    $('#scanEmpty').classList.toggle('on',m==='scan'&&!Splat.scene);
    document.querySelectorAll('#modules button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
    $('#grid').classList.toggle('on',m==='library'); if(m==='library') this.renderGrid();
    const v=$('#view'); v.className = m==='scan' ? 'cross' : 'grab';
    if(m==='scan'){ $('#empty').classList.add('off'); this.refreshScans(); }
    else if(this.module!=='scan') $('#scanEmpty').classList.remove('on');
    else if(m==='develop'||m==='studio'){ if(this.cur && this.cur.src) Engine.setSource(this.cur.src); else if(this.cur) this.select(this.cur.id); else { Engine.setSource(null); $('#empty').classList.remove('off'); } }
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
      // while a scan trains, leave the GPU to the trainer: no redraws behind the progress dialog
      if(this._pipeBusy){ requestAnimationFrame(()=>this.loop()); return; }
      if(this.module==='scan'){
        if(!Splat.scene){ if(Engine.dirty){ Engine.dirty=false; const keep=Engine.src; Engine.src=null; Engine.render({}); Engine.src=keep; UI.drawHisto($('#histo'),null); $('#status').textContent=''; } }
        else if(Engine.dirty){ Engine.dirty=false; const [w,h]=this.scanLayoutSize(); Splat.maybeSort();
          const src=this.renderScanSource(w,h); Engine.src=src; Engine.view={mode:'fit'}; if(Engine.p.dblId==='__self') Engine.dblSrc=Object.assign({},src,{id:'__self',own:false});
          const p=this.scanParams(Engine.hoverParams||Engine.p);
          const L=Engine.layout(p); this._lastL=L;
          Engine.render({params:p,layout:L,borderTex:this.borderFor(L,p)}); this.scanThumb(); this.cpOverlay(); if(this._snapCb){ const f=this._snapCb; this._snapCb=null; f(); } this.histo(); this.status(); }
      } else if(this.module!=='library' && Engine.dirty){
        Engine.dirty=false;
        const p=Engine.hoverParams||Engine.p;
        const L=Engine.layout(); this._lastL=L;
        if(this.compare && Engine.src && !Engine.cropMode){ const Ls=Engine.renderSplit(this.compare.settings,p,(L2,p2)=>this.borderFor(L2,p2)); document.body.classList.toggle('splitV',!!Engine.splitVertical); this._lastL=Object.assign({},Ls[1],{W:L.W,H:L.H}); }
        else Engine.render({params:p,borderTex:this.borderFor(L,p)});
        Tools.overlay(); this.placeBox(); this.cpOverlay(); this.splitBar(); this.histo(); this.status(); this.navPreview(p);
        if(this.module==='develop'&&this.cur&&$('#presetList').classList.contains('gridmode')) this.stockThumbsSoon();
        if(this.cur&&!this._ptrDown) this.lookThumbsSoon();
        if((this.module==='studio'||(this.module==='scan'&&Splat.scene&&!this._pipeBusy&&!this._ptrDown))&&this.cur){ clearTimeout(this._rt); this._rt=setTimeout(()=>{ const q=cloneParams(Engine.p); STUDIO_KEYS.forEach(k=>delete q[k]); Studio.refreshRecipeThumbs(this.cur.id+JSON.stringify(q)+Object.values(Engine.assetTexs).filter(t=>t.ready).length); },500); }
      }
    }catch(e){ console.error(e); }
    requestAnimationFrame(()=>this.loop());
  },
  edgeP(p){ const i=this.cur?this.items.indexOf(this.cur):0; return Object.assign({},p,{frameNo:p.frameNo||((Math.max(0,i)%36)+1)}); },
  borderFor(L,p){ p=Engine.eff(p); if(!Engine.src||p.border==='none') return null; return Borders.texture(p.border,L.fw,L.fh,L.b,Engine.stock(p.stock),this.edgeP(p)); },
  histo(){ const p=Engine.hoverParams||Engine.p; const h=Engine.src?Engine.histogram(p):null; Engine._lastHist=h; UI.drawHisto($('#histo'),h); if(Tools.drawCurve&&!this._curveT){ this._curveT=setTimeout(()=>{ this._curveT=null; Tools.drawCurve(); },150); }
    const s=Engine.stock(p.stock);
    const auto=(p.autoExp&&Engine.src&&Engine.src.key&&!Engine.isOriginal(Engine.eff(p)))?Math.log2(0.18*0.62/Engine.src.key):0;
    $('#histoInfo').innerHTML=`<span>${s.maker} ${s.name}${Engine.hoverParams?' (preview)':''}</span><span>${Engine.src&&Engine.src.raw?'RAW · ':''}EV ${(p.ev+auto>=0?'+':'')+(p.ev+auto).toFixed(1)}</span>`; },
  status(){ const s=Engine.src; $('#status').textContent = s ? (this.module==='scan' ? `${Splat.cam.format} · ${Math.round(Splat.cam.fmm)}mm · ƒ/${STOPS[Splat.cam.stop]} · ${(Splat.cam.focus*Splat.cam.scale).toFixed(2)} m` : (()=>{ const [w,h]=Engine.dims(Engine.p); return `${Math.round(w)} × ${Math.round(h)}`; })()) : ''; },

  // ================================================================ events
  bindEvents(){
    document.querySelectorAll('#modules button').forEach(b=>b.onclick=()=>this.setModule(b.dataset.m));
    document.querySelectorAll('#left .panel>h3, #right>.panel>h3').forEach(h=>h.addEventListener('click',e=>{ if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON') return; h.parentElement.classList.toggle('open'); }));
    UI.restorePanels(document);
    $('#btnImport').onclick=e=>this.importMenu(e.currentTarget); $('#emptyImport').onclick=()=>this.importDialog(); $('#seOpen').onclick=()=>this.openScan(); $('#seHow').onclick=()=>Tutorial.open(); $('#seNew').onclick=()=>this.newScan(); $('#seDemo').onclick=()=>this.loadDemo();
    $('#btnExport').onclick=()=>this.exportDialog(); { const sb=$('#tbSaveScan'); if(sb) sb.onclick=()=>this.exportDialog(); }
    $('#presetAdd').onclick=e=>{ e.stopPropagation(); $('#pUserPresets').classList.add('open'); $('#presetNew').classList.toggle('on'); if($('#presetNew').classList.contains('on')){ const n=$('#presetName'); n.value=Engine.stock().name+' — '; n.focus(); n.setSelectionRange(n.value.length,n.value.length); } };
    $('#presetSave').onclick=()=>{ this.savePreset($('#presetName').value,$('#presetWB').checked); $('#presetNew').classList.remove('on'); };
    $('#presetName').addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter') $('#presetSave').click(); if(e.key==='Escape') $('#presetNew').classList.remove('on'); });
    $('#tbBefore').onclick=()=>this.toggleBefore(); $('#tbSplit').onclick=()=>this.toggleSplit();
    { const h=$('#splitBar'); let dr=false; h.addEventListener('pointerdown',e=>{ dr=true; h.setPointerCapture(e.pointerId); e.stopPropagation(); });
      h.addEventListener('pointermove',e=>{ if(!dr) return; const L=this._lastL, r=$('#view').getBoundingClientRect(); Engine.splitX=Math.max(0,Math.min(1,((e.clientX-r.left)*L.dpr-L.ix)/L.iw)); Engine.dirty=true; this.splitBar(); });
      h.addEventListener('pointerup',()=>dr=false); } $('#tbZoom').onclick=()=>this.toggleZoom();
    $('#tbCrop').onclick=()=>{ if(this.module!=='develop') this.setModule('develop'); Tools.setCropMode(!Engine.cropMode); };
    $('#tbSync').onclick=()=>this.syncDialog();
    $('#libFilter').onchange=e=>this.libFilterChange(e.target.value); this.renderLibFilter();
    { const q=$('#libSearch'); q.oninput=()=>{ this.query=q.value.trim(); clearTimeout(this._qt); this._qt=setTimeout(()=>{ this.renderStrip(); this.renderGrid(); },120); }; q.onkeydown=e=>{ e.stopPropagation(); if(e.key==='Escape'){ q.value=''; q.oninput(); q.blur(); } }; }
    $('#tbReset').onclick=e=>{ const r=e.target.getBoundingClientRect(); if(this.cur) this.photoMenuReset(r.left,r.top); };
    $('#tbCompare').onclick=()=>{ if(this.module!=='develop') this.setModule('develop'); this.toggleCompare(); };
    $('#verAdd').onclick=e=>{ e.stopPropagation(); this.saveVersion(); };
    $('#presetExport').onclick=e=>{ e.stopPropagation(); this.exportPresets(); };
    $('#presetImport').onclick=e=>{ e.stopPropagation(); this.importPresets(); };
    $('#tbExpose').onclick=()=>this.exposeFrame(); $('#tbSnap').onclick=()=>this.saveSnap();
    $('#pipeDetails').addEventListener('toggle',()=>{ const P=this.pp; if(P&&$('#pipeDetails').open){ const el=$('#pipeLog'); el.textContent=P.log||''; el.scrollTop=el.scrollHeight; P.shown=P.log; } });
    $('#scanLookAdd').onclick=e=>{ e.stopPropagation(); this.saveCamPreset(); }; $('#scanResetLook').onclick=()=>this.resetScan(false); $('#scanResetAll').onclick=()=>this.resetScanFull();
    $('#histOrig').onclick=e=>{ e.stopPropagation(); if(this.cur) this.applySettings(withDefaults({})).then(()=>{ this.commit(); this.toast('Back to the original — History keeps every step'); }); };
    // camera moves in 3D Scan are history steps too (checked when you pause)
    setInterval(()=>{ if(this.module!=='scan'||!this.cur||this.cur.kind!=='scanlook'||!Splat.scene||this._ptrDown) return; const h=this.cur.hist||[], last=h[h.length-1]; if(!last) return;
      try{ if(JSON.stringify(JSON.parse(last).__cam)!==JSON.stringify(this.camSnap())) this.commit(); }catch(e){} },1500);
    addEventListener('pointerdown',()=>this._ptrDown=true,true); addEventListener('pointerup',()=>this._ptrDown=false,true);
    $('#clipLo').onclick=$('#clipHi').onclick=()=>{ Engine.showClip=!Engine.showClip; Engine.dirty=true; };
    $('#fileIn').onchange=e=>{ const f=[...e.target.files]; e.target.value=''; this.addFiles(f); };
    $('#pipeClose').onclick=()=>$('#pipe').classList.remove('on');
    $('#pipePause').onclick=()=>{ if(this._pipeState==='paused') this.pipeCtl('run'); else { this.pipeCtl('pause'); setTimeout(()=>this.previewCheckpoint(),1200); } };
    $('#pipeFinish').onclick=$('#pmFinish').onclick=async()=>{ if(!confirm('Stop training now and keep the newest checkpoint as the finished scan?')) return; this.pipeCtl('finish'); $('#pipe').classList.add('on'); this.pipeMini(); };
    $('#pipeHide').onclick=()=>{ $('#pipe').classList.remove('on'); this._pipeBusy=false; this.pipeMini(); this.toast('Training continues — the bar at the bottom shows progress'); };
    $('#pmShow').onclick=()=>{ $('#pipe').classList.add('on'); this._pipeBusy=this._pipeState==='running'; this.pipeMini(); };
    $('#pmPause').onclick=()=>this.pipeCtl(this._pipeState==='paused'?'run':'pause');
    $('#pmPreview').onclick=()=>{ if(this._pipeState!=='paused') this.pipeCtl('pause'); setTimeout(()=>this.previewCheckpoint(),1200); };
    $('#pipeCancel').onclick=()=>{ this._pipeState=null; this.pipeMini(); Native.call('cancelPipeline',{job:this._pipeJobId||-1}).catch(()=>{}); $('#pipe').classList.remove('on'); };
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
  importMenu(btn){ const m=$('#ctxMenu'); m.innerHTML=''; const item=(l,f,kb)=>{ const b=document.createElement('button'); b.innerHTML=l+(kb?`<kbd>${kb}</kbd>`:''); b.onclick=()=>{ m.classList.remove('on'); f(); }; m.appendChild(b); };
    item('Photos or scans…',()=>this.importDialog(),'⌘O'); item('Lightroom Classic catalog…',()=>LRImport.run(this).catch(e=>{ this.busy(); this.toast('Lightroom import failed: '+e.message); }));
    const r=btn.getBoundingClientRect(); m.style.left=r.left+'px'; m.style.top=(r.bottom+4)+'px'; m.classList.add('on');
    setTimeout(()=>document.addEventListener('pointerdown',function f(e){ if(!m.contains(e.target)){ m.classList.remove('on'); document.removeEventListener('pointerdown',f,true); } },true),0); },
  importDialog(){
    if(Native.available){ Native.call('open',{multiple:true,exts:['jpg','jpeg','heic','heif','png','tif','tiff','dng','cr2','cr3','nef','arw','raf','orf','rw2','ply','splat']}).then(p=>p&&p.length&&this.addPaths(p)); }
    else { const i=$('#fileIn'); i.accept='image/*,.heic,.heif,.ply,.splat'; i.click(); }
  },
  toggleSplit(){ Engine.split=!Engine.split; Engine.splitX=Engine.splitX??0.5; $('#tbSplit').classList.toggle('on',Engine.split); Engine.dirty=true; this.splitBar(); },
  splitBar(){ const h=$('#splitBar'), L=this._lastL; if(!h) return; const on=Engine.split&&L&&Engine.src&&this.module!=='library'; h.classList.toggle('on',!!on); if(!on) return;
    const r=$('#view').getBoundingClientRect(); Object.assign(h.style,{left:r.left+(L.ix+Engine.splitX*L.iw)/L.dpr+'px',top:r.top+Math.max(0,(L.H-L.iy-L.ih))/L.dpr+'px',height:Math.min(L.ih,L.H)/L.dpr+'px'}); },
  toggleBefore(){ Engine.before=!Engine.before; $('#beforeTag').classList.toggle('on',Engine.before); $('#tbBefore').classList.toggle('on',Engine.before); Engine.dirty=true; },
  key(e){
    if(e.key==='Escape' && $('#busy').classList.contains('on')){ this._cancelVideo=true; this._stopSheet=true; }
    if(e.target.tagName==='INPUT'&&e.target.type!=='range'||e.target.tagName==='SELECT') return;
    const k=e.key, meta=e.metaKey||e.ctrlKey;
    if(this.cleanMode&&this.module==='scan'){ if(meta&&k.toLowerCase()==='z'&&!e.shiftKey){ e.preventDefault(); this.cleanUndo(); return; } if(k==='['||k===']'){ this.cleanR=Math.max(4,Math.min(200,(this.cleanR||30)*(k===']'?1.25:0.8))); UI.refresh(); return; } if(k==='Escape'){ this.setClean(false); return; } }
    if(meta&&k.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?this.redo():this.undo(); return; }
    // 3D Scan camera from the keyboard: arrows move (pan), ⇧+arrows orbit, +/− or PageUp/PageDown dolly in and out
    if(this.module==='scan'&&Splat.scene&&!meta&&/^(Arrow(Up|Down|Left|Right)|PageUp|PageDown|\+|=|-|_)$/.test(k)){ e.preventDefault(); const c=Splat.cam, st=e.altKey?8:30;
      if(k.startsWith('Arrow')){ const dx=k==='ArrowLeft'?-1:k==='ArrowRight'?1:0, dy=k==='ArrowUp'?-1:k==='ArrowDown'?1:0;
        if(e.shiftKey){ c.yaw-=dx*0.06; c.pitch=Math.max(-1.45,Math.min(1.45,c.pitch+dy*0.05)); } else Splat.pan(-dx*st,-dy*st); }
      else c.dist=Math.max(0.05,c.dist*((k==='PageUp'||k==='+'||k==='=')?0.92:1.087));
      Splat.lastSortView=null; Engine.dirty=true; return; }
    if(meta&&e.shiftKey&&k.toLowerCase()==='c'){ e.preventDefault(); this.copyDialog(); return; }
    if(meta&&e.shiftKey&&k.toLowerCase()==='v'){ e.preventDefault(); this.pasteSettings(); return; }
    if(meta&&k.toLowerCase()==='a'&&this.module!=='scan'){ e.preventDefault(); this.items.forEach(x=>x.sel=true); this.renderStrip(); this.renderGrid(); this.updateSync(); this.toast(this.items.length+' photos selected'); return; }
    if(meta&&k.toLowerCase()==='g'&&this.module!=='scan'){ e.preventDefault(); if(e.shiftKey){ if(this.cur) this.unstack(this.cur); } else this.stackSelected(); return; }
    if(meta&&k.toLowerCase()==='d'&&this.cur&&this.module!=='scan'){ e.preventDefault(); this.duplicate(this.cur,e.shiftKey); return; }
    if(meta&&e.shiftKey&&k.toLowerCase()==='r'&&this.cur){ e.preventDefault(); if(this.module==='scan') this.resetScan(false); else this.resetPhoto(false); return; }
    if(meta&&k==="'"){ e.preventDefault(); this.saveVersion(); return; }
    if(meta&&k.toLowerCase()==='e'){ e.preventDefault(); this.exportDialog(); return; }
    if(meta&&k.toLowerCase()==='p'&&this.module!=='scan'){ e.preventDefault(); this.printDialog(); return; }
    if(meta&&k.toLowerCase()==='f'&&this.module!=='scan'){ e.preventDefault(); const q=$('#libSearch'); q.focus(); q.select(); return; }
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
    if(k==='|'){ this.toggleSplit(); }
    else if(k==='\\'){ this.toggleBefore(); }
    else if(k==='z'||k==='Z'){ this.toggleZoom(); }
    else if(k==='j'||k==='J'){ Engine.showClip=!Engine.showClip; Engine.dirty=true; }
    else if(k==='g'||k==='G'){ this.setModule('library'); }
    else if(k==='d'||k==='D'){ this.setModule('develop'); }
    else if(k==='t'||k==='T'){ this.setModule('studio'); }
    else if((k==='l'||k==='L')&&this.module==='scan'){ this.levelScan(); }
    else if(k==='S'&&this.module==='scan'&&Splat.scene){ this.saveSnap(); }
    else if(k==='s'||k==='S'){ this.setModule('scan'); }
    else if(k==='?'){ this.shortcutSheet(); }
    else if(k===' '&&this.module==='scan'){ e.preventDefault(); this.exposeFrame(); }
    else if((k==='ArrowRight'||k==='ArrowLeft')&&this.module!=='scan'){ const i=this.items.indexOf(this.cur)+(k==='ArrowRight'?1:-1); if(this.items[i]){ e.preventDefault(); this.select(this.items[i].id); } }
    else if((k==='Backspace'||k==='Delete')&&this.cur&&this.module!=='scan'){ this.remove(this.cur.id); }
  },
  // ---- Studio direct manipulation: the double exposure (or a light leak / burn / flare layer) follows the mouse
  placeTarget(){ if(this.module!=='studio'||!this.cur||this.compare||Engine.cropMode) return null; return Studio.placeTarget(); },
  placeBox(){ const el=$('#placeBox'); const T=this.placeTarget(), L=this._lastL;
    if(!T||!L||Engine.view.mode!=='fit'){ el.classList.remove('on'); return; }
    const o=T.get(), A=L.iw/L.ih, B=(T.kind!=='dbl'&&(A<1)!==(T.B<1))?1/T.B:T.B, ovW=B>=A?B:A, ovH=B>=A?1:A/B, dpr=L.dpr, r=$('#view').getBoundingClientRect();
    const cl=$('#placeClip'); Object.assign(cl.style,{left:r.left+L.ix/dpr+'px',top:r.top+(L.H-L.iy-L.ih)/dpr+'px',width:L.iw/dpr+'px',height:L.ih/dpr+'px'});
    const cx=(.5+o.x)*L.iw/dpr, cy=(.5+o.y)*L.ih/dpr;
    Object.assign(el.style,{left:cx+'px',top:cy+'px',width:ovW*o.scale*L.ih/dpr+'px',height:ovH*o.scale*L.ih/dpr+'px',transform:`translate(-50%,-50%) rotate(${o.rot}deg)`});
    el.dataset.label={dbl:'Second exposure',leak:'Light leak',burn:'Film burn',flare:'Flare',dust:'Dust'}[T.kind.replace(/\d+$/,'')]; el.classList.add('on'); },
  // ---- control point markers on the photo (Studio)
  cpOverlay(){ const lay=$('#cpLayer'), L=this._lastL; if(!lay) return;
    const a=(Engine.p.cps||[]), show=(this.module==='studio'||this.module==='scan')&&L&&Engine.src&&!this.compare&&(a.length||Studio.cpAdding)&&!(Engine.p.off||{}).points;
    lay.classList.toggle('on',!!show); lay.classList.toggle('adding',!!Studio.cpAdding); if(!show){ lay.innerHTML=''; return; }
    const r=$('#view').getBoundingClientRect(), dpr=L.dpr; Object.assign(lay.style,{left:r.left+L.ix/dpr+'px',top:r.top+(L.H-L.iy-L.ih)/dpr+'px',width:L.iw/dpr+'px',height:L.ih/dpr+'px'});
    if(lay.children.length!==a.length) lay.innerHTML='';
    a.forEach((c,i)=>{ let m=lay.children[i]; if(!m){ m=document.createElement('div'); m.className='cpm'; m.innerHTML='<i class="ring"></i><b></b>'; lay.appendChild(m); this.cpBind(m); }
      m.dataset.i=i; m.querySelector('b').textContent=i+1; m.classList.toggle('sel',i===Studio.cpSel);
      m.style.left=(c.x*100)+'%'; m.style.top=(c.y*100)+'%'; const rp=(c.r||0.15)*L.ih/dpr*0.85; const ring=m.querySelector('.ring'); ring.style.width=ring.style.height=rp*2+'px'; }); },
  cpBind(m){ let drag=null;
    m.addEventListener('pointerdown',e=>{ e.stopPropagation(); e.preventDefault(); const i=+m.dataset.i, c=Engine.p.cps[i]; Studio.cpSel=i; Studio.renderCP&&Studio.renderCP(); UI.refresh();
      Engine.cpShow=i; const ring=e.target.classList.contains('ring'); drag={i,ring,x0:e.clientX,y0:e.clientY,c0:{x:c.x,y:c.y,r:c.r}}; m.setPointerCapture(e.pointerId); });
    m.addEventListener('pointermove',e=>{ if(!drag) return; const L=this._lastL, dpr=L.dpr, c=Engine.p.cps[drag.i]; if(!c) return;
      if(drag.ring){ const lay=$('#cpLayer').getBoundingClientRect(), cx=lay.left+c.x*lay.width, cy=lay.top+c.y*lay.height; c.r=Math.max(0.02,Math.min(0.9,Math.hypot(e.clientX-cx,e.clientY-cy)/(L.ih/dpr*0.85))); }
      else { c.x=Math.max(0,Math.min(1,drag.c0.x+(e.clientX-drag.x0)*dpr/L.iw)); c.y=Math.max(0,Math.min(1,drag.c0.y+(e.clientY-drag.y0)*dpr/L.ih)); }
      this.changed(); this.cpOverlay(); UI.refresh(); });
    m.addEventListener('pointerup',e=>{ if(!drag) return; const c=Engine.p.cps[drag.i]; if(c&&!drag.ring) this.cpSample(c); drag=null; this.commit(); setTimeout(()=>{ Engine.cpShow=-1; Engine.dirty=true; },400); }); },
  cpSample(c){ const L=this._lastL; if(!L) return; const px=L.ix+c.x*L.iw, py=L.iy+L.ih-c.y*L.ih; const v=Engine.sampleAt(px,py,L); if(v) c.col=Array.from(CM.vec(CM.REC709_TO_AP1,v)).slice(0,3); },   // back to the prep (AP1) space the shader compares in
  bindPlace(v){
    { const ring=document.createElement('div'); ring.id='brushRing'; document.body.appendChild(ring);
      v.addEventListener('pointermove',e=>{ if(!this.cleanMode||this.module!=='scan'){ ring.style.display='none'; return; } const R=this.cleanR||30; ring.style.display='block'; ring.style.width=ring.style.height=(2*R)+'px'; ring.style.left=(e.clientX-R)+'px'; ring.style.top=(e.clientY-R)+'px'; });
      v.addEventListener('pointerleave',()=>{ ring.style.display='none'; });
      v.addEventListener('pointerdown',e=>{ if(this.module!=='scan'||!this.cleanMode||e.button!==0||e.shiftKey) return; e.stopImmediatePropagation(); e.preventDefault(); v.setPointerCapture(e.pointerId);
        this.cleanStroke(e,v,true); let raf=0, last=e; const mv=ev=>{ last=ev; if(!raf) raf=requestAnimationFrame(()=>{ raf=0; this.cleanStroke(last,v,false); }); };
        const up=()=>{ v.removeEventListener('pointermove',mv); v.removeEventListener('pointerup',up); this.saveClean(); }; v.addEventListener('pointermove',mv); v.addEventListener('pointerup',up); },true); }
    // adding a control point: the next click on the photo places it
    v.addEventListener('pointerdown',e=>{ if((this.module!=='studio'&&this.module!=='scan')||!Studio.cpAdding||e.button!==0) return; const L=this._lastL; if(!L) return; e.stopImmediatePropagation(); e.preventDefault();
      const r=v.getBoundingClientRect(), dpr=L.dpr, x=((e.clientX-r.left)*dpr-L.ix)/L.iw, y=((e.clientY-r.top)*dpr-(L.H-L.iy-L.ih))/L.ih; if(x<0||y<0||x>1||y>1) return;
      const a=Engine.p.cps=(Engine.p.cps&&Engine.p.cps!==DEFAULTS.cps)?Engine.p.cps:[]; if(a.length>=8) return;
      const c={x,y,r:0.15,col:[.18,.18,.18],b:0,c:0,s:0,st:0,w:0}; this.cpSample(c); a.push(c); Studio.cpSel=a.length-1; Studio.cpAdding=false;
      this.changed(); this.commit(); Studio.renderCP&&Studio.renderCP(); UI.refresh(); this.toast('Point added — now move the sliders (Brightness, Contrast, Structure…)'); },true); let drag=null; const T=()=>this.placeTarget();
    const toImg=(L)=>({sx:L.dpr/L.iw, sy:L.dpr/L.ih});
    v.addEventListener('pointerdown',e=>{ const t=T(); if(!t||Engine.view.mode!=='fit'||e.button!==0) return; const L=this._lastL; if(!L) return;
      const o=t.get(), r=v.getBoundingClientRect(), b=$('#placeBox').getBoundingClientRect(), c={x:b.left+b.width/2,y:b.top+b.height/2};
      drag={t,o0:o,x0:e.clientX,y0:e.clientY,c,a0:Math.atan2(e.clientY-c.y,e.clientX-c.x),d0:Math.hypot(e.clientX-c.x,e.clientY-c.y),mode:e.shiftKey?'rot':e.altKey?'scale':'move'};
      v.setPointerCapture(e.pointerId); e.stopImmediatePropagation(); v.style.cursor=drag.mode==='move'?'move':'crosshair'; },true);
    v.addEventListener('pointermove',e=>{ if(!drag) return; e.stopImmediatePropagation(); const L=this._lastL, k=toImg(L), o=Object.assign({},drag.o0);
      if(drag.mode==='move'){ o.x=drag.o0.x+(e.clientX-drag.x0)*k.sx; o.y=drag.o0.y+(e.clientY-drag.y0)*k.sy; }
      else if(drag.mode==='rot'){ let a=drag.o0.rot+(Math.atan2(e.clientY-drag.c.y,e.clientX-drag.c.x)-drag.a0)*180/Math.PI; if(e.metaKey) a=Math.round(a/15)*15; o.rot=((a+540)%360)-180; }
      else { o.scale=Math.max(0.2,Math.min(5,drag.o0.scale*Math.hypot(e.clientX-drag.c.x,e.clientY-drag.c.y)/Math.max(8,drag.d0))); }
      drag.t.set(o); this.changed(); this.placeBox(); UI.refresh(); },true);
    const end=e=>{ if(!drag) return; e.stopImmediatePropagation(); drag=null; v.style.cursor=''; this.commit(); };
    v.addEventListener('pointerup',end,true); v.addEventListener('pointercancel',end,true);
    v.addEventListener('dblclick',e=>{ const t=T(); if(!t) return; t.set({x:0,y:0,scale:1,rot:0}); this.changed(); this.commit(); this.placeBox(); UI.refresh(); this.toast('Placement reset'); });
    v.addEventListener('wheel',e=>{ const t=T(); if(!t||Engine.view.mode!=='fit') return; e.preventDefault(); const o=t.get();
      if(e.shiftKey||e.altKey){ o.rot=((o.rot-(e.deltaY||e.deltaX)*0.15+540)%360)-180; } else o.scale=Math.max(0.2,Math.min(5,o.scale*Math.exp(-e.deltaY*0.0015)));
      t.set(o); this.changed(); this.placeBox(); UI.refresh(); clearTimeout(this._pw); this._pw=setTimeout(()=>this.commit(),400); },{passive:false});
    // trackpad pinch-rotate (Safari / WKWebView gesture events)
    let g0=null; v.addEventListener('gesturestart',e=>{ const t=T(); if(!t) return; e.preventDefault(); g0={t,o:t.get()}; });
    v.addEventListener('gesturechange',e=>{ if(!g0) return; e.preventDefault(); const o=Object.assign({},g0.o); o.scale=Math.max(0.2,Math.min(5,g0.o.scale*e.scale)); o.rot=((g0.o.rot+e.rotation+540)%360)-180; g0.t.set(o); this.changed(); this.placeBox(); });
    v.addEventListener('gestureend',()=>{ if(g0){ g0=null; this.commit(); UI.refresh(); } });
  },
  bindViewer(){
    const v=$('#view'); const ptrs=new Map(); let g=null, lastTap=0; this.bindPlace(v);
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
  shortcuts(){ this.shortcutSheet(); },
  ask(title,value){ return new Promise(res=>{ const body=$('#dlgBody'), kept=[...body.childNodes], wasOn=$('#dlg').classList.contains('on'), okFn=$('#dlgOk').onclick, cFn=$('#dlgCancel').onclick; body.innerHTML=''; const h=$('#dlg h2'), ok=$('#dlgOk'), keepH=h.textContent, keepOk=ok.textContent; h.textContent=title; ok.textContent='OK';
      const i=document.createElement('input'); i.className='askIn'; i.value=value||''; i.spellcheck=false; body.appendChild(i); $('#dlg').classList.add('on'); setTimeout(()=>{ i.focus(); i.select(); },30);
      const done=v=>{ $('#dlg').classList.toggle('on',wasOn); h.textContent=keepH; ok.textContent=keepOk; body.innerHTML=''; kept.forEach(n=>body.appendChild(n)); ok.onclick=okFn; $('#dlgCancel').onclick=cFn; res(v); };
      i.onkeydown=e=>{ e.stopPropagation(); if(e.key==='Enter') done(i.value); if(e.key==='Escape') done(null); };
      ok.onclick=()=>done(i.value); $('#dlgCancel').onclick=()=>done(null); }); },
  ring(x,y){ const r=$('#ring'), b=$('#viewer').getBoundingClientRect(); r.style.left=(x-b.left)+'px'; r.style.top=(y-b.top)+'px'; r.classList.add('on'); clearTimeout(this._rt); this._rt=setTimeout(()=>r.classList.remove('on'),800); },
  busy(m){ $('#busy').classList.toggle('on',!!m); $('#busyMsg').textContent=m||''; },
  toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(this._to); this._to=setTimeout(()=>t.classList.remove('on'),2600); },
};
window.addEventListener('DOMContentLoaded',()=>App.start());
