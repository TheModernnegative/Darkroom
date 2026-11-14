// Studio: creative effects kept out of Develop — Silver (B&W lab), Two-Tone Flash, Double Exposure,
// Light Leaks, Dust & Scratches, Lens effects, plus one-click Recipes.  Shared by the Mac and phone apps.
// Uses UI.panel / UI.slider / UI.select / UI.check / UI.button / UI.note (phone app maps these to its widgets).
const FILTERS = [['none','No filter',0,0],['red','Red  (dark skies, light skin)',0,85],['orange','Orange',30,70],['yellow','Yellow  (classic)',60,55],
  ['green','Green  (foliage, ruddy skin)',120,65],['blue','Blue  (orthochromatic look)',230,75]];
const STUDIO_RECIPES = [
  ['Silver · Classic contrast', {silver:true,sFilterHue:30,sFilterAmt:60,structure:25,contrast:30,sBurn:30,sBurnSize:40,sTone:'none'}],
  ['Silver · Red filter skies', {silver:true,sFilterHue:0,sFilterAmt:90,structure:30,contrast:20,sBurn:20,sTone:'none'}],
  ['Silver · Fine art selenium', {silver:true,sFilterHue:60,sFilterAmt:40,structure:10,sTone:'selenium',sToneAmt:70,sBurn:20}],
  ['Silver · Soft & airy', {silver:true,sFilterHue:60,sFilterAmt:30,structure:-25,contrast:-20,shadows:30,sTone:'platinum',sToneAmt:50}],
  ['Silver · Gritty street', {silver:true,sFilterHue:30,sFilterAmt:50,structure:65,contrast:45,grain:1.8,grainSize:1.4,sBurn:45}],
  ['Silver · Split tone', {silver:true,sFilterHue:60,sFilterAmt:45,structure:15,sTone:'split',sToneAmt:80,sBurn:25}],
  ['Wet plate / tintype', {silver:true,sFilterHue:230,sFilterAmt:80,structure:35,contrast:20,sTone:'tintype',sToneAmt:95,sBurn:55,sBurnSize:45,border:'wetplate',dustAmt:30,scratchAmt:20,hairAmt:10,softEdges:25}],
  ['Cyanotype', {silver:true,sFilterHue:230,sFilterAmt:40,structure:10,sTone:'cyanotype',sToneAmt:100,sBurn:20}],
  ['Two-tone flash · Red / cyan', {ttOn:true,ttPalette:'red-cyan',ttGhost:80,ttMono:85,ttDX:6,ttDY:-4,ttScale:100,ttBand:0}],
  ['Two-tone flash · Slit band', {ttOn:true,ttPalette:'red-cyan',ttGhost:90,ttMono:90,ttDX:-4,ttDY:-12,ttScale:104,ttBand:38,ttBandPos:48}],
  ['Two-tone flash · Pink / blue', {ttOn:true,ttPalette:'pink-blue',ttGhost:75,ttMono:70,ttDX:5,ttDY:3,ttScale:103,ttBand:0}],
  ['Light leak · Sunset', {leakAmt:60,leakColor:'warm',leakPos:1,leakSize:55}],
  ['Light leak · Red edge', {leakAmt:70,leakColor:'red',leakPos:0,leakSize:35}],
  ['Expired & dusty', {leakAmt:30,leakColor:'yellow',leakPos:5,dustAmt:45,scratchAmt:25,hairAmt:20,softEdges:30,fringe:20,falloff:0.8}],
  ['Toy camera', {softEdges:60,fringe:40,falloff:1.2,leakAmt:25,leakColor:'magenta',saturation:20,contrast:15}],
  ['Zoom burst', {zoomBlur:55}],
  ['Tilt-shift miniature', {tiltShift:70,tiltPos:58,tiltWidth:16,saturation:25,contrast:15}],
  ['Analog · Expired roll', {fx:{leak:{pick:0,amt:55},dust:{pick:0,amt:60},texture:{pick:0,amt:25}},softEdges:20,fringe:15,falloff:0.6,saturation:-10}],
  ['Analog · Burnt ending', {fx:{burn:{pick:0,amt:85},dust:{pick:1,amt:40}},contrast:10}],
  ['Analog · Summer leak', {fx:{leak:{pick:1,amt:80},flare:{pick:0,amt:45}},saturation:10}],
  ['Analog · Lomo', {fx:{leak:{pick:2,amt:50},frame:{pick:0,amt:100}},softEdges:45,fringe:30,falloff:1.3,saturation:25,contrast:20}],
  ['Analog · Darkroom print', {silver:true,sFilterHue:60,sFilterAmt:40,structure:20,sTone:'selenium',sToneAmt:40,fx:{texture:{pick:1,amt:35},dust:{pick:2,amt:45,invert:true},frame:{pick:1,amt:100}}}],
  ['Double exposure · In-camera', {dblMode:'add',dblAmt:70}],
  ['Double exposure · Silhouette', {dblMode:'silhouette',dblAmt:100,dblMask:0}],
];
const STUDIO_KEYS = ['silver','sFilterHue','sFilterAmt','structure','sBurn','sBurnSize','sTone','sToneAmt','ttOn','ttPalette','ttGhost','ttMono','ttDX','ttDY','ttScale','ttBand','ttBandPos',
  'dblId','dblMode','dblAmt','dblEv','dblScale','dblX','dblY','dblRot','dblFlip','dblMask','leakAmt','leakColor','leakPos','leakSize','leakSeed',
  'dustAmt','scratchAmt','hairAmt','dustSeed','dustKind','fx','zoomBlur','motionBlur','motionAngle','softEdges','tiltShift','tiltPos','tiltWidth','fringe','distort'];

const Studio = {
  host:null,
  init(host){ this.host=host; },
  P(){ return Engine.p; },
  set(k){ return v=>{ this.P()[k]=v; this.host.changed(); }; },
  S(parent,key,label,o){ return UI.slider(parent,'st_'+key,label,Object.assign({def:DEFAULTS[key],get:()=>this.P()[key],set:this.set(key),commit:()=>this.host.commit()},o)); },
  sel(parent,key,label,opts){ return UI.select(parent,'st_'+key,label,()=>opts,()=>String(this.P()[key]),v=>{ const d=DEFAULTS[key]; this.P()[key]= typeof d==='number'?+v:v; this.host.changed(); this.host.commit(); }); },
  reset(keys){ keys.forEach(k=>this.P()[k]=cloneParams(DEFAULTS[k])); this.host.changed(); this.host.commit(); UI.refresh(); },
  // ---- asset layers
  assets(cat){ return (Engine.assetList||[]).filter(a=>a.cat===cat); },
  resolveFx(fx){ const out={}; for(const cat in fx||{}){ const L=Object.assign({},fx[cat]); if(L.pick!==undefined){ const list=this.assets(cat); if(!list.length) continue; L.id=list[L.pick%list.length].id; delete L.pick; } out[cat]=L; } return out; },
  layer(cat){ const p=this.P(); if(!p.fx||p.fx===DEFAULTS.fx) p.fx={}; return p.fx[cat]||(p.fx[cat]={id:'',amt:0}); },
  recipeParams(r){ const o=cloneParams(this.P()); r=cloneParams(r); if(r.fx){ r.fx=this.resolveFx(r.fx); if(r.border==='wetplate'&&r.fx.frame) delete r.border; } Object.assign(o,r);
    if(r.border==='wetplate'){ const t=this.assets('frame').find(a=>/tintype|wetplate|wet-plate/i.test(a.id+a.name)); if(t){ delete o.border; o.border=this.P().border; o.fx=Object.assign({},o.fx,{frame:{id:t.id,amt:100}}); } } if(r.border==='wetplate'&&!o.edgeText) o.edgeText='none'; return o; },
  applyRecipe(r,name){ const keep=this.P().dblId; Object.assign(Engine.p,this.recipeParams(r)); if(keep&&!r.dblId) Engine.p.dblId=keep;
    if(r.dblMode && !Engine.p.dblId) this.host.toast('Pick the second photo in Double Exposure'); this.host.changed(); this.host.commit(); UI.refresh(); this.host.toast('Applied '+name); },
  resetAll(){ this.dragTarget=null; this.reset(STUDIO_KEYS); this.P().fx={}; if(this.P().border==='wetplate') this.P().border='none'; Engine.setDouble(null); this.host.changed(); },

  build(root,only){
    root.innerHTML=''; const H=this.host, P=()=>this.P(); const want=id=>!only||only===id; let b;
    // ---------------------------------------------------------------- Silver
    if(want('sSilver')){
    b=UI.panel(root,'sSilver','Silver — Black & White',true,()=>this.reset(['silver','sFilterHue','sFilterAmt','structure','sBurn','sBurnSize','sTone','sToneAmt']));
    UI.check(b,'st_silver','Convert to black & white',()=>P().silver,v=>{ P().silver=v; H.changed(); H.commit(); });
    UI.select(b,'st_filter','Color filter',()=>FILTERS.map(f=>[f[0],f[1]]),()=>{ const f=FILTERS.find(f=>f[3]&&Math.abs(f[2]-P().sFilterHue)<1)||FILTERS[0]; return P().sFilterAmt>0?f[0]:'none'; },
      v=>{ const f=FILTERS.find(x=>x[0]===v); P().sFilterHue=f[2]; P().sFilterAmt=f[3]; if(f[3]) P().silver=true; H.changed(); H.commit(); UI.refresh(); });
    this.S(b,'sFilterHue','Filter hue',{min:0,max:359,step:1,fmt:x=>Math.round(x)+'°',track:'linear-gradient(90deg,#f33,#fb3,#3f3,#3ff,#33f,#f3f,#f33)'});
    this.S(b,'sFilterAmt','Filter strength',{min:0,max:100,step:1});
    UI.select(b,'st_bwfilm','Film',()=>[['', 'Keep current film']].concat(Engine.manifest.stocks.filter(s=>s.type==='bw'&&!s.instant).map(s=>[s.id,s.maker+' '+s.name])),()=>'',
      async v=>{ if(!v) return; await H.setStock(v); P().silver=true; H.changed(); H.commit(); UI.refresh(); });
    this.S(b,'structure','Structure',{min:-100,max:100,step:1});
    this.S(b,'sBurn','Burn edges',{min:0,max:100,step:1}); this.S(b,'sBurnSize','Burn size',{min:5,max:90,step:1});
    UI.select(b,'st_tone','Toner',()=>[['none','None'],['selenium','Selenium'],['sepia','Sepia'],['gold','Gold'],['platinum','Platinum'],['copper','Copper'],['cyanotype','Cyanotype'],['tintype','Tintype'],['ambrotype','Ambrotype'],['split','Split (cool shadows, warm highlights)']],()=>P().sTone,v=>{ P().sTone=v; H.changed(); H.commit(); });
    this.S(b,'sToneAmt','Toner strength',{min:0,max:100,step:1});
    UI.note(b,'Filters work like real glass on the lens, before the film — red darkens blue skies, green lightens foliage. Contrast, curve and grain from Develop still apply.');
    }
    // ---------------------------------------------------------------- Two-tone flash
    if(want('sTwoTone')){
    b=UI.panel(root,'sTwoTone','Two-Tone Flash',false,()=>this.reset(['ttOn','ttPalette','ttGhost','ttMono','ttDX','ttDY','ttScale','ttBand','ttBandPos']));
    UI.check(b,'st_tt','Two coloured flashes',()=>P().ttOn,v=>{ P().ttOn=v; H.changed(); H.commit(); });
    this.sel(b,'ttPalette','Gels',[['red-cyan','Red / Cyan'],['magenta-green','Magenta / Green'],['blue-orange','Blue / Orange'],['pink-blue','Pink / Blue'],['purple-yellow','Purple / Yellow'],['red-blue','Red / Blue']]);
    this.S(b,'ttGhost','Second flash',{min:0,max:150,step:1});
    this.S(b,'ttMono','Gel purity',{min:0,max:100,step:1});
    this.S(b,'ttDX','Ghost offset ←→',{min:-30,max:30,step:0.5,fmt:x=>(x>0?'+':'')+x.toFixed(1)});
    this.S(b,'ttDY','Ghost offset ↑↓',{min:-30,max:30,step:0.5,fmt:x=>(x>0?'+':'')+x.toFixed(1)});
    this.S(b,'ttScale','Ghost size',{min:70,max:140,step:1,fmt:x=>Math.round(x)+'%'});
    this.S(b,'ttBand','Slit band',{min:0,max:100,step:1,fmt:x=>x?Math.round(x)+'%':'Full frame'});
    this.S(b,'ttBandPos','Band position',{min:0,max:100,step:1});
    UI.note(b,'A rear-curtain style ghost: the frame lit by one gel, plus a shifted second exposure lit by the other.');
    }
    // ---------------------------------------------------------------- Double exposure
    if(want('sDouble')){
    b=UI.panel(root,'sDouble','Double Exposure',false,()=>{ this.reset(['dblId','dblMode','dblAmt','dblEv','dblScale','dblX','dblY','dblRot','dblFlip','dblMask']); Engine.setDouble(null); });
    if(H.doubleChooser) H.doubleChooser(b);
    this.sel(b,'dblMode','Blend',[['add','In-camera (add exposures)'],['screen','Screen'],['lighten','Lighten'],['darken','Darken'],['multiply','Multiply'],['silhouette','Silhouette (fill the brights)']]);
    this.S(b,'dblAmt','Amount',{min:0,max:100,step:1});
    this.S(b,'dblEv','Second exposure',{min:-3,max:3,step:0.05,fmt:x=>(x>0?'+':'')+x.toFixed(2)+' EV'});
    this.S(b,'dblScale','Scale',{min:0.3,max:3,step:0.01,fmt:x=>Math.round(x*100)+'%'});
    this.S(b,'dblX','Move ←→',{min:-0.6,max:0.6,step:0.005,fmt:x=>Math.round(x*100)});
    this.S(b,'dblY','Move ↑↓',{min:-0.6,max:0.6,step:0.005,fmt:x=>Math.round(x*100)});
    this.S(b,'dblRot','Rotate',{min:-180,max:180,step:0.5,fmt:x=>x.toFixed(1)+'°'});
    UI.check(b,'st_dflip','Flip second photo',()=>P().dblFlip,v=>{ P().dblFlip=v; H.changed(); H.commit(); });
    this.S(b,'dblMask','Silhouette threshold',{min:-60,max:60,step:1});
    UI.note(b,'In-camera adds the two exposures before the film, exactly like shooting twice on one frame.');
    }
    // ---------------------------------------------------------------- Light leaks
    if(want('sLeak')){
    b=UI.panel(root,'sLeak','Light Leaks',false,()=>{ this.reset(['leakAmt','leakColor','leakPos','leakSize','leakSeed']); this.clearLayer('leak'); });
    this.assetLayer(b,'leak','Scanned leaks');
    UI.note(b,'Or paint a simple procedural leak:');
    this.S(b,'leakAmt','Amount',{min:0,max:150,step:1});
    this.sel(b,'leakColor','Color',[['warm','Warm orange'],['red','Red'],['yellow','Golden'],['magenta','Magenta'],['blue','Blue']]);
    this.sel(b,'leakPos','From',[['0','Left edge'],['1','Right edge'],['2','Top'],['3','Bottom'],['4','Top-left'],['5','Top-right'],['6','Bottom-left'],['7','Bottom-right']]);
    this.S(b,'leakSize','Size',{min:5,max:120,step:1});
    { const r=document.createElement('div'); r.className='btnrow'; b.appendChild(r); UI.button(r,'Shuffle shape',()=>{ P().leakSeed=Math.round(Math.random()*999); H.changed(); H.commit(); }); }
    }
    // ---------------------------------------------------------------- Burns & flares
    if(want('sBurn')){
    b=UI.panel(root,'sBurn','Film Burns & Flares',false,()=>{ this.clearLayer('burn'); this.clearLayer('flare'); });
    this.assetLayer(b,'burn','Film burns'); this.assetLayer(b,'flare','Flares & glow');
    }
    // ---------------------------------------------------------------- Dust & scratches
    if(want('sDust')){
    b=UI.panel(root,'sDust','Dust & Scratches',false,()=>{ this.reset(['dustAmt','scratchAmt','hairAmt','dustSeed','dustKind']); this.clearLayer('dust'); });
    this.assetLayer(b,'dust','Scanned dust & scratches');
    UI.note(b,'Or generate fresh specks:');
    this.S(b,'dustAmt','Dust',{min:0,max:100,step:1}); this.S(b,'scratchAmt','Scratches',{min:0,max:100,step:1}); this.S(b,'hairAmt','Hair & fibres',{min:0,max:100,step:1});
    this.sel(b,'dustKind','Looks like',[['scan','Scanned negative (white specks)'],['print','Darkroom print (dark specks)']]);
    { const r=document.createElement('div'); r.className='btnrow'; b.appendChild(r); UI.button(r,'Shuffle',()=>{ P().dustSeed=Math.round(Math.random()*999); H.changed(); H.commit(); }); }
    }
    // ---------------------------------------------------------------- Texture + frames
    if(want('sTexture')){
    b=UI.panel(root,'sTexture','Paper & Texture',false,()=>this.clearLayer('texture'));
    this.assetLayer(b,'texture','Textures');
    }
    if(want('sFrameFx')){
    b=UI.panel(root,'sFrameFx','Frames & Edges',false,()=>this.clearLayer('frame'));
    this.assetLayer(b,'frame','Frames');
    UI.note(b,'Scanned negative carriers, plate edges and print borders, laid over the edges of the photo. Instant-film frames are under Develop → Frame.');
    }
    // ---------------------------------------------------------------- Lens
    if(want('sLens')){
    b=UI.panel(root,'sLens','Lens Effects',false,()=>this.reset(['zoomBlur','motionBlur','motionAngle','softEdges','tiltShift','tiltPos','tiltWidth','fringe','distort']));
    this.S(b,'softEdges','Soft edges',{min:0,max:100,step:1});
    this.S(b,'fringe','Color fringing',{min:0,max:100,step:1});
    this.S(b,'distort','Distortion',{min:-80,max:60,step:1,fmt:x=>x<0?'Barrel '+Math.round(-x):x>0?'Pincushion '+Math.round(x):'0'});
    this.S(b,'zoomBlur','Zoom blur',{min:0,max:100,step:1});
    this.S(b,'motionBlur','Motion blur',{min:0,max:100,step:1}); this.S(b,'motionAngle','Motion angle',{min:-90,max:90,step:1,fmt:x=>Math.round(x)+'°'});
    this.S(b,'tiltShift','Tilt-shift blur',{min:0,max:100,step:1}); this.S(b,'tiltPos','Focus line',{min:0,max:100,step:1}); this.S(b,'tiltWidth','Focus width',{min:2,max:80,step:1});
    UI.note(b,'Judge blur and fringing at 1:1 — the preview is computed at screen size.');
    }
  },
  // what a drag on the photo moves: the double exposure, or a leak / burn / flare / dust layer
  placeTarget(){ const p=this.P(), off=p.off||{}; let t=this.dragTarget;
    if(t&&t!=='dbl'){ const Ly=(p.fx||{})[t]; if(!Ly||!Ly.id||!(Ly.amt>0)||off['fx_'+t]||!['leak','burn','flare','dust'].includes(t)) t=null; }
    if(t==='dbl'&&!(p.dblId&&Engine.dblSrc&&!off.dbl)) t=null;
    if(!t){ if(p.dblId&&Engine.dblSrc&&!off.dbl) t='dbl'; else return null; }
    if(t==='dbl') return {kind:t,get:()=>({x:p.dblX||0,y:p.dblY||0,scale:p.dblScale||1,rot:p.dblRot||0}),set:o=>{ p.dblX=o.x; p.dblY=o.y; p.dblScale=o.scale; p.dblRot=o.rot; },B:Engine.dblSrc.w/Engine.dblSrc.h};
    const Ly=p.fx[t], tx=Engine.assetTex(Ly.id); if(!tx) return null;
    return {kind:t,get:()=>({x:Ly.x||0,y:Ly.y||0,scale:Ly.scale||1,rot:Ly.rot||0}),set:o=>{ Object.assign(Ly,{x:o.x,y:o.y,scale:o.scale,rot:o.rot}); },B:tx.w/tx.h}; },
  clearLayer(cat){ const p=this.P(); if(p.fx&&p.fx[cat]){ p.fx=Object.assign({},p.fx); delete p.fx[cat]; } if(this.dragTarget===cat) this.dragTarget=null; this.host.changed(); this.host.commit(); UI.refresh(); this.refreshAssets(); },
  // a thumbnail grid of library assets + the controls for the chosen one
  assetLayer(b,cat,label){ const H=this.host, P=()=>this.P(), L=()=>this.layer(cat), movable=['leak','burn','flare','dust'].includes(cat);
    const wrap=document.createElement('div'); wrap.className='alayer'; b.appendChild(wrap);
    const hd=document.createElement('div'); hd.className='ahead'; hd.textContent=label; wrap.appendChild(hd);
    const grid=document.createElement('div'); grid.className='agrid'; wrap.appendChild(grid);
    const ctl=document.createElement('div'); ctl.className='actl'; wrap.appendChild(ctl);
    const set=(k,v)=>{ L()[k]=v; H.changed(); };
    const sl=(k,lab,o,def)=>UI.slider(ctl,'fx_'+cat+'_'+k,lab,Object.assign({def,get:()=>{ const x=(P().fx||{})[cat]; return x&&x[k]!==undefined?x[k]:def; },set:v=>set(k,v),commit:()=>H.commit()},o));
    sl('amt','Amount',{min:0,max:100,step:1},0);
    if(cat!=='frame'){ sl('scale','Scale',{min:0.3,max:4,step:0.01,fmt:x=>Math.round(x*100)+'%'},1); }
    sl('rot','Rotate',{min:-180,max:180,step:0.5,fmt:x=>x.toFixed(0)+'°'},0);
    if(['leak','burn','flare'].includes(cat)) sl('hue','Color shift',{min:-180,max:180,step:1,fmt:x=>Math.round(x)+'°',track:'linear-gradient(90deg,#3cf,#93f,#f36,#f93,#fc3,#3f9,#3cf)'},0);
    const row=document.createElement('div'); row.className='btnrow'; ctl.appendChild(row);
    UI.button(row,'Flip',()=>{ L().flip=!L().flip; H.changed(); H.commit(); });
    if(cat==='dust'||cat==='frame') UI.button(row,'Invert',()=>{ L().invert=!L().invert; H.changed(); H.commit(); });
    if(movable) UI.button(row,'Place with mouse',()=>{ this.dragTarget=cat; H.changed(); H.toast&&H.toast('Drag on the photo to move it · scroll to scale · ⇧-drag to rotate'); });
    const render=()=>{ grid.innerHTML=''; const list=this.assets(cat), cur=((P().fx||{})[cat]||{}).id||'';
      const none=document.createElement('div'); none.className='atile none'+(cur?'':' on'); none.innerHTML='<span>None</span>'; none.onclick=()=>this.clearLayer(cat); grid.appendChild(none);
      if(!list.length){ const n=document.createElement('div'); n.className='note'; n.style.gridColumn='2/-1'; n.textContent=Engine.assetList?'No assets installed yet.':'Loading the asset library…'; grid.appendChild(n); }
      list.forEach(a=>{ const t=document.createElement('div'); t.className='atile'+(a.id===cur?' on':''); t.title=a.name;
        t.innerHTML=`<img loading="lazy" src="data/assets/${a.thumb}"><span></span>`; t.querySelector('span').textContent=a.name;
        t.onclick=()=>{ const Ly=L(); if(Ly.id===a.id){ this.clearLayer(cat); return; } Object.assign(Ly,{id:a.id,amt:Ly.amt>0?Ly.amt:(cat==='frame'?100:cat==='texture'?40:70)}); if(movable) this.dragTarget=cat; H.changed(); H.commit(); UI.refresh(); this.refreshAssets(); };
        if(H.hover) { t.onmouseenter=()=>{ const o=cloneParams(P()); o.fx=Object.assign({},o.fx,{[cat]:Object.assign({},(o.fx||{})[cat]||{},{id:a.id,amt:((o.fx||{})[cat]||{}).amt||(cat==='frame'?100:70)})}); H.hover(o); }; t.onmouseleave=()=>H.hover(null); }
        grid.appendChild(t); });
      ctl.style.display=cur?'':'none'; };
    render(); (this._agrids=this._agrids||[]).push([grid,render]); },
  // Develop → Frame → Wet plate uses the best tintype plate from the library
  loadPlate(){ const a=(Engine.assetList||[]).find(a=>a.id==='frame_tintype_1')||(Engine.assetList||[]).find(a=>a.cat==='frame'&&/tintype|plate/i.test(a.id)); if(!a||typeof Borders==='undefined') return;
    const im=new Image(); im.onload=()=>{ Borders.plateImg=im; Borders.cache.key=''; Engine.dirty=true; this.host.changed&&this.host.changed(); }; im.src='data/assets/'+a.file; },
  refreshAssets(){ this._agrids=(this._agrids||[]).filter(([g])=>g.isConnected||!this._agridsSeen); this._agridsSeen=true; this._agrids.forEach(([g,f])=>f()); },
  // ---- 🎲 random looks: a coherent theme, then random choices inside it
  randomLook(){ const p=this.P(); if(p.dblId) this._lastDbl=p.dblId; const keep=p.dblId||this._lastDbl, R=(a,b)=>a+Math.random()*(b-a), RI=(a,b)=>Math.round(R(a,b)), pick=a=>a[Math.floor(Math.random()*a.length)], chance=x=>Math.random()<x;
    STUDIO_KEYS.forEach(k=>p[k]=cloneParams(DEFAULTS[k])); p.fx={}; p.off=Object.assign({},p.off||{}); Object.keys(p.off).forEach(k=>{ if(/^(silver|twotone|dbl|leak|dust|lensfx|fx_)/.test(k)) delete p.off[k]; });
    const lay=(cat,amt,o)=>{ const l=this.assets(cat); if(!l.length) return false; p.fx[cat]=Object.assign({id:pick(l).id,amt,rot:chance(.5)?0:RI(-25,25),flip:chance(.5),scale:R(0.9,1.6),x:R(-.2,.2),y:R(-.2,.2),hue:chance(.3)?RI(-60,60):0},o||{}); return true; };
    const themes=['analog','analog','silver','silver','toy','twotone','dreamy','burnt'].concat(keep?['double','double']:[]);
    const th=pick(themes);
    if(th==='analog'||th==='burnt'){ if(!lay('leak',RI(40,90))) { p.leakAmt=RI(40,100); p.leakColor=pick(['warm','red','yellow','magenta']); p.leakPos=RI(0,7); p.leakSize=RI(25,90); }
      if(th==='burnt'||chance(.4)) lay('burn',RI(60,100)); if(chance(.7)) lay('dust',RI(30,70),{x:0,y:0,rot:0}); else { p.dustAmt=RI(20,60); p.scratchAmt=RI(0,40); }
      if(chance(.4)) lay('texture',RI(15,40),{x:0,y:0}); if(chance(.35)) lay('frame',100,{x:0,y:0,rot:0,scale:1,hue:0});
      p.softEdges=RI(0,40); p.fringe=RI(0,30); }
    if(th==='silver'){ p.silver=true; const f=pick(FILTERS.slice(1)); p.sFilterHue=f[2]; p.sFilterAmt=RI(30,95); p.structure=RI(-20,70); p.sBurn=RI(10,60); p.sBurnSize=RI(25,60);
      p.sTone=pick(['none','selenium','sepia','gold','platinum','copper','split','cyanotype','tintype']); p.sToneAmt=RI(40,100);
      if(chance(.6)) lay('dust',RI(25,60),{x:0,y:0,rot:0,invert:chance(.5)}); if(chance(.4)) lay('texture',RI(20,45),{x:0,y:0}); if(chance(.45)) lay('frame',100,{x:0,y:0,rot:0,scale:1,hue:0}); if(chance(.2)) lay('burn',RI(40,80)); }
    if(th==='toy'){ p.softEdges=RI(40,80); p.fringe=RI(25,60); p.distort=RI(-40,-5); lay('leak',RI(30,70)); if(chance(.5)) lay('frame',100,{x:0,y:0,rot:0,scale:1,hue:0}); if(chance(.4)) p.zoomBlur=RI(10,35); }
    if(th==='twotone'){ p.ttOn=true; p.ttPalette=pick(['red-cyan','magenta-green','blue-orange','pink-blue','purple-yellow','red-blue']); p.ttGhost=RI(60,130); p.ttMono=RI(55,95); p.ttDX=R(-15,15); p.ttDY=R(-15,15); p.ttScale=RI(95,115); p.ttBand=chance(.35)?RI(20,60):0; p.ttBandPos=RI(20,80); if(chance(.4)) p.motionBlur=RI(10,40), p.motionAngle=RI(-60,60); }
    if(th==='dreamy'){ lay('flare',RI(50,90)); lay('leak',RI(30,60)); p.softEdges=RI(30,70); if(chance(.5)) p.zoomBlur=RI(5,25); p.fringe=RI(10,40); }
    if(th==='double'){ p.dblId=keep; p.dblMode=pick(['add','screen','lighten','silhouette']); p.dblAmt=RI(50,100); p.dblScale=R(0.9,1.8); p.dblX=R(-.25,.25); p.dblY=R(-.2,.2); p.dblRot=chance(.6)?0:RI(-30,30); p.dblFlip=chance(.4); if(chance(.5)) p.silver=true, p.sTone=pick(['none','selenium','sepia']); if(chance(.5)) lay('leak',RI(30,60)); this.dragTarget='dbl'; }
    else { p.dblId=''; Engine.setDouble(null); }
    if(th==='double'&&this.host.loadDouble) this.host.loadDouble().then(()=>{ Engine.dirty=true; });
    this.host.changed(); this.host.commit(); UI.refresh(); this.refreshAssets(); this.host.toast&&this.host.toast('🎲 '+{analog:'Analog accident',silver:'Silver print',toy:'Toy camera',twotone:'Two-tone flash',dreamy:'Dreamy flare',burnt:'Burnt roll',double:'Double exposure'}[th]+' — press again for another (⌘Z to undo)'); },
  // recipes as a Nik-style grid of live previews of the current photo
  buildRecipeGrid(el,onHover){ el.innerHTML=''; el.classList.add('rgrid'); this._rtiles=[];
    STUDIO_RECIPES.forEach(([name,r])=>{ const d=document.createElement('div'); d.className='rtile'; d.innerHTML='<div class="rim"></div><span></span>'; d.querySelector('span').textContent=name.replace(' · ',' — ');
      d.onclick=()=>this.applyRecipe(r,name); if(onHover){ d.onmouseenter=()=>onHover(this.recipeParams(r)); d.onmouseleave=()=>onHover(null); } el.appendChild(d); this._rtiles.push([d,r]); }); },
  // render the previews a few at a time so the UI stays responsive
  refreshRecipeThumbs(key){ if(!this._rtiles||!this.host.renderThumb||!Engine.src) return; if(key&&key===this._rkey) return; this._rkey=key; const job=this._rjob=(this._rjob||0)+1; let i=0;
    const step=()=>{ if(job!==this._rjob) return; const t0=performance.now();
      while(i<this._rtiles.length&&performance.now()-t0<24){ const [d,r]=this._rtiles[i++]; const u=this.host.renderThumb(this.recipeParams(r),220); if(u) d.querySelector('.rim').style.backgroundImage=`url(${u})`; }
      if(i<this._rtiles.length) setTimeout(step,16); };
    setTimeout(step,60); },
  buildRecipes(el,onHover){
    el.innerHTML='';
    STUDIO_RECIPES.forEach(([name,r])=>{ const d=document.createElement('div'); d.className='preset recipe'; d.textContent=name;
      d.onclick=()=>this.applyRecipe(r,name); if(onHover){ d.onmouseenter=()=>onHover(this.recipeParams(r)); d.onmouseleave=()=>onHover(null); } el.appendChild(d); });
  },
};
