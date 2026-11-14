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
  ['Double exposure · In-camera', {dblMode:'add',dblAmt:70}],
  ['Double exposure · Silhouette', {dblMode:'silhouette',dblAmt:100,dblMask:0}],
];
const STUDIO_KEYS = ['silver','sFilterHue','sFilterAmt','structure','sBurn','sBurnSize','sTone','sToneAmt','ttOn','ttPalette','ttGhost','ttMono','ttDX','ttDY','ttScale','ttBand','ttBandPos',
  'dblId','dblMode','dblAmt','dblEv','dblScale','dblX','dblY','dblRot','dblFlip','dblMask','leakAmt','leakColor','leakPos','leakSize','leakSeed',
  'dustAmt','scratchAmt','hairAmt','dustSeed','dustKind','zoomBlur','motionBlur','motionAngle','softEdges','tiltShift','tiltPos','tiltWidth','fringe','distort'];

const Studio = {
  host:null,
  init(host){ this.host=host; },
  P(){ return Engine.p; },
  set(k){ return v=>{ this.P()[k]=v; this.host.changed(); }; },
  S(parent,key,label,o){ return UI.slider(parent,'st_'+key,label,Object.assign({def:DEFAULTS[key],get:()=>this.P()[key],set:this.set(key),commit:()=>this.host.commit()},o)); },
  sel(parent,key,label,opts){ return UI.select(parent,'st_'+key,label,()=>opts,()=>String(this.P()[key]),v=>{ const d=DEFAULTS[key]; this.P()[key]= typeof d==='number'?+v:v; this.host.changed(); this.host.commit(); }); },
  reset(keys){ keys.forEach(k=>this.P()[k]=cloneParams(DEFAULTS[k])); this.host.changed(); this.host.commit(); UI.refresh(); },
  recipeParams(r){ const o=cloneParams(this.P()); Object.assign(o,cloneParams(r)); if(r.border==='wetplate'&&!o.edgeText) o.edgeText='none'; return o; },
  applyRecipe(r,name){ const keep=this.P().dblId; Object.assign(Engine.p,this.recipeParams(r)); if(keep&&!r.dblId) Engine.p.dblId=keep;
    if(r.dblMode && !Engine.p.dblId) this.host.toast('Pick the second photo in Double Exposure'); this.host.changed(); this.host.commit(); UI.refresh(); this.host.toast('Applied '+name); },
  resetAll(){ this.reset(STUDIO_KEYS); if(this.P().border==='wetplate') this.P().border='none'; Engine.setDouble(null); this.host.changed(); },

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
    b=UI.panel(root,'sLeak','Light Leaks',false,()=>this.reset(['leakAmt','leakColor','leakPos','leakSize','leakSeed']));
    this.S(b,'leakAmt','Amount',{min:0,max:150,step:1});
    this.sel(b,'leakColor','Color',[['warm','Warm orange'],['red','Red'],['yellow','Golden'],['magenta','Magenta'],['blue','Blue']]);
    this.sel(b,'leakPos','From',[['0','Left edge'],['1','Right edge'],['2','Top'],['3','Bottom'],['4','Top-left'],['5','Top-right'],['6','Bottom-left'],['7','Bottom-right']]);
    this.S(b,'leakSize','Size',{min:5,max:120,step:1});
    { const r=document.createElement('div'); r.className='btnrow'; b.appendChild(r); UI.button(r,'Shuffle shape',()=>{ P().leakSeed=Math.round(Math.random()*999); H.changed(); H.commit(); }); }
    }
    // ---------------------------------------------------------------- Dust & scratches
    if(want('sDust')){
    b=UI.panel(root,'sDust','Dust & Scratches',false,()=>this.reset(['dustAmt','scratchAmt','hairAmt','dustSeed','dustKind']));
    this.S(b,'dustAmt','Dust',{min:0,max:100,step:1}); this.S(b,'scratchAmt','Scratches',{min:0,max:100,step:1}); this.S(b,'hairAmt','Hair & fibres',{min:0,max:100,step:1});
    this.sel(b,'dustKind','Looks like',[['scan','Scanned negative (white specks)'],['print','Darkroom print (dark specks)']]);
    { const r=document.createElement('div'); r.className='btnrow'; b.appendChild(r); UI.button(r,'Shuffle',()=>{ P().dustSeed=Math.round(Math.random()*999); H.changed(); H.commit(); }); }
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
  buildRecipes(el,onHover){
    el.innerHTML='';
    STUDIO_RECIPES.forEach(([name,r])=>{ const d=document.createElement('div'); d.className='preset recipe'; d.textContent=name;
      d.onclick=()=>this.applyRecipe(r,name); if(onHover){ d.onmouseenter=()=>onHover(this.recipeParams(r)); d.onmouseleave=()=>onHover(null); } el.appendChild(d); });
  },
};
