// Develop engine: source → geometry (crop/rotate) → (WB, exposure, lens) → halation/glow → film LUT
// → tone (Basic, curve, HSL, colour grading) → grain → frame.  Output: Display P3 (or sRGB fallback).
const HSL_BANDS = [['Red',0],['Orange',30],['Yellow',60],['Green',120],['Aqua',180],['Blue',225],['Purple',270],['Magenta',315]];
const DEFAULTS = {
  stock:'original', paper:null, filmAmt:100, format:'35mm', autoExp:true, ev:0, temp:0, tint:0, hlExpand:0.55,
  contrast:0, highlights:0, shadows:0, whites:0, blacks:0, vibrance:0, saturation:0,
  grain:0, grainSize:1, grainRough:0.35, halation:0, glow:0, falloff:0, border:'none',
  crop:{x:0,y:0,w:1,h:1}, angle:0, rot:0, flip:false, aspect:'free',
  curve:{m:[[0,0],[1,1]], r:[[0,0],[1,1]], g:[[0,0],[1,1]], b:[[0,0],[1,1]]},
  hslH:[0,0,0,0,0,0,0,0], hslS:[0,0,0,0,0,0,0,0], hslL:[0,0,0,0,0,0,0,0],
  edgeText:'stock', edgeCustom:'', frameNo:0, frameTone:'auto',
  // Studio — Silver (B&W lab)
  silver:false, sFilterHue:30, sFilterAmt:0, structure:0, sBurn:0, sBurnSize:40, sTone:'none', sToneAmt:60,
  // Silver Efex-style controls (only act when silver is on)
  sBright:0, sBrightHi:0, sBrightSh:0, sContrast:0, sAmpW:0, sAmpB:0, sSoft:0, sStructHi:0, sStructMid:0, sStructSh:0, sFine:0,
  lookUndo:null, sSens:[0,0,0,0,0,0], sFilmType:'', sVig:0, sVigSize:50, sVigX:0, sVigY:0, sBurnT:0, sBurnB:0, sBurnL:0, sBurnR:0, sToneBal:0,
  // Studio — Analog
  dblId:'', dblMode:'add', dblAmt:60, dblEv:0, dblScale:1, dblX:0, dblY:0, dblRot:0, dblFlip:false, dblMask:0,
  dustOpacity:85, dustSize:100, dustSpread:'even', scratchDir:'vertical', leakAmt:0, leakColor:'warm', leakPos:1, leakSize:45, leakSeed:3,
  dustAmt:0, scratchAmt:0, hairAmt:0, dustSeed:7, dustKind:'scan',
  ttOn:false, ttPalette:'red-cyan', ttGhost:80, ttMono:85, ttDX:6, ttDY:-4, ttScale:100, ttBand:0, ttBandPos:45,
  // Analog media (tape, broadcast, CRT, small-gauge cine) — a post pass on the finished picture
  anOn:false, anMedium:'', anRes:0, anLines:0, anChroma:0, anShift:0, anBleed:0, anSharp:0, anGhost:0, anGhostOff:30, anNoise:0, anCNoise:0, anSnow:0,
  anTrack:0, anTrackPos:72, anHead:0, anDrop:0, anJitter:0, anInterlace:0, anSat:0, anHue:0, anTint:'none',
  anBlock:0, anScan:0, anScanN:480, anMask:'none', anMaskAmt:50, anCurve:0, anBloom:0, anVig:0, anCorner:0,
  anGate:'none', anOverscan:0, anGateSoft:30, anWeave:0, anFlicker:0, anOSD:'none', anOSDText:'',
  flare:0, flareLen:60, flareGhost:35, flareColor:'blue', flareSens:50,
  fx:{}, softness:0, distort:0, zoomBlur:0, motionBlur:0, motionAngle:0, softEdges:0, tiltShift:0, tiltPos:50, tiltWidth:20, fringe:0,
  sharpen:0, sharpRadius:1, nr:0, nrColor:0, push:0, masks:[],
  gShH:220, gShS:0, gShL:0, gMidH:40, gMidS:0, gMidL:0, gHiH:45, gHiS:0, gHiL:0, gBlend:50, gBalance:0,
};
const PER_PHOTO_KEYS = ['ev','temp','tint','crop','angle','rot','flip','aspect','masks'];
const MAX_MASKS = 4;
// sections that can be switched off without losing their settings (p.off = {grain:true, …})
const SECTIONS = { film:['filmAmt','push'], wb:['temp','tint'], tone:['ev','contrast','highlights','shadows','whites','blacks'], presence:['vibrance','saturation'],
  curve:['curve'], hsl:['hslH','hslS','hslL'], grade:['gShS','gShL','gMidS','gMidL','gHiS','gHiL'], detail:['sharpen','nr','nrColor'],
  grain:['grain'], halation:['halation','glow'], lens:['falloff','softness'], frame:['border'], masks:['masks'],
  silver:['silver','sFilterAmt','structure','sBurn'], dbl:['dblId'], leak:['leakAmt'], dust:['dustAmt','scratchAmt','hairAmt'],
  lensfx:['zoomBlur','motionBlur','softEdges','tiltShift','fringe','distort'], twotone:['ttOn'], flare:['flare'], analog:['anOn'], assets:['fx'] };
// Studio asset layers (scanned-look textures). Order = compositing order.
// lens flare colours: anamorphic streak tint, then the ghost tints
const FLARE_COLORS={ blue:[[.25,.55,1.7],[.35,.6,1.4],[.9,.5,1.3],[.4,1.,.7]], amber:[[1.7,.75,.22],[1.3,.7,.3],[.6,.9,.4],[1.2,.5,.6]], violet:[[1.,.35,1.7],[.7,.4,1.4],[.4,.8,1.2],[1.3,.6,.4]],
  teal:[[.25,1.3,1.25],[.3,1.,1.1],[1.1,.7,.4],[.5,.6,1.3]], red:[[1.8,.28,.2],[1.3,.4,.3],[.4,.7,1.1],[1.2,.9,.4]], gold:[[1.5,1.1,.4],[1.2,1.,.5],[.5,.7,1.2],[1.,.6,.4]],
  green:[[.4,1.6,.5],[.5,1.2,.6],[1.,.5,.9],[.5,.8,1.3]], white:[[1.1,1.1,1.1],[.9,.95,1.05],[1.,.9,.8],[.8,.9,1.1]] };
const FX_SLOTS=['leak','burn','flare','texture','dust','frame'];
const FX_MODE={leak:0,burn:0,flare:0,texture:2,dust:1,frame:1};
const TT_PALETTES = { 'red-cyan':['#ff1a24','#12e6e0'], 'magenta-green':['#ff2bd0','#2bff6a'], 'blue-orange':['#2a6bff','#ff8a1a'], 'pink-blue':['#ff5aa8','#3a8bff'], 'purple-yellow':['#9a3cff','#ffd21a'], 'red-blue':['#ff2020','#2a4dff'] };
const TONERS = { none:null, selenium:['#36303a','#f1f0f0'], sepia:['#3d2614','#f5e7d0'], gold:['#1d2a3c','#eef2f6'], platinum:['#2c2420','#f3ece1'],
  cyanotype:['#0c2550','#e6f0fa'], split:['#1a2840','#f6e5c6'], copper:['#43201a','#f6e2d6'], tintype:['#2a2418','#cfc6a8'], ambrotype:['#1e1a14','#e2d6b8'] };
const LEAK_COLORS = { warm:['#ff5a1a','#ffd27a'], red:['#ff1f10','#ff9a60'], yellow:['#ff9d00','#fff3a0'], magenta:['#ff2a8a','#ffb0d8'], blue:['#2a5cff','#bfe0ff'], white:['#e8e4dc','#ffffff'] };
const LEAK_POS = [[0,.5],[1,.5],[.5,0],[.5,1],[0,0],[1,0],[0,1],[1,1]];
function cloneParams(p){ return JSON.parse(JSON.stringify(p)); }
function withDefaults(p){ return Object.assign(cloneParams(DEFAULTS), cloneParams(p||{})); }
const FORMATS = { '35mm':{gauge:2.4,diag:43.3,label:'35mm'}, '645':{gauge:1.6,diag:69.8,label:'6×4.5'}, '6x6':{gauge:1.45,diag:79.2,label:'6×6'}, '6x7':{gauge:1.35,diag:89.6,label:'6×7'}, '4x5':{gauge:1.0,diag:162.6,label:'4×5'}, '8x10':{gauge:0.7,diag:325,label:'8×10'} };

const Engine = {
  manifest:null, luts:{}, src:null, p:withDefaults(), before:false, showClip:false, cropMode:false,
  view:{mode:'fit', cx:.5, cy:.5}, RT:{}, dirty:true, hoverParams:null, histDirty:true, outP3:false,

  init(canvas){
    this.canvas=canvas; const gl=GLU.init(canvas); this.gl=gl;
    try{ if('drawingBufferColorSpace' in gl){ gl.drawingBufferColorSpace='display-p3'; this.outP3 = gl.drawingBufferColorSpace==='display-p3'; } }catch(e){}
    this.P = {
      prep: GLU.program(GLU.QUAD_VS, PREP_FS),
      bright: GLU.program(GLU.QUAD_VS, BRIGHT_FS), pack: GLU.program(GLU.QUAD_VS, PACK_FS), analog: GLU.program(GLU.QUAD_VS, ANALOG_FS),
      blur: GLU.program(GLU.QUAD_VS, BLUR_FS),
      final: GLU.program(GLU.QUAD_VS, FINAL_FS),
      detail: GLU.program(GLU.QUAD_VS, DETAIL_FS),
      fx: GLU.program(GLU.QUAD_VS, FX_FS),
    };
    this.borderTex = GLU.tex2D(1,1,'rgba8',new Uint8Array([0,0,0,0]));
    this.curveTex = GLU.tex2D(256,1,'rgba16f',null);
    this.curveKey='';
    this.grainSeed = (Math.random()*4294967295)>>>0;
  },
  async loadManifest(){
    const r = await fetch('data/manifest.json'); this.manifest = await r.json();
    this.stockById = {}; this.manifest.stocks.forEach(s=>this.stockById[s.id]=s);
  },
  stock(id){ return this.stockById[id||this.p.stock] || this.manifest.stocks[0]; },
  paperFor(p){ const s=this.stock(p.stock); return s.papers.find(x=>x.id===p.paper) || s.papers[0]; },
  async lut(name){
    if(this.luts[name]) return this.luts[name];
    const gl=this.gl, N=this.manifest.lutSize;
    let buf=null;
    try{ const r=await fetch('data/luts/'+name+'.bin'); if(r.ok) buf=await r.arrayBuffer(); }catch(e){}
    if(!buf || buf.byteLength!==N*N*N*6){
      const j=await (await fetch('data/luts/'+name+'.json')).json(); const bin=atob(j.b64);
      const u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); buf=u8.buffer; }
    const t=gl.createTexture(); gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_3D,t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB16F,N,N,N,0,gl.RGB,gl.HALF_FLOAT,new Uint16Array(buf));
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D,k,v);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
    return this.luts[name]=t;
  },
  isOriginal(p){ return !!(p&&(p.filmOff||this.stock(p.stock).type==='original')); },
  async ensureLuts(p){ const l=this.paperFor(p).lut; if(l) await this.lut(l); },

  setSource(src){ this.src=src; this.dirty=true; this.histDirty=true; },
  keyFromSamples(lum, w, h){
    let s=0, ws=0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const Y=lum[y*w+x]; if(!(Y>=0)) continue;
      const dx=(x/w-.5)/.35, dy=(y/h-.5)/.35, wt=Math.exp(-(dx*dx+dy*dy)); s+=wt*Math.log(Math.max(Y,1e-5)); ws+=wt; }
    return Math.exp(s/ws);
  },

  // ---------------------------------------------------------------- geometry
  // parameters actually rendered: switched-off sections fall back to neutral
  eff(p){ if(p&&typeof Borders!=='undefined'&&Borders.isFilm(p.border)){ const fs=Borders.forFormat(p.format); if(p.border!==fs) p=Object.assign({},p,{border:fs}); }
    if(!p||!p.off) return p; const o=Object.assign({},p); let any=false;
    for(const k in p.off){ if(p.off[k]&&k.startsWith('fx_')){ o.fx=Object.assign({},o.fx); const c=k.slice(3); Object.keys(o.fx).forEach(q=>{ if(q.replace(/\d+$/,'')===c) delete o.fx[q]; }); any=true; continue; } if(!p.off[k]||!SECTIONS[k]) continue; any=true; SECTIONS[k].forEach(key=>o[key]= key==='filmAmt'?0 : cloneParams(DEFAULTS[key])); if(k==='film') o.filmOff=true; }
    if(!any) return p; delete o.off; return o; },
  oriented(p,src){ src=src||this.src; return (p.rot&1)?[src.h,src.w]:[src.w,src.h]; },
  // output (cropped) size in source pixels. In crop mode the whole rotated canvas is shown.
  dims(p,src,full){ p=p||this.p; src=src||this.src; if(!src) return [1,1];
    const [W,H]=this.oriented(p,src); if(full) return [W,H];
    return [Math.max(1,p.crop.w*W), Math.max(1,p.crop.h*H)]; },
  // affine map: output uv (u, v-from-top) → source uv, row-major 3x3
  geom(p,src,full){
    src=src||this.src; const [W,H]=this.oriented(p,src);
    const c = full ? {x:0,y:0,w:1,h:1} : p.crop;
    const A=[c.w*W,0,c.x*W, 0,c.h*H,c.y*H, 0,0,1];
    const a=-(p.angle||0)*Math.PI/180, co=Math.cos(a), si=Math.sin(a), cx=W/2, cy=H/2;
    const R=[co,-si,cx-co*cx+si*cy, si,co,cy-si*cx-co*cy, 0,0,1];
    const S=[1/W,0,0, 0,1/H,0, 0,0,1];
    let O=[1,0,0, 0,1,0, 0,0,1];
    const r=((p.rot||0)%4+4)%4;
    if(r===1) O=[0,1,0, -1,0,1, 0,0,1];
    if(r===2) O=[-1,0,1, 0,-1,1, 0,0,1];
    if(r===3) O=[0,-1,1, 1,0,0, 0,0,1];
    const Fl = p.flip ? [-1,0,1, 0,1,0, 0,0,1] : [1,0,0, 0,1,0, 0,0,1];
    return CM.mul(Fl,CM.mul(O,CM.mul(S,CM.mul(R,A))));
  },
  cropInside(p,src,crop){ const M=this.geom(Object.assign({},p,{crop}),src);
    for(const [u,v] of [[0,0],[1,0],[0,1],[1,1]]){ const s=CM.vec(M,[u,v,1]); if(s[0]<-1e-4||s[0]>1+1e-4||s[1]<-1e-4||s[1]>1+1e-4) return false; } return true; },
  // largest crop of the same shape and centre that stays inside the rotated image
  fitCrop(p,src,crop){
    let c=Object.assign({},crop); if(this.cropInside(p,src,c)) return c;
    const mx=c.x+c.w/2, my=c.y+c.h/2; let lo=0, hi=1;
    for(let i=0;i<30;i++){ const k=(lo+hi)/2; const t={x:mx-c.w*k/2,y:my-c.h*k/2,w:c.w*k,h:c.h*k}; if(this.cropInside(p,src,t)) lo=k; else hi=k; }
    return {x:mx-c.w*lo/2,y:my-c.h*lo/2,w:c.w*lo,h:c.h*lo};
  },

  // Silver colour filters: hue → per-channel transmission (like a Wratten filter, grey kept)
  // → panchromatic B&W weights seen through the filter (neutral greys keep their exposure)
  filterRGB(h,a){ const r=Math.max(0,Math.cos((h-0)*Math.PI/180)), g=Math.max(0,Math.cos((h-120)*Math.PI/180)), b=Math.max(0,Math.cos((h-240)*Math.PI/180));
    const c=[.18+r,.18+g,.18+b], m=Math.max(...c), t=c.map(v=>1+(v/m-1)*Math.min(1,a)), L=[.24,.67,.09];
    const w=L.map((l,i)=>l*Math.max(0.03,t[i])), sw=w[0]+w[1]+w[2]; return w.map(v=>v/sw); },
  // output frame uv → second photo uv ("cover" fit, then offset / rotate / scale / flip)
  dblMatrix(p,A,B){
    const ovW = B>=A ? B : A, ovH = B>=A ? 1 : A/B, a=-(p.dblRot||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a), k=1/Math.max(0.05,p.dblScale||1);
    const T1=[A,0,-A/2-(p.dblX||0)*A, 0,1,-.5-(p.dblY||0), 0,0,1];              // to centred frame units, minus offset
    const R=[c*k,-s*k,0, s*k,c*k,0, 0,0,1];
    const T2=[(p.dblFlip?-1:1)/ovW,0,.5, 0,1/ovH,.5, 0,0,1];
    return CM.mul(T2,CM.mul(R,T1)); },
  // photo used as the second exposure (desktop: a library item; phone: a picked file)
  setDouble(src,id){ if(this.dblSrc&&this.dblSrc.own&&this.dblSrc.tex!==src?.tex) this.gl.deleteTexture(this.dblSrc.tex); this.dblSrc=src?Object.assign({},src,{id}):null; this.dirty=true; },
  // dust / scratches / hair: drawn once per seed into a tiling texture
  dustTex(p){
    const key=[p.dustSeed,Math.round(p.dustAmt),Math.round(p.scratchAmt),Math.round(p.hairAmt),p.dustSize??100,p.dustSpread||'even',p.scratchDir||'vertical'].join('|');
    if(this._dust&&this._dust.key===key) return this._dust.tex;
    const N=2048, c=document.createElement('canvas'); c.width=N; c.height=N; const x=c.getContext('2d');
    let sd=(p.dustSeed|0)*7919+13; const r=()=>{ sd=(sd*16807)%2147483647; return sd/2147483647; };
    const sz=(p.dustSize??100)/100, spread=p.dustSpread||'even';
    // where specks land: evenly, in clumps, or gathered toward the edges (like dust in a carrier)
    const clumps=[...Array(7)].map(()=>[r()*N,r()*N,N*(0.04+r()*0.1)]);
    const place=()=>{ if(spread==='clumps'&&r()<0.8){ const C=clumps[Math.floor(r()*clumps.length)], a=r()*7, d=Math.abs((r()+r()+r()-1.5))*C[2]; return [C[0]+Math.cos(a)*d,C[1]+Math.sin(a)*d]; }
      if(spread==='edges'){ const e=Math.pow(r(),2.2)*0.22, side=Math.floor(r()*4), t=r()*N; return side===0?[e*N,t]:side===1?[N-e*N,t]:side===2?[t,e*N]:[t,N-e*N]; }
      return [r()*N,r()*N]; };
    x.clearRect(0,0,N,N); x.lineCap='round'; x.lineJoin='round';
    // specks: irregular blobs with a soft rim; sizes follow a power law (lots of tiny, a few big)
    const nd=Math.round((p.dustAmt||0)*7);
    for(let i=0;i<nd;i++){ const [px,py]=place(), big=r()<0.04, rad=(big?3+r()*7:Math.pow(r(),2.4)*3.2+0.5)*sz; const a0=0.35+r()*0.65;
      x.save(); x.translate(px,py); x.rotate(r()*7); const sx=1+r()*(big?1.4:0.8); x.scale(sx,1/Math.sqrt(sx));
      x.beginPath(); const k=big?14:8; for(let j=0;j<=k;j++){ const an=j/k*Math.PI*2, rr=rad*(0.65+r()*0.55); j?x.lineTo(Math.cos(an)*rr,Math.sin(an)*rr):x.moveTo(Math.cos(an)*rr,Math.sin(an)*rr); } x.closePath();
      x.shadowColor=`rgba(255,255,255,${a0*0.6})`; x.shadowBlur=rad*0.7; x.fillStyle=`rgba(255,255,255,${a0})`; x.fill(); x.restore(); }
    // scratches: long, thin, slightly wandering; cinema-style vertical runs or random sleeve scratches
    const ns=Math.round((p.scratchAmt||0)/6), vertical=(p.scratchDir||'vertical')==='vertical';
    for(let i=0;i<ns;i++){ let px=r()*N, py=vertical?-50:r()*N, a=vertical?Math.PI/2+(r()-.5)*0.05:r()*7; const len=N*(vertical?0.4+r()*0.8:0.05+r()*0.25), w=(0.5+r()*1.3)*sz;
      x.strokeStyle=`rgba(255,255,255,${0.25+r()*0.55})`; x.lineWidth=w; x.beginPath(); x.moveTo(px,py); let bend=(r()-.5)*0.004;
      for(let t=0;t<len;t+=8){ a+=bend+(r()-.5)*(vertical?0.01:0.03); px+=Math.cos(a)*8; py+=Math.sin(a)*8; if(r()<0.02){ x.stroke(); x.beginPath(); x.moveTo(px,py); x.lineWidth=w*(0.5+r()); } else x.lineTo(px,py); } x.stroke(); }
    // hairs & fibres: smooth curling strands that taper
    const nh=Math.round((p.hairAmt||0)/8);
    for(let i=0;i<nh;i++){ let [px,py]=place(), a=r()*7, cv=(r()-.5)*0.12; const L=(40+r()*160)*sz, w=(0.8+r()*1.4)*sz, op=0.55+r()*0.45;
      for(let t=0;t<L;t+=3){ const f=t/L, ww=w*(1-Math.abs(f-.5)*1.2); a+=cv+(r()-.5)*0.12; cv*=0.995; const nx=px+Math.cos(a)*3, ny=py+Math.sin(a)*3;
        x.strokeStyle=`rgba(255,255,255,${op})`; x.lineWidth=Math.max(0.4,ww); x.beginPath(); x.moveTo(px,py); x.lineTo(nx,ny); x.stroke(); px=nx; py=ny; } }
    const gl=this.gl, t=this._dust?this._dust.tex:gl.createTexture(); gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.REPEAT],[gl.TEXTURE_WRAP_T,gl.REPEAT]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
    this._dust={key,tex:t}; return t; },
  // ---- Studio assets: lazy-loaded textures + per-layer placement
  assetIndex:null, assetTexs:{},
  async loadAssets(){ try{ const r=await fetch('data/assets/assets.json'); if(r.ok){ const j=await r.json(); this.assetIndex={}; (j.assets||[]).forEach(a=>this.assetIndex[a.id]=a); this.assetList=j.assets||[]; } }catch(e){} return this.assetList||[]; },
  asset(id){ return this.assetIndex&&this.assetIndex[id]; },
  assetTex(id){ const a=this.asset(id); if(!a) return null; const c=this.assetTexs[id]; if(c) return c.ready?c:null;
    const e=this.assetTexs[id]={ready:false}; const im=new Image(); im.onload=()=>{ const gl=this.gl, t=gl.createTexture();
        let srcImg=im; if(a.cat==='frame'&&typeof Borders!=='undefined'){ const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; const x=c.getContext('2d'); x.drawImage(im,0,0); Borders.sealEdges(x,c.width,c.height,0.012); srcImg=c; }
        gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D,t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,srcImg); gl.generateMipmap(gl.TEXTURE_2D);
        const rep=a.cat==='texture'?gl.REPEAT:gl.CLAMP_TO_EDGE;
        for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,rep],[gl.TEXTURE_WRAP_T,rep]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
        Object.assign(e,{ready:true,tex:t,w:im.naturalWidth,h:im.naturalHeight}); this.dirty=true; };
    im.src='data/assets/'+a.file; return null; },
  // image uv (v from top) → asset uv. "cover" fit, then move / rotate / scale / flip
  layerMatrix(L,A,B,cat){
    const rot=((L.rot||0)%360+360)%360, k=1/Math.max(0.05,L.scale||1);
    if(cat==='texture'){ const s=(L.scale||1)*2.2; return [A*s,0,0, 0,s,0, 0,0,1]; }
    if(cat==='frame'){ // frames are stretched to the photo; rotate a landscape frame for portrait photos
      const turn = (A<1)!==(B<1) ? 90 : 0, r=(rot+turn)%360, fl=L.flip?-1:1;
      const R={0:[fl,0,0, 0,1,0],90:[0,1,0, -fl,0,0],180:[-fl,0,0, 0,-1,0],270:[0,-1,0, fl,0,0]}[r]||[1,0,0,0,1,0];
      return [R[0],R[1],.5-.5*R[0]-.5*R[1], R[3],R[4],.5-.5*R[3]-.5*R[4], 0,0,1]; }
    const turn=(A<1)!==(B<1); if(turn) B=1/B;   // landscape overlays turn to fit portrait photos (and back)
    const ovW = B>=A ? B : A, ovH = B>=A ? 1 : A/B, a=-rot*Math.PI/180, c=Math.cos(a), sn=Math.sin(a);
    const T1=[A,0,-A/2-(L.x||0)*A, 0,1,-.5-(L.y||0), 0,0,1], R=[c*k,-sn*k,0, sn*k,c*k,0, 0,0,1], T2=[(L.flip?-1:1)/ovW,0,.5, 0,1/ovH,.5, 0,0,1];
    const M=CM.mul(T2,CM.mul(R,T1)); return turn?CM.mul([0,1,0, -1,0,1, 0,0,1],M):M; },
  hueTint(h,sat){ // hue rotation as a tint multiplier for screen layers
    if(!h&&!sat) return [1,1,1]; const a=(h||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a), k=1/3, sq=Math.sqrt(1/3);
    return [c+(1-c)*k, k*(1-c)-sq*s, k*(1-c)+sq*s]; },
  // brush masks: painted at up to 1024px (source aspect), stored as a PNG data-URL in the edit
  maskTexCache:{},
  maskTex(m){
    const gl=this.gl, c=this.maskTexCache[m.id];
    if(c && c.ver===m.ver) return c.tex;
    const t=c?c.tex:gl.createTexture();
    gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D,t);
    const cv=m._canvas;
    if(cv){ gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv); }
    else { gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
      if(m.data && !m._loading){ m._loading=true; const im=new Image(); im.onload=()=>{ const k=document.createElement('canvas'); k.width=im.width; k.height=im.height; k.getContext('2d').drawImage(im,0,0); m._canvas=k; m.ver=(m.ver||0)+1; m._loading=false; this.dirty=true; }; im.src=m.data; } }
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
    this.maskTexCache[m.id]={tex:t,ver:m.ver}; return t;
  },
  // sample the working (scene-linear AP1) image at a viewer pixel → linear Rec.709 (for the WB eyedropper)
  sampleAt(px,py,L,R){
    R=R||this.RT; if(!R.prep||!L) return null; const gl=this.gl, [u0,v0,u1,v1]=L.win;
    const u=(px-L.ix)/L.iw, vt=(L.iy+L.ih-py)/L.ih; if(u<0||u>1||vt<0||vt>1) return null;
    const i=Math.round((u-u0)/(u1-u0)*R.prep.w), j=Math.round((v1-vt)/(v1-v0)*R.prep.h);
    const n=5, x0=Math.max(0,Math.min(R.prep.w-n,i-2)), y0=Math.max(0,Math.min(R.prep.h-n,j-2)), f=new Float32Array(n*n*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,R.prep.f); gl.readPixels(x0,y0,n,n,gl.RGBA,gl.FLOAT,f); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const a=[0,0,0]; for(let k=0;k<n*n;k++) for(let c=0;c<3;c++) a[c]+=f[k*4+c]/(n*n);
    return CM.vec(CM.inv(CM.REC709_TO_AP1),a);
  },
  // white balance that makes linear-709 colour c (rendered with temp0/tint0) neutral
  solveWB(c,temp0,tint0){
    const W0i=CM.inv(CM.wbMatrix(temp0,tint0)), raw=CM.vec(W0i,c.map(v=>Math.max(v,1e-6)));
    const cost=(t,ti)=>{ const v=CM.vec(CM.wbMatrix(t,ti),raw); const lr=Math.log(Math.max(v[0],1e-6)/Math.max(v[1],1e-6)), lb=Math.log(Math.max(v[2],1e-6)/Math.max(v[1],1e-6)); return lr*lr+lb*lb; };
    let best=[temp0,tint0], bc=1e9;
    for(let t=-100;t<=100;t+=5) for(let ti=-100;ti<=100;ti+=5){ const k=cost(t,ti); if(k<bc){ bc=k; best=[t,ti]; } }
    for(let step of [2,1,0.5]) for(let it=0;it<6;it++){ let moved=false;
      for(const [dt,di] of [[step,0],[-step,0],[0,step],[0,-step]]){ const t=Math.max(-100,Math.min(100,best[0]+dt)), ti=Math.max(-100,Math.min(100,best[1]+di)), k=cost(t,ti); if(k<bc){ bc=k; best=[t,ti]; moved=true; } }
      if(!moved) break; }
    return best.map(v=>Math.round(v));
  },
  autoWB(p){
    this.histogram(p); const R=this.histRT; if(!R||!R.prep) return null; const gl=this.gl, w=R.prep.w, h=R.prep.h, f=new Float32Array(w*h*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,R.prep.f); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,f); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const M=CM.inv(CM.REC709_TO_AP1), px=[]; for(let i=0;i<w*h;i++){ const v=CM.vec(M,[f[i*4],f[i*4+1],f[i*4+2]]); const Y=.2126*v[0]+.7152*v[1]+.0722*v[2]; if(Y>0) px.push([Y,v]); }
    px.sort((a,b)=>a[0]-b[0]); const lo=Math.floor(px.length*.1), hi=Math.floor(px.length*.97); const a=[0,0,0];
    // grey-world on mid/high tones, weighted toward low-saturation pixels
    let ws=0; for(let i=lo;i<hi;i++){ const v=px[i][1], Y=px[i][0]; const s=Math.hypot(v[0]/Y-1,v[2]/Y-1); const wt=1/Math.pow(0.03+s,2.5); for(let c=0;c<3;c++) a[c]+=v[c]*wt; ws+=wt; }
    const r=this.solveWB(a.map(x=>x/ws),p.temp,p.tint); return [Math.max(-60,Math.min(60,r[0])),Math.max(-40,Math.min(40,r[1]))];
  },
  // ---------------------------------------------------------------- tone curve texture
  curveLUT(p){
    const key=JSON.stringify(p.curve); if(key===this.curveKey) return this.curveTex;
    const mono=pts=>{
      const P=pts.slice().sort((a,b)=>a[0]-b[0]); const n=P.length; if(n<2) return x=>x;
      const xs=P.map(q=>q[0]), ys=P.map(q=>q[1]), d=[], m=new Array(n);
      for(let i=0;i<n-1;i++) d.push((ys[i+1]-ys[i])/Math.max(1e-6,xs[i+1]-xs[i]));
      m[0]=d[0]; m[n-1]=d[n-2]; for(let i=1;i<n-1;i++) m[i]= d[i-1]*d[i]<=0 ? 0 : (d[i-1]+d[i])/2;
      for(let i=0;i<n-1;i++){ if(d[i]===0){ m[i]=m[i+1]=0; continue; } const a=m[i]/d[i], b=m[i+1]/d[i], s=a*a+b*b; if(s>9){ const t=3/Math.sqrt(s); m[i]=t*a*d[i]; m[i+1]=t*b*d[i]; } }
      return x=>{ if(x<=xs[0]) return ys[0]; if(x>=xs[n-1]) return ys[n-1]; let i=0; while(x>xs[i+1]) i++;
        const h=xs[i+1]-xs[i], t=(x-xs[i])/h, t2=t*t, t3=t2*t;
        return (2*t3-3*t2+1)*ys[i]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*ys[i+1]+(t3-t2)*h*m[i+1]; };
    };
    this.curveFn=mono;
    const M=mono(p.curve.m), R=mono(p.curve.r), G=mono(p.curve.g), B=mono(p.curve.b);
    const data=new Uint16Array(256*4), cl=v=>Math.min(1,Math.max(0,v));
    for(let i=0;i<256;i++){ const mm=cl(M(i/255));
      data[i*4]=CM.toHalf(cl(R(mm))); data[i*4+1]=CM.toHalf(cl(G(mm))); data[i*4+2]=CM.toHalf(cl(B(mm))); data[i*4+3]=CM.toHalf(1); }
    const gl=this.gl; gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D,this.curveTex); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,256,1,0,gl.RGBA,gl.HALF_FLOAT,data);
    this.curveKey=key; return this.curveTex;
  },
  curveIsIdentity(p){ const id=c=>c.length===2&&c[0][0]===0&&c[0][1]===0&&c[1][0]===1&&c[1][1]===1; return id(p.curve.m)&&id(p.curve.r)&&id(p.curve.g)&&id(p.curve.b); },

  // ---------------------------------------------------------------- layout
  layout(p,box){
    p=this.eff(p||this.p);
    const c=this.canvas, dpr=window.devicePixelRatio||1;
    let W=Math.max(2,Math.round(c.clientWidth*dpr)), H=Math.max(2,Math.round(c.clientHeight*dpr));
    if(c.width!==W||c.height!==H){ c.width=W; c.height=H; }
    if(box){ W=box.W; H=box.H; }
    if(!this.src) return {W,H,dpr};
    const [sw,sh]=this.dims(p,this.src,this.cropMode);
    const b=this.cropMode?{l:0,r:0,t:0,b:0}:Borders.margins(p.border, sw, sh);
    const fw0=sw*(1+b.l+b.r), fh0=sh*(1+b.t+b.b);
    let scale;
    if(this.view.mode==='fit'||this.cropMode){ const pad=(this.pad??28)*dpr*(this.cropMode?1.6:1); scale=Math.min((W-2*pad)/fw0,(H-2*pad)/fh0); }
    else scale=this.view.zoom||1;
    const fw=fw0*scale, fh=fh0*scale;
    let fx, fy;
    if(this.view.mode==='fit'||this.cropMode){ fx=(W-fw)/2; fy=(H-fh)/2; }
    else { fx = fw<=W ? (W-fw)/2 : W/2 - this.view.cx*fw; fy = fh<=H ? (H-fh)/2 : H/2 - (1-this.view.cy)*fh; }
    const ix=fx+b.l*sw*scale, iy=fy+b.b*sh*scale, iw=sw*scale, ih=sh*scale;
    const u0=Math.max(0,(0-ix)/iw), u1=Math.min(1,(W-ix)/iw);
    const vt0=Math.max(0,(iy+ih-H)/ih), vt1=Math.min(1,(iy+ih-0)/ih);
    return {W,H,dpr,scale,fx,fy,fw,fh,ix,iy,iw,ih,win:[u0,vt0,u1,vt1],b};
  },

  // ---------------------------------------------------------------- render
  render(opts={}){
    const gl=this.gl; const p=this.eff(opts.params||this.p); const L=opts.layout||this.layout(p);
    const target=opts.target||null;
    if(!this.src){ gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,L.W,L.H); gl.clearColor(.07,.07,.07,1); gl.clear(gl.COLOR_BUFFER_BIT); return L; }
    const st=this.stock(p.stock), paper=this.paperFor(p);
    const orig=this.isOriginal(p);
    const lut=orig?null:this.luts[paper.lut]; if(!orig&&!lut&&paper.lut){ this.lut(paper.lut).then(()=>{this.dirty=true;}); }
    const [u0,v0,u1,v1]=L.win;
    const vw=Math.max(1,Math.round((u1-u0)*L.iw)), vh=Math.max(1,Math.round((v1-v0)*L.ih));
    const R=opts.RT||this.RT;
    R.prep=GLU.ensure(R.prep,vw,vh,'rgba16f');
    const qw=Math.max(8,vw>>2), qh=Math.max(8,vh>>2);
    R.ha=GLU.ensure(R.ha,qw,qh); R.hb=GLU.ensure(R.hb,qw,qh); R.ga=GLU.ensure(R.ga,qw,qh); R.gb=GLU.ensure(R.gb,qw,qh);
    const s=this.src;
    const full=!!(this.cropMode && !target);
    const geo=new Float32Array(this.geom(p,s,full));
    let u;
    gl.useProgram(this.P.prep.p); u=this.P.prep.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER,R.prep.f); gl.viewport(0,0,vw,vh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,s.tex); gl.uniform1i(u.uSrc,0);
    gl.uniform4f(u.uWin,u0,v0,u1,v1); gl.uniform1f(u.uFlip,s.flipY?1:0); gl.uniform1f(u.uEncoded,s.encoded?1:0);
    gl.uniformMatrix3fv(u.uGeo,true,geo);
    gl.uniform1f(u.uDispRef,(s.dispRef&&!orig)?1:0); gl.uniform1f(u.uHL,p.hlExpand*0.85);
    gl.uniformMatrix3fv(u.uWB,true,new Float32Array(CM.wbMatrix(p.temp,p.tint)));
    gl.uniformMatrix3fv(u.uToAP1,true,new Float32Array(CM.REC709_TO_AP1));
    const auto = p.autoExp && s.key && !orig ? Math.min(16,Math.max(1/16, 0.18*0.62/s.key)) : 1;
    gl.uniform1f(u.uK, auto*Math.pow(2,p.ev));
    const F=FORMATS[p.format]||FORMATS['35mm'];
    const [ow,oh]=this.dims(p,s,full);
    gl.uniform1f(u.uFalloff,p.falloff); gl.uniform1f(u.uAspect,ow/oh);
    gl.uniform1f(u.uTanHalfDiag, F.diag/2/(F.diag*1.15));
    gl.uniform1f(u.uPush,p.push||0); gl.uniform1f(u.uSrcAspect,s.w/s.h);
    const ms=(p.masks||[]).filter(m=>m&&m.on!==false).slice(0,MAX_MASKS);
    const mt=new Int32Array(4), mA=new Float32Array(16), mB=new Float32Array(16), mC=new Float32Array(16), mW=new Float32Array(36);
    ms.forEach((m,i)=>{ const g=m.g||{}, a=m.adj||{};
      mt[i]= m.type==='linear'?1 : m.type==='radial'?2 : m.type==='brush'?3 : 0;
      if(m.type==='linear') mA.set([g.x0,g.y0,g.x1,g.y1],i*4);
      if(m.type==='radial') mA.set([g.cx,g.cy,g.rx,g.ry],i*4);
      mB.set([g.angle||0,Math.max(0.001,(m.feather??50)/100),m.invert?1:0,(m.amount??100)/100],i*4);
      mC.set([a.ev||0,(a.sat||0)/100,(a.contrast||0)/100,(a.clarity||0)/100],i*4);
      const W=CM.wbMatrix(a.temp||0,a.tint||0); for(let r=0;r<3;r++) for(let c=0;c<3;c++) mW[i*9+c*3+r]=W[r*3+c];
      if(m.type==='brush'){ const t=this.maskTex(m); gl.activeTexture(gl.TEXTURE1+i); gl.bindTexture(gl.TEXTURE_2D,t); } });
    gl.uniform1iv(u.uMType,mt); gl.uniform4fv(u.uMA,mA); gl.uniform4fv(u.uMB,mB); gl.uniform4fv(u.uMC,mC); gl.uniformMatrix3fv(u.uMWB,false,mW);
    gl.uniform1iv(u.uMTex,new Int32Array([1,2,3,4]));
    // Silver colour filter (a real filter in front of the lens: scales each channel's exposure)
    { const f = Engine.filterRGB(p.sFilterHue,p.silver?p.sFilterAmt/100:0); gl.uniform3f(u.uFilt,...f); gl.uniform1f(u.uSilverPre,p.silver?1:0); gl.uniform1fv(u.uSens,new Float32Array((p.silver&&p.sSens||[0,0,0,0,0,0]).map(v=>(v||0)/100))); }
    // double exposure: second photo added in exposure space, before the film
    const s2 = p.dblId && this.dblSrc && this.dblSrc.id===p.dblId ? this.dblSrc : null;
    gl.uniform1f(u.uDblOn, s2?1:0);
    if(s2){ gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,s2.tex); gl.uniform1i(u.uDbl,5);
      gl.uniformMatrix3fv(u.uDblM,true,new Float32Array(this.dblMatrix(p,ow/oh,s2.w/s2.h)));
      gl.uniform1i(u.uDblMode,{add:0,screen:1,lighten:2,multiply:3,silhouette:4,darken:5}[p.dblMode]||0);
      gl.uniform1f(u.uDblAmt,p.dblAmt/100); gl.uniform1f(u.uDblK,(s2.key?Math.min(16,Math.max(1/16,0.18*0.62/s2.key)):1)*Math.pow(2,p.dblEv||0)*Math.pow(2,p.ev));
      gl.uniform1f(u.uDblEnc,s2.encoded?1:0); gl.uniform1f(u.uDblDisp,s2.dispRef?1:0); gl.uniform1f(u.uDblMask,(p.dblMask||0)/100); gl.uniform1f(u.uDblFlipY,s2.flipY?1:0); }
    else { gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,this.borderTex); gl.uniform1i(u.uDbl,5); }
    gl.activeTexture(gl.TEXTURE0);
    { const lc=LEAK_COLORS[p.leakColor]||LEAK_COLORS.warm, L2=c=>{ const h=c.slice(1); return [0,2,4].map(i=>{ const v=parseInt(h.substr(i,2),16)/255; return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4); }); };
      { const T=TT_PALETTES[p.ttPalette]||TT_PALETTES['red-cyan'], L2=c=>{ const h=c.slice(1); return [0,2,4].map(i=>{ const v=parseInt(h.substr(i,2),16)/255; return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4); }); }, nz=c=>{ const y=.2126*c[0]+.7152*c[1]+.0722*c[2]; return c.map(v=>v/y*0.62); };
        gl.uniform1f(u.uTT,p.ttOn?1:0); gl.uniform3f(u.uTTA,...nz(L2(T[0]))); gl.uniform3f(u.uTTB,...nz(L2(T[1])));
        gl.uniform4f(u.uTTP,(p.ttDX||0)/100,(p.ttDY||0)/100,Math.max(0.2,(p.ttScale||100)/100),(p.ttGhost??80)/100);
        gl.uniform3f(u.uTTM,(p.ttMono??85)/100,(p.ttBand||0)/100,(p.ttBandPos??45)/100); }
      gl.uniform1f(u.uLeakAmt,(p.leakAmt||0)/100); gl.uniform3f(u.uLeakC1,...L2(lc[0])); gl.uniform3f(u.uLeakC2,...L2(lc[1]));
      const lp=LEAK_POS[p.leakPos|0]||LEAK_POS[1]; gl.uniform2f(u.uLeakP,lp[0],lp[1]); gl.uniform1f(u.uLeakSize,(p.leakSize||45)/100); gl.uniform1f(u.uLeakSeed,p.leakSeed||0); }
    for(let i=ms.length;i<4;i++){ gl.activeTexture(gl.TEXTURE1+i); gl.bindTexture(gl.TEXTURE_2D,this.borderTex); }
    gl.activeTexture(gl.TEXTURE0);
    GLU.drawQuad();
    // detail: noise reduction + sharpening at the working resolution (scaled to source pixels)
    if((p.sharpen||0)>0.5 || (p.nr||0)>0.5 || (p.nrColor||0)>0.5){
      R.prep2=GLU.ensure(R.prep2,vw,vh,'rgba16f');
      gl.useProgram(this.P.detail.p); u=this.P.detail.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER,R.prep2.f); gl.viewport(0,0,vw,vh);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,R.prep.t); gl.uniform1i(u.uTex,0);
      gl.uniform2f(u.uPx,1/vw,1/vh);
      gl.uniform1f(u.uSharp,(p.sharpen||0)/100); gl.uniform1f(u.uSRad,Math.max(0.35,(p.sharpRadius||1)*L.scale));
      gl.uniform1f(u.uNR,(p.nr||0)/100); gl.uniform1f(u.uNRC,(p.nrColor||0)/100); gl.uniform1f(u.uNRad,Math.max(1,1.5*L.scale));
      GLU.drawQuad();
      const t=R.prep; R.prep=R.prep2; R.prep2=t;
    }
    // lens effects: zoom / motion blur, soft edges, tilt-shift, colour fringing (in image units)
    if(p.zoomBlur>0.5||p.motionBlur>0.5||p.softEdges>0.5||p.tiltShift>0.5||p.fringe>0.5||Math.abs(p.distort||0)>0.5||(p.softness||0)>0.5){
      R.prep2=GLU.ensure(R.prep2,vw,vh,'rgba16f');
      gl.useProgram(this.P.fx.p); u=this.P.fx.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER,R.prep2.f); gl.viewport(0,0,vw,vh);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,R.prep.t); gl.uniform1i(u.uTex,0);
      gl.uniform4f(u.uWin,u0,v0,u1,v1); gl.uniform1f(u.uAspect,ow/oh);
      gl.uniform1f(u.uZoom,p.zoomBlur/100*0.12); gl.uniform2f(u.uMotion,Math.cos(p.motionAngle*Math.PI/180)*p.motionBlur/100*0.06,-Math.sin(p.motionAngle*Math.PI/180)*p.motionBlur/100*0.06);
      gl.uniform1f(u.uSoft,p.softEdges/100*0.025); gl.uniform3f(u.uTilt,p.tiltShift/100*0.025,p.tiltPos/100,p.tiltWidth/100); gl.uniform1f(u.uFringe,p.fringe/100*0.008); gl.uniform1f(u.uDistort,(p.distort||0)/100); gl.uniform1f(u.uBlurAll,(p.softness||0)/100*0.0045);
      GLU.drawQuad();
      const t=R.prep; R.prep=R.prep2; R.prep2=t;
    }
    const imgPx = Math.max(L.iw,L.ih);
    const blurChain=(a,b,thr,radiusFrac)=>{
      gl.useProgram(this.P.bright.p); u=this.P.bright.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER,a.f); gl.viewport(0,0,qw,qh);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,R.prep.t); gl.uniform1i(u.uTex,0); gl.uniform1f(u.uThr,thr);
      GLU.drawQuad();
      gl.useProgram(this.P.blur.p); u=this.P.blur.u; gl.uniform1i(u.uTex,0);
      const rpx = radiusFrac*imgPx/4;
      for(const k of [0.35,1.0]){ const step=Math.max(0.5,rpx*k/12);
        gl.bindFramebuffer(gl.FRAMEBUFFER,b.f); gl.bindTexture(gl.TEXTURE_2D,a.t); gl.uniform2f(u.uDir,step/qw,0); GLU.drawQuad();
        gl.bindFramebuffer(gl.FRAMEBUFFER,a.f); gl.bindTexture(gl.TEXTURE_2D,b.t); gl.uniform2f(u.uDir,0,step/qh); GLU.drawQuad(); }
    };
    const ahAmt = {strong:0.16, weak:0.45, none:1.5}[st.antihalation] ?? 0.3;
    const halAmt = ahAmt*p.halation*(1+0.15*Math.max(0,p.push||0));
    if(halAmt>0.001) blurChain(R.ha,R.hb,1.6,0.006);
    // lens flare: a long horizontal streak (anamorphic) + soft ghosts, packed with halation into one texture
    const flOn = (p.flare||0)>0.5;
    if(flOn){ const thr=1.0-0.8*((p.flareSens??50)/100);
      R.fa1=GLU.ensure(R.fa1,qw,qh); R.fa2=GLU.ensure(R.fa2,qw,qh); R.fg1=GLU.ensure(R.fg1,qw,qh); R.fg2=GLU.ensure(R.fg2,qw,qh); R.pk=GLU.ensure(R.pk,qw,qh); R.fa3=GLU.ensure(R.fa3,qw,qh);
      blurChain(R.fg1,R.fg2,thr,0.03);
      gl.useProgram(this.P.bright.p); u=this.P.bright.u; gl.bindFramebuffer(gl.FRAMEBUFFER,R.fa1.f); gl.viewport(0,0,qw,qh);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,R.prep.t); gl.uniform1i(u.uTex,0); gl.uniform1f(u.uThr,thr); GLU.drawQuad();
      gl.useProgram(this.P.blur.p); u=this.P.blur.u; gl.uniform1i(u.uTex,0);
      // two lengths summed: a bright short core and a long faint tail, so the streak tapers away from the light
      const len=(0.08+0.9*((p.flareLen??60)/100))*qw; gl.activeTexture(gl.TEXTURE0);
      const pass=(src,dst,k)=>{ const step=Math.max(0.5,len*k/12); gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f); gl.bindTexture(gl.TEXTURE_2D,src.t); gl.uniform2f(u.uDir,step/qw,0); GLU.drawQuad(); };
      pass(R.fa1,R.fa2,0.012); pass(R.fa2,R.fa1,0.04); pass(R.fa1,R.fa2,0.13);   // short → fa2
      pass(R.fa2,R.fa3,0.38); pass(R.fa3,R.fa1,1.0);                             // long  → fa1
      R.faOut=R.fa2; const faLong=R.fa1;
      gl.useProgram(this.P.pack.p); u=this.P.pack.u; gl.bindFramebuffer(gl.FRAMEBUFFER,R.pk.f);
      [[0,R.ha.t,'uA'],[1,R.faOut.t,'uB'],[2,R.fg1.t,'uC'],[3,faLong.t,'uD']].forEach(([i,t,n])=>{ gl.activeTexture(gl.TEXTURE0+i); gl.bindTexture(gl.TEXTURE_2D,t); gl.uniform1i(u[n],i); });
      gl.uniform3f(u.uOn,halAmt>0.001?1:0,1,1); GLU.drawQuad(); }
    if(p.glow>0.001) blurChain(R.ga,R.gb,0.0,0.03);
    const doStruct = p.silver && [p.structure,p.sStructHi,p.sStructMid,p.sStructSh,p.sSoft].some(v=>Math.abs(v||0)>0.5);
    if(doStruct){ R.sa=GLU.ensure(R.sa,qw,qh); R.sb=GLU.ensure(R.sb,qw,qh); blurChain(R.sa,R.sb,0.0,0.012); }
    const doFine = p.silver && Math.abs(p.sFine||0)>0.5;
    if(doFine){ R.fa=GLU.ensure(R.fa,qw,qh); R.fb=GLU.ensure(R.fb,qw,qh); blurChain(R.fa,R.fb,0.0,0.0025); }
    gl.useProgram(this.P.final.p); u=this.P.final.u;
    { const g=paper.grade, on=g!==undefined&&(g!==2||paper.tone||paper.lift); 
      gl.uniform4f(this.P.final.u.uPaperG,on?1:0,Math.pow(1.32,(g??2)-2),paper.lift||0,0);
      gl.uniform3f(this.P.final.u.uPaperT,...(paper.tone==='warm'?[1.04,1.0,.9]:paper.tone==='cool'?[.97,.99,1.04]:[1,1,1])); }
    const anOn=!!p.anOn&&!full&&!(this.before&&!opts.forceAfter);
    if(anOn){ const ow=target?target.w:L.W, oh=target?target.h:L.H; R.an=GLU.ensure(R.an,ow,oh,'rgba16f'); gl.bindFramebuffer(gl.FRAMEBUFFER,R.an.f); gl.viewport(0,0,ow,oh); }
    else if(target){ gl.bindFramebuffer(gl.FRAMEBUFFER,target.f); gl.viewport(0,0,target.w,target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,L.W,L.H); }
    const bind=(unit,type,tex,name)=>{ gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(type,tex); gl.uniform1i(u[name],unit); };
    bind(0,gl.TEXTURE_2D,R.prep.t,'uPrep'); bind(1,gl.TEXTURE_2D,flOn?R.pk.t:R.ha.t,'uHal'); bind(2,gl.TEXTURE_2D,R.ga.t,'uGlowTex');
    bind(3,gl.TEXTURE_3D,lut||null,'uLut'); bind(4,gl.TEXTURE_2D,s.tex,'uSrc'); bind(5,gl.TEXTURE_2D,opts.borderTex||this.borderTex,'uBorder');
    bind(6,gl.TEXTURE_2D,this.curveLUT(p),'uCurve');
    bind(7,gl.TEXTURE_2D,doStruct?R.sa.t:R.prep.t,'uStructTex'); gl.uniform1f(u.uStruct,doStruct?1:0);
    gl.uniform4f(u.uStructB,(p.structure||0)/100,(p.sStructHi||0)/100,(p.sStructMid||0)/100,(p.sStructSh||0)/100);
    gl.uniform4f(u.uSB,(p.sBright||0)/100,(p.sBrightHi||0)/100,(p.sBrightSh||0)/100,(p.sContrast||0)/100);
    gl.uniform3f(u.uSAmp,(p.sAmpW||0)/100,(p.sAmpB||0)/100,doStruct?(p.sSoft||0)/100:0);
    gl.uniform4f(u.uSVig,(p.sVig||0)/100,(p.sVigSize??50)/100,(p.sVigX||0),(p.sVigY||0));
    gl.uniform4f(u.uBurnS,(p.sBurnT||0)/100,(p.sBurnB||0)/100,(p.sBurnL||0)/100,(p.sBurnR||0)/100); gl.uniform1f(u.uToneBal,(p.sToneBal||0)/100);
    gl.uniform2f(u.uZones,this.view.zones?1:0,this.view.zoneHi??-1);
    const dustOn=(p.dustAmt||0)+(p.scratchAmt||0)+(p.hairAmt||0)>0.5;
    bind(8,gl.TEXTURE_2D,dustOn?this.dustTex(p):this.borderTex,'uDust'); gl.uniform1f(u.uDustOn,dustOn?(p.dustOpacity??85)/100:0); gl.uniform1f(u.uDustDark,p.dustKind==='print'?1:0);
    // unit 15 is the scratch unit for texture uploads, so bind it after every texture that may be created this frame
    bind(15,gl.TEXTURE_2D,doFine?R.fa.t:R.prep.t,'uFineTex'); gl.uniform1f(u.uFine,doFine?p.sFine/100:0);
    { const fx=p.fx||{}; let slot=0; const on=new Float32Array(6), mode=new Int32Array(6), amt=new Float32Array(6), inv=new Float32Array(6), mats=new Float32Array(54), hue=new Float32Array(18);
      // layers: keys are a category plus an optional number (leak, leak2, …), composited in category order, up to 6
      const post=new Float32Array(6), mono=new Float32Array(6), keys=Object.keys(fx).filter(k=>FX_MODE[k.replace(/\d+$/,'')]!==undefined)
        .sort((a,b)=>FX_SLOTS.indexOf(a.replace(/\d+$/,''))-FX_SLOTS.indexOf(b.replace(/\d+$/,''))||a.localeCompare(b,undefined,{numeric:true}));
      const [dw,dh]=this.dims(p,s);
      keys.forEach(key=>{ const cat=key.replace(/\d+$/,''), Ly=fx[key]; if(slot>=6||!Ly||!Ly.id||!(Ly.amt>0)) return; const t=this.assetTex(Ly.id); if(!t) return; const i=slot++;
        const M=this.layerMatrix(Ly,dw/dh,t.w/t.h,cat); post[i]=(cat==='dust'||cat==='frame')?1:0; mono[i]=Ly.mono?1:0;
        for(let r=0;r<3;r++) for(let q=0;q<3;q++) mats[i*9+q*3+r]=M[r*3+q];
        on[i]=1; mode[i]=FX_MODE[cat]; amt[i]=Ly.amt/100; inv[i]=Ly.invert?1:0; hue.set(this.hueTint(Ly.hue,0),i*3);
        gl.activeTexture(gl.TEXTURE9+i); gl.bindTexture(gl.TEXTURE_2D,t.tex); });
      gl.uniform1fv(u.uAPost,post); gl.uniform1fv(u.uAMono,mono);
      for(let i=0;i<6;i++) if(!on[i]){ gl.activeTexture(gl.TEXTURE9+i); gl.bindTexture(gl.TEXTURE_2D,this.borderTex); }
      gl.uniform1iv(u.uA,new Int32Array([9,10,11,12,13,14])); gl.uniform1fv(u.uAOn,on); gl.uniform1iv(u.uAMode,mode); gl.uniform1fv(u.uAAmt,amt); gl.uniform1fv(u.uAInv,inv);
      gl.uniformMatrix3fv(u.uAM,false,mats); gl.uniform3fv(u.uAHue,hue); }
    gl.uniform1f(u.uSilver,p.silver?1:0); gl.uniform2f(u.uBurn,(p.sBurn||0)/100,(p.sBurnSize||40)/100);
    { const T=TONERS[p.sTone]; const L2=c=>{ const h=c.slice(1); return [0,2,4].map(i=>{ const v=parseInt(h.substr(i,2),16)/255; return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4); }); };
      const lo=T?L2(T[0]):[1,1,1], hi=T?L2(T[1]):[1,1,1], nz=c=>{ const y=.2126*c[0]+.7152*c[1]+.0722*c[2]; return c.map(v=>v/y); };
      gl.uniform3f(u.uToneLo,...nz(lo)); gl.uniform3f(u.uToneHi,...nz(hi)); gl.uniform1f(u.uToneAmt,T?(p.sToneAmt??60)/100:0); }
    gl.uniform2f(u.uRes, target?target.w:L.W, target?target.h:L.H);
    gl.uniform4f(u.uFrame,L.fx,L.fy,L.fw,L.fh); gl.uniform4f(u.uImg,L.ix,L.iy,L.iw,L.ih); gl.uniform4f(u.uWin,u0,v0,u1,v1);
    gl.uniformMatrix3fv(u.uGeo,true,geo);
    gl.uniform1f(u.uFilmAmt,Math.max(0,Math.min(1,(p.filmAmt??100)/100))); gl.uniform1f(u.uOrig,orig?1:0); gl.uniform1f(u.uHasLut,lut?1:0); gl.uniform1f(u.uN,this.manifest.lutSize); gl.uniform2f(u.uShaper,this.manifest.shaper.lo,this.manifest.shaper.hi);
    gl.uniform1f(u.uHalAmt, halAmt>0.001?halAmt:0);
    { const F=FLARE_COLORS[p.flareColor]||FLARE_COLORS.blue, a=(p.flare||0)/100; gl.uniform3f(u.uFlare,flOn?1:0,a*a*22,flOn?((p.flareGhost??35)/100)*a*1.6:0);
      gl.uniform3fv(u.uFlareC,new Float32Array(F.flat())); } gl.uniform1f(u.uGlow,p.glow);
    gl.uniform1f(u.uBefore,(this.before&&!opts.forceAfter)?1:0); gl.uniform1f(u.uFlip,s.flipY?1:0); gl.uniform1f(u.uEncoded,s.encoded?1:0);
    gl.uniform1f(u.uContrast,p.contrast/100); gl.uniform1f(u.uHighlights,p.highlights/100); gl.uniform1f(u.uShadows,p.shadows/100);
    gl.uniform1f(u.uWhites,p.whites/100); gl.uniform1f(u.uBlacks,p.blacks/100); gl.uniform1f(u.uVibrance,p.vibrance/100); gl.uniform1f(u.uSat,p.saturation/100);
    gl.uniform1f(u.uCurveOn, this.curveIsIdentity(p)?0:1);
    const hslOn = p.hslH.some(x=>x)||p.hslS.some(x=>x)||p.hslL.some(x=>x);
    gl.uniform1f(u.uHslOn, hslOn?1:0);
    gl.uniform1fv(u.uHslH,new Float32Array(p.hslH)); gl.uniform1fv(u.uHslS,new Float32Array(p.hslS.map(x=>x/100))); gl.uniform1fv(u.uHslL,new Float32Array(p.hslL.map(x=>x/100)));
    const gOn = !!(p.gShS||p.gMidS||p.gHiS||p.gShL||p.gMidL||p.gHiL);
    gl.uniform1f(u.uGradeOn, gOn?1:0);
    const hc=(h,sv)=>[Math.cos(h*Math.PI/180)*sv/100*0.06, Math.sin(h*Math.PI/180)*sv/100*0.06];
    gl.uniform4f(u.uGSh,...hc(p.gShH,p.gShS),p.gShL/100,0); gl.uniform4f(u.uGMid,...hc(p.gMidH,p.gMidS),p.gMidL/100,0); gl.uniform4f(u.uGHi,...hc(p.gHiH,p.gHiS),p.gHiL/100,0);
    gl.uniform2f(u.uGBlend,p.gBlend/100,p.gBalance/100);
    const pgi=st.pgi||35; const baseAmt=Math.max(0.012,(pgi-14)/40)*0.055;
    const [gw,gh]=this.dims(p,s);
    const pu=p.push||0, pushG = pu>=0 ? 1+0.32*pu : 1+0.12*pu, pushS = pu>=0 ? 1+0.07*pu : 1+0.04*pu;
    const fullCell = Math.max(gw,gh)/(1400/F.gauge)*(0.75+pgi/120)*p.grainSize*pushS;
    const cellOut = fullCell*L.scale;
    gl.uniform1f(u.uGrain, p.grain*baseAmt*pushG*Math.min(1,cellOut));
    gl.uniform1f(u.uGrainCell, Math.max(1.0,cellOut)); gl.uniform1f(u.uGrainSoft,p.grainRough);
    gl.uniform1i(u.uMono, (st.type==='bw'||p.silver)?1:0); gl.uniform1ui(u.uSeed,this.grainSeed);
    gl.uniform1f(u.uClip,this.showClip&&!target?1:0); gl.uniform3f(u.uBg,.071,.071,.071);
    gl.uniform1f(u.uBorderOn, (p.border!=='none'&&!full)?1:0);
    const wantP3 = opts.p3!=null ? opts.p3 : (target ? false : this.outP3);
    gl.uniform1f(u.uToSRGB, (this.manifest.output==='p3' && !wantP3)?1:0);
    gl.uniform1f(u.uSrcToP3, wantP3?1:0);
    GLU.drawQuad();
    if(anOn) this.analogPass(p,L,target,R);
    return L;
  },
  // ---------------------------------------------------------------- analog media pass
  frameSeed:0,
  analogPass(p,L,target,R){
    const gl=this.gl, P=this.P.analog, u=P.u, ow=target?target.w:L.W, oh=target?target.h:L.H;
    gl.useProgram(P.p);
    if(target){ gl.bindFramebuffer(gl.FRAMEBUFFER,target.f); } else gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,ow,oh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,R.an.t); gl.uniform1i(u.uTex,0);
    const osd=p.anOSD&&p.anOSD!=='none'?this.osdTex(p,L.fw,L.fh):null;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,osd||this.borderTex); gl.uniform1i(u.uOSD,1); gl.uniform1f(u.uOSDOn,osd?1:0);
    gl.uniform2f(u.uRes,ow,oh); gl.uniform4f(u.uFrame,L.fx,L.fy,L.fw,L.fh); gl.uniform1f(u.uSeed,(p.anSeed||0)+this.frameSeed*1.618);
    const k=x=>(p[x]||0)/100;
    gl.uniform4f(u.uSig1,k('anRes'),p.anLines||0,k('anChroma'),p.anShift||0);
    gl.uniform4f(u.uSig2,k('anBleed'),k('anSharp'),k('anGhost'),p.anGhostOff??30);
    gl.uniform4f(u.uSig3,k('anTrack'),(p.anTrackPos??72)/100,k('anHead'),k('anJitter'));
    gl.uniform4f(u.uSig4,k('anInterlace'),k('anSat'),(p.anHue||0)*Math.PI/180,k('anNoise'));
    gl.uniform4f(u.uDisp1,k('anScan'),p.anScanN||480,k('anCurve'),k('anBloom'));
    gl.uniform4f(u.uDisp2,k('anMaskAmt'),k('anDrop'),k('anSnow'),k('anCNoise'));
    gl.uniform4f(u.uDispV,k('anVig'),k('anCorner'),k('anBlock'),0);
    gl.uniform4f(u.uGate,k('anOverscan'),k('anWeave'),k('anGateSoft'),k('anFlicker'));
    gl.uniform1i(u.uMaskT,{none:0,aperture:1,shadow:2,slot:3}[p.anMask]||0);
    gl.uniform1i(u.uGateT,{none:0,super8:1,'8mm':2,'16mm':3,super16:4,'35cine':5}[p.anGate]||0);
    const T={none:[-1,0,0],green:[.35,1.15,.4],amber:[1.2,.75,.25],blue:[.75,.9,1.15],mono:[1,1,1]}[p.anTint]||[-1,0,0]; gl.uniform3f(u.uTintC,...T);
    GLU.drawQuad(); },
  // on-screen display text: VCR / camcorder / CCTV / date-back stamps
  osdCache:{key:'',tex:null},
  osdTex(p,fw,fh){ const W=1280, H=Math.max(2,Math.round(W*fh/fw)), key=[p.anOSD,p.anOSDText,W,H,new Date().toDateString()].join('|');
    if(this.osdCache.key===key) return this.osdCache.tex;
    const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d'); const d=new Date();
    const M=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()], dd=String(d.getDate()).padStart(2,' '), yy=d.getFullYear(), hh=d.getHours(), mi=String(d.getMinutes()).padStart(2,'0');
    const ampm=(hh%12||12)+':'+mi+(hh<12?' AM':' PM'), custom=(p.anOSDText||'').toUpperCase();
    const vcr=(t,X,Y,sz,al)=>{ x.font=`${sz}px "VCR OSD Mono","Share Tech Mono","Courier New",monospace`; x.textAlign=al||'left'; x.textBaseline='top';
      x.fillStyle='rgba(0,0,0,.55)'; x.fillText(t,X+sz*.08,Y+sz*.08); x.fillStyle='#f4f4f4'; x.fillText(t,X,Y); };
    const s=H/480*36;
    if(p.anOSD==='vhs'){ vcr('PLAY ▶',W*.07,H*.08,s); vcr('SP',W*.93,H*.08,s,'right'); vcr(custom||(ampm),W*.07,H*.82,s); vcr(M+'. '+dd+' '+yy,W*.93,H*.82,s,'right'); }
    else if(p.anOSD==='pause'){ vcr('PAUSE ❚❚',W*.07,H*.08,s); vcr('SLP',W*.93,H*.08,s,'right'); vcr(custom||'00:42:17',W*.07,H*.82,s); }
    else if(p.anOSD==='rec'){ x.fillStyle='#ff2a1a'; x.beginPath(); x.arc(W*.08,H*.1+s*.5,s*.42,0,7); x.fill(); vcr('REC',W*.08+s*.7,H*.1,s); vcr('0:00:12',W*.93,H*.1,s,'right');
      x.strokeStyle='rgba(255,255,255,.85)'; x.lineWidth=s*.09; x.strokeRect(W*.88,H*.18,s*1.6,s*.7); x.fillStyle='rgba(255,255,255,.85)'; x.fillRect(W*.88+s*1.6,H*.18+s*.2,s*.15,s*.3); x.fillRect(W*.88+s*.12,H*.18+s*.12,s*.9,s*.46);
      vcr(custom||(ampm),W*.07,H*.82,s); vcr(M+'. '+dd+' '+yy,W*.93,H*.82,s,'right'); }
    else if(p.anOSD==='cctv'){ const ss=s*.8; vcr('CAM 01',W*.05,H*.06,ss); vcr(custom||'ENTRANCE',W*.95,H*.06,ss,'right');
      vcr(`${yy}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}  ${String(hh).padStart(2,'0')}:${mi}:${String(d.getSeconds()).padStart(2,'0')}`,W*.05,H*.88,ss); }
    else if(p.anOSD==='digicam'){ const t=custom||(`${yy}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(hh).padStart(2,'0')}:${mi}`); const sz=H*.045;
      x.font=`600 ${sz}px "Arial Narrow","Helvetica Neue",Arial,sans-serif`; x.textAlign='right'; x.textBaseline='bottom'; x.lineWidth=sz*.12; x.strokeStyle='rgba(60,20,0,.6)'; x.strokeText(t,W*.95,H*.95); x.fillStyle='#ffb21e'; x.fillText(t,W*.95,H*.95); }
    else if(p.anOSD==='filmdate'){ // date-back LED stamp burned into the film: orange 7-segment digits, bottom right
      const t=custom||(`'${String(yy).slice(2)} ${String(d.getMonth()+1).padStart(2,' ')} ${dd}`); const sz=H*.042;
      // seven-segment LED digits, slanted, glowing into the emulsion
      const SEG={'0':'abcdef','1':'bc','2':'abdeg','3':'abcdg','4':'bcfg','5':'acdfg','6':'acdefg','7':'abc','8':'abcdefg','9':'abcdfg','-':'g'};
      const dw=sz*.52, gap=sz*.2, th=sz*.11, chars=[...t]; let total=0; chars.forEach(ch=>total+= ch===' '?dw*.6: ch==="'"?dw*.35 : dw+gap);
      let X=W*.93-total, Y=H*.92-sz; x.save(); x.transform(1,0,-.12,1,sz*.1,0);
      const seg=(k,ox)=>{ const h=sz/2; const S={a:[ox,Y,dw,th],b:[ox+dw-th,Y,th,h],c:[ox+dw-th,Y+h,th,h],d:[ox,Y+sz-th,dw,th],e:[ox,Y+h,th,h],f:[ox,Y,th,h],g:[ox,Y+h-th/2,dw,th]}[k]; x.fillRect(S[0]+th*.15,S[1]+th*.15,S[2]-th*.3,S[3]-th*.3); };
      for(const pass of [[sz*.45,'rgba(255,110,20,.55)'],[sz*.12,'rgba(255,150,50,.95)']]){ x.shadowColor='rgba(255,110,20,.9)'; x.shadowBlur=pass[0]; x.fillStyle=pass[1]; let ox=X;
        chars.forEach(ch=>{ if(ch===' '){ ox+=dw*.6; return; } if(ch==="'"){ x.fillRect(ox,Y,th,sz*.28); ox+=dw*.35; return; } (SEG[ch]||'').split('').forEach(k=>seg(k,ox)); ox+=dw+gap; }); }
      x.restore(); }
    if(this.osdCache.tex) this.gl.deleteTexture(this.osdCache.tex);
    const gl=this.gl, t=gl.createTexture(); gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D,t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    for(const [a,b] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,a,b);
    this.osdCache={key,tex:t}; return t; },

  // side-by-side compare: A on the left, B on the right, each fitted (or zoomed in sync) in its half
  renderSplit(pA,pB,borderFn){
    const gl=this.gl, full=this.layout(pB), gap=Math.round(2*full.dpr), W=full.W, H=full.H;
    // pick side-by-side or stacked, whichever shows the photos bigger
    const hW=Math.floor((W-gap)/2), hH=Math.floor((H-gap)/2);
    const keepView=this.view; this.view={mode:'fit'};
    const sH=this.layout(pB,{W:hW,H}).scale, sV=this.layout(pB,{W,H:hH}).scale; this.view=keepView;
    const vert = sV>sH*1.05; this.splitVertical=vert;
    const boxes = vert ? [[0,H-hH,W,hH],[0,0,W,hH]] : [[0,0,hW,H],[hW+gap,0,hW,H]];
    const out=[];
    [pA,pB].forEach((p,i)=>{ const [x0,y0,bw,bh]=boxes[i];
      const L=this.layout(p,{W:bw,H:bh}); const key='split'+i;
      this.RT[key]=GLU.ensure(this.RT[key],bw,bh,'rgba8');
      this.render({params:p,layout:L,target:this.RT[key],RT:this['splitRT'+i]||(this['splitRT'+i]={}),borderTex:borderFn?borderFn(L,this.eff(p)):null,p3:this.outP3});
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.RT[key].f); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);
      gl.blitFramebuffer(0,0,bw,bh,x0,y0,x0+bw,y0+bh,gl.COLOR_BUFFER_BIT,gl.NEAREST);
      out.push(Object.assign({},L,{ox:x0,oy:y0}));
    });
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
    gl.enable(gl.SCISSOR_TEST); if(vert) gl.scissor(0,hH,W,H-2*hH); else gl.scissor(hW,0,W-2*hW,H); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.SCISSOR_TEST);
    return out;
  },
  histogram(params){
    if(!this.src) return null;
    const gl=this.gl, p=params||this.p, L=this.layout(p);
    const hw=192, hh=Math.max(32,Math.round(hw*L.ih/L.iw));
    this.RT.hist=GLU.ensure(this.RT.hist,hw,hh,'rgba8');
    const s=hw/L.iw; const LL={W:hw,H:hh,dpr:1,fx:0,fy:0,fw:hw,fh:hh,ix:0,iy:0,iw:hw,ih:hh,scale:L.scale*s,win:[0,0,1,1],b:{l:0,r:0,t:0,b:0}};
    const keepClip=this.showClip; this.showClip=false;
    const keepCrop=this.cropMode; this.cropMode=false;
    this.render({layout:LL,target:this.RT.hist,RT:this.histRT||(this.histRT={}),params:Object.assign({},p,{border:'none'}),p3:this.outP3});
    this.showClip=keepClip; this.cropMode=keepCrop;
    const px=new Uint8Array(hw*hh*4); gl.bindFramebuffer(gl.FRAMEBUFFER,this.RT.hist.f); gl.readPixels(0,0,hw,hh,gl.RGBA,gl.UNSIGNED_BYTE,px);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const r=new Uint32Array(256),g=new Uint32Array(256),b=new Uint32Array(256),y=new Uint32Array(256);
    for(let i=0;i<px.length;i+=4){ r[px[i]]++; g[px[i+1]]++; b[px[i+2]]++; y[(px[i]*54+px[i+1]*183+px[i+2]*19)>>8]++; }
    return {r,g,b,y,n:hw*hh};
  },
};

// ======================================================================= shaders
const PREP_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec4 uWin; uniform float uFlip,uEncoded,uDispRef,uHL,uK,uFalloff,uAspect,uTanHalfDiag;
uniform mat3 uWB,uToAP1,uGeo; uniform float uPush,uSrcAspect;
uniform vec3 uFilt; uniform float uSilverPre; uniform float uSens[6];
float silverMono(vec3 c){ float m=dot(c,uFilt); float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)); if(mx<=1e-6) return m; float sat=(mx-mn)/mx; if(sat<.02) return m;
  float d=mx-mn, h = mx==c.r ? mod((c.g-c.b)/d,6.) : mx==c.g ? (c.b-c.r)/d+2. : (c.r-c.g)/d+4.; float e=0.;
  for(int i=0;i<6;i++){ float dh=abs(h-float(i)); dh=min(dh,6.-dh); e+=uSens[i]*max(0.,1.-dh); }
  return m*exp2(e*sat*1.6); } uniform sampler2D uDbl; uniform mat3 uDblM; uniform int uDblMode; uniform float uDblOn,uDblAmt,uDblK,uDblEnc,uDblDisp,uDblMask,uDblFlipY;
uniform float uTT; uniform vec3 uTTA,uTTB,uTTM; uniform vec4 uTTP;
uniform float uLeakAmt,uLeakSize,uLeakSeed; uniform vec3 uLeakC1,uLeakC2; uniform vec2 uLeakP;
uniform int uMType[4]; uniform vec4 uMA[4]; uniform vec4 uMB[4]; uniform vec4 uMC[4]; uniform mat3 uMWB[4]; uniform sampler2D uMTex[4];
in vec2 vUv; out vec4 o;
float maskW(int i, vec2 s){
  int t=uMType[i]; if(t==0) return 0.;
  float w=0., fe=uMB[i].y;
  if(t==1){ vec2 a=uMA[i].xy, b=uMA[i].zw; vec2 d=(b-a)*vec2(uSrcAspect,1.); float L2=max(dot(d,d),1e-8);
    float k=dot((s-a)*vec2(uSrcAspect,1.),d)/L2; w=1.-smoothstep(0.,1.,k); }
  else if(t==2){ vec2 q=(s-uMA[i].xy)*vec2(uSrcAspect,1.); float an=uMB[i].x; mat2 R=mat2(cos(an),-sin(an),sin(an),cos(an)); q=R*q;
    vec2 r=max(uMA[i].zw*vec2(uSrcAspect,1.),vec2(1e-4)); float d=length(q/r); w=1.-smoothstep(1.-fe,1.,d); }
  else { if(i==0) w=texture(uMTex[0],s).a; else if(i==1) w=texture(uMTex[1],s).a; else if(i==2) w=texture(uMTex[2],s).a; else w=texture(uMTex[3],s).a; }
  if(uMB[i].z>.5) w=1.-w;
  return clamp(w*uMB[i].w,0.,1.);
}
vec3 dec(vec3 c){ return mix(c/12.92, pow((c+.055)/1.055,vec3(2.4)), step(.04045,c)); }
vec3 srcAt(vec2 s){
  if(s.x<0.||s.y<0.||s.x>1.||s.y>1.) return vec3(0.);
  vec3 c=texture(uSrc,vec2(s.x, uFlip>.5 ? 1.-s.y : s.y)).rgb;
  if(uEncoded>.5) c=dec(max(c,0.));
  if(uDispRef>.5){
    float Y=dot(c,vec3(.2126,.7152,.0722)); float yc=min(Y,1.);
    float Ye = Y<=1. ? Y/(1.-uHL*yc*yc) : Y/(1.-uHL);
    c*= Ye/max(Y,1e-6);
  }
  return c;
}
void main(){
  float u=mix(uWin.x,uWin.z,vUv.x), vt=mix(uWin.y,uWin.w,1.-vUv.y);
  vec2 s=(uGeo*vec3(u,vt,1.)).xy;
  if(s.x<0.||s.y<0.||s.x>1.||s.y>1.){ o=vec4(0.,0.,0.,1.); return; }
  vec3 c=srcAt(s);
  // two-tone flash: the frame lit by gel A plus an offset "second flash" ghost lit by gel B
  if(uTT>.5){
    vec2 g=(vec2(u,vt)-.5-uTTP.xy)/uTTP.z+.5; vec3 c2=srcAt((uGeo*vec3(g,1.)).xy);
    vec3 lum=vec3(.2126,.7152,.0722); float Y1=dot(c,lum), Y2=dot(c2,lum);
    // flash light falls off fast: deepen the tones, then light each copy with its gel
    float k1=.18*pow(max(Y1,1e-6)/.18,1.35)/max(Y1,1e-6), k2=.18*pow(max(Y2,1e-6)/.18,1.35)/max(Y2,1e-6);
    vec3 a=mix(c,vec3(Y1),uTTM.x)*k1*uTTA*1.6, b=mix(c2,vec3(Y2),uTTM.x)*k2*uTTB*1.6;
    float band = uTTM.y>0. ? 1.-smoothstep(uTTM.y*.5,uTTM.y*.5+.02,abs(vt-uTTM.z)) : 1.;
    b*=uTTP.w*band;
    c = max(a,b) + .3*min(a,b);
  }
  c = uWB*c*uK;
  if(uSilverPre>.5) c=vec3(silverMono(c));
  vec2 fuv=vec2(u,vt);
  if(uDblOn>.5){
    vec2 d=(uDblM*vec3(fuv,1.)).xy; vec3 c2=vec3(0.);
    if(d.x>=0.&&d.y>=0.&&d.x<=1.&&d.y<=1.){ c2=texture(uDbl,vec2(d.x,uDblFlipY>.5?1.-d.y:d.y)).rgb; if(uDblEnc>.5) c2=dec(max(c2,0.));
      if(uDblDisp>.5){ float Y2=dot(c2,vec3(.2126,.7152,.0722)), y2=min(Y2,1.); c2*= (Y2<=1.? Y2/(1.-uHL*y2*y2) : Y2/(1.-uHL))/max(Y2,1e-6); }
      c2=uWB*c2*uDblK; if(uSilverPre>.5) c2=vec3(silverMono(c2)); }
    float a=uDblAmt; vec3 n1=c/(1.+c), n2=c2/(1.+c2);
    if(uDblMode==0) c=(c+c2*a)/(1.+.45*a);
    else if(uDblMode==1){ vec3 r=n1+n2*a-n1*n2*a; c=r/max(1.-r,vec3(1e-3)); }
    else if(uDblMode==2) c=mix(c,max(c,c2),a);
    else if(uDblMode==3) c=c*mix(vec3(1.),c2/.18,a);
    else if(uDblMode==5) c=mix(c,min(c,c2),a);
    else { float Y=dot(n1,vec3(.2126,.7152,.0722)); float w=smoothstep(.25+uDblMask*.4,.6+uDblMask*.4,Y)*a; c=mix(c,c2*1.15,w); }
  }
  if(uLeakAmt>0.){
    vec2 q=(fuv-uLeakP)*vec2(uAspect,1.); float sz=max(uLeakSize,.05);
    float n=sin(q.x*7.+uLeakSeed*1.7)*sin(q.y*5.3-uLeakSeed)*.5+sin((q.x+q.y)*13.+uLeakSeed*3.1)*.25;
    float d=length(q)/sz*(1.+.35*n); float w=exp(-d*d*1.6);
    vec3 lc=mix(uLeakC1,uLeakC2,exp(-d*d*5.));
    c+=lc*w*uLeakAmt*6.;
  }
  // push / pull: steeper (or flatter) characteristic, pushed shadows lose density
  if(uPush!=0.){ vec3 l=log2(max(c,vec3(1e-7))/.18); c=.18*exp2(l*(1.+.09*uPush)); if(uPush>0.) c=max(c-.0012*uPush*.18,0.)*(1.+.0012*uPush); }
  // local adjustments (gradient / radial / brush)
  for(int i=0;i<4;i++){ float w=maskW(i,s); if(w<=0.) continue;
    vec4 a=uMC[i];
    vec3 m=uMWB[i]*c*exp2(a.x);
    float Y=dot(m,vec3(.2126,.7152,.0722)); m=max(Y+(m-Y)*(1.+a.y),0.);
    if(a.z!=0.){ vec3 l=log2(max(m,vec3(1e-7))/.18); m=.18*exp2(l*(1.+a.z*.6)); }
    c=mix(c,m,w); }
  vec2 q=(vec2(u,vt)*2.-1.)*vec2(uAspect,1.)/length(vec2(uAspect,1.));
  float t=length(q)*uTanHalfDiag*1.6; float c2=1./(1.+t*t);
  c*=mix(1.,c2*c2,uFalloff);
  o=vec4(uToAP1*c,1.);
}`;
const DETAIL_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uPx; uniform float uSharp,uSRad,uNR,uNRC,uNRad; in vec2 vUv; out vec4 o;
float lum(vec3 c){ return max(dot(c,vec3(.2722,.6741,.0537)),1e-6); }
void main(){
  vec3 c=texture(uTex,vUv).rgb; float Y=lum(c), lY=log2(Y);
  vec3 chroma=c/Y;
  // luminance NR: bilateral in log space; colour NR: wide blur of chroma
  if(uNR>0.||uNRC>0.){
    float sr=.08+uNR*.6; float acc=0., wsum=0.; vec3 cacc=vec3(0.); float cw=0.;
    for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){
      vec3 q=texture(uTex,vUv+vec2(i,j)*uPx*uNRad).rgb; float qY=lum(q), d=log2(qY)-lY;
      float ws=exp(-float(i*i+j*j)/4.5)*exp(-d*d/(2.*sr*sr)); acc+=log2(qY)*ws; wsum+=ws;
      vec3 qc=texture(uTex,vUv+vec2(i,j)*uPx*uNRad*2.).rgb; float wc=exp(-float(i*i+j*j)/8.)*exp(-pow(log2(lum(qc))-lY,2.)/0.5); cacc+=qc/lum(qc)*wc; cw+=wc; }
    lY=mix(lY,acc/wsum,clamp(uNR*1.2,0.,1.));
    chroma=mix(chroma,cacc/cw,clamp(uNRC,0.,1.));
  }
  // sharpening: unsharp mask on log luminance, edge-limited so grain and noise aren't boosted as much
  if(uSharp>0.){
    float b=0., w=0.;
    for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ float k=(i==0&&j==0)?4.:(i==0||j==0)?2.:1.; b+=log2(lum(texture(uTex,vUv+vec2(i,j)*uPx*uSRad).rgb))*k; w+=k; }
    float d=lY-b/w; float lim=.35; d=clamp(d,-lim,lim);
    lY+=d*uSharp*1.6;
  }
  o=vec4(chroma*exp2(lY),1.);
}`;
const FX_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec4 uWin; uniform float uAspect,uZoom,uSoft,uFringe,uDistort,uBlurAll; uniform vec2 uMotion; uniform vec3 uTilt;
in vec2 vUv; out vec4 o;
void main(){
  vec2 span=vec2(uWin.z-uWin.x, uWin.w-uWin.y);
  vec2 iuv=vec2(mix(uWin.x,uWin.z,vUv.x), mix(uWin.y,uWin.w,1.-vUv.y));            // image uv, v from top
  vec2 toP=vec2(1./span.x,-1./span.y);                                                // image-uv delta → prep-uv delta
  vec2 base=vUv;
  if(uDistort!=0.){ // barrel (−) / pincushion (+), scaled so the frame stays filled
    vec2 q0=(iuv-.5)*vec2(uAspect,1.); float r2=dot(q0,q0)/dot(vec2(uAspect,1.)*.5,vec2(uAspect,1.)*.5);
    float k=uDistort; vec2 q=iuv-.5;
    vec2 d = k<0. ? q*(1.-k*r2)/(1.-k) + .5 : q*(1.-.5*k*r2)/(1.-.5*k) + .5;
    base=vUv+(d-iuv)*toP; iuv=d; }
  vec2 q=(iuv-.5)*vec2(uAspect,1.); float r=length(q)/length(vec2(uAspect,1.)*.5);
  float rad=uBlurAll + uSoft*smoothstep(.35,1.,r) + uTilt.x*smoothstep(uTilt.z*.5,uTilt.z*.5+.2,abs(iuv.y-uTilt.y));
  vec3 acc=vec3(0.); float w=0.;
  for(int i=0;i<24;i++){
    float t=(float(i)+.5)/24.; float ang=float(i)*2.39996; vec2 disc=vec2(cos(ang),sin(ang))*sqrt(t)*rad*vec2(1./uAspect,1.);
    vec2 off=(iuv-.5)*uZoom*(t-.5)*2. + uMotion*(t-.5)*vec2(1./uAspect,1.) + disc;
    vec2 p=base+off*toP;
    vec3 s;
    if(uFringe>0.){ vec2 f=(iuv-.5)*uFringe*toP; s=vec3(texture(uTex,p+f).r, texture(uTex,p).g, texture(uTex,p-f).b); }
    else s=texture(uTex,p).rgb;
    acc+=s; w+=1.;
  }
  o=vec4(acc/w,1.);
}`;
const BRIGHT_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform float uThr; in vec2 vUv; out vec4 o;
void main(){ vec3 c=max(texture(uTex,vUv).rgb,0.); float Y=dot(c,vec3(.27,.67,.06));
  float k = uThr>0. ? smoothstep(uThr,uThr*2.5,Y) : 1.; o=vec4(min(c*k,vec3(40.)),1.); }`;
const ANALOG_FS = `#version 300 es
precision highp float; uniform sampler2D uTex,uOSD; uniform vec2 uRes; uniform vec4 uFrame; uniform float uSeed,uOSDOn;
uniform vec4 uSig1,uSig2,uSig3,uSig4,uDisp1,uDisp2,uGate; uniform vec4 uDispV; uniform vec3 uTintC; uniform int uMaskT,uGateT;
out vec4 o;
float h1(vec2 p){ p=fract(p*vec2(443.897,441.423)); p+=dot(p,p.yx+19.19); return fract((p.x+p.y)*p.x); }
float vnoise(float x){ float i=floor(x), f=fract(x); return mix(h1(vec2(i,uSeed)),h1(vec2(i+1.,uSeed)),f*f*(3.-2.*f)); }
const mat3 YUV=mat3(.299,-.14713,.615, .587,-.28886,-.51499, .114,.436,-.10001);
const mat3 RGB=mat3(1.,1.,1., 0.,-.39465,2.03211, 1.13983,-.5806,0.);
vec2 fr; // frame px size
vec3 at(vec2 q){ q=clamp(q,vec2(.0005),vec2(.9995)); return texture(uTex,(uFrame.xy+vec2(q.x,1.-q.y)*uFrame.zw)/uRes).rgb; }
void main(){
  vec2 px=gl_FragCoord.xy; fr=uFrame.zw; vec2 f=(px-uFrame.xy)/fr;
  if(f.x<0.||f.y<0.||f.x>1.||f.y>1.){ o=vec4(texture(uTex,px/uRes).rgb,1.); return; }
  vec2 q=vec2(f.x,1.-f.y);                    // top-left origin
  // ---- CRT curvature: the picture bulges and the corners fall off the tube
  float curve=uDisp1.z; vec2 cq=q-.5; float r2=dot(cq*vec2(fr.x/fr.y,1.)/(fr.x/fr.y),cq); q=.5+cq*(1.+curve*.32*r2*4.)/(1.+curve*.32);
  float screen=1.; if(curve>0.&&(q.x<0.||q.y<0.||q.x>1.||q.y>1.)) screen=0.;
  // ---- cine gate: weave, flicker, rounded window, overscan rebate with perforations
  float gateMask=1., holeMask=0., rebate=0.;
  if(uGateT>0){
    float wv=uGate.y; q+= (vec2(vnoise(uSeed*7.1),vnoise(uSeed*5.3+9.))-.5)*wv*.012;
    float ov=uGate.x, soft=uGate.z; float ar=fr.x/fr.y;
    vec2 wc=vec2(.5,.5), ws=vec2(1.)-ov*vec2(.30,.16);       // window size in frame uv
    if(uGateT==2||uGateT==4) wc.x+=ov*.07;                    // single-side perfs push the picture over
    vec2 d=abs(q-wc)-ws*.5; float rad=(uGateT==1||uGateT==2?.075:.045)*ws.y; vec2 dd=vec2(d.x*ar,d.y);
    float sd=length(max(dd+rad,0.))+min(max(dd.x,dd.y),0.)-rad;
    gateMask=1.-smoothstep(-.004-soft*.02,.002,sd);
    if(ov>0.){ // perforations in the rebate, at film scale
      rebate=1.-gateMask; float ph=ws.y*.18, pw=ph*.62/ar*1.4;
      vec2 holes[4]; int n=0;
      if(uGateT==1){ holes[0]=vec2(wc.x-ws.x*.5-pw*1.1,.5); n=1; }                              // Super 8: beside the frame
      else if(uGateT==2){ holes[0]=vec2(wc.x-ws.x*.5-pw*1.1,.5-ws.y*.5-ph*.08); holes[1]=holes[0]+vec2(0.,ws.y+ph*.16); n=2; } // Standard 8: at the frame line
      else if(uGateT==3){ for(int k=0;k<2;k++){ float xs=k==0?wc.x-ws.x*.5-pw*.9:wc.x+ws.x*.5+pw*.9; holes[k*2]=vec2(xs,.5-ws.y*.5-ph*.1); holes[k*2+1]=vec2(xs,.5+ws.y*.5+ph*.1);} n=4; } // 16mm double perf
      else if(uGateT==4){ holes[0]=vec2(wc.x-ws.x*.5-pw*.9,.5-ws.y*.5-ph*.1); holes[1]=vec2(holes[0].x,.5+ws.y*.5+ph*.1); n=2; }      // Super 16 single perf
      else { holes[0]=vec2(wc.x-ws.x*.5-pw*.8,.5); holes[1]=vec2(wc.x+ws.x*.5+pw*.8,.5); n=2; }  // 35mm cine
      for(int k=0;k<4;k++){ if(k>=n) break; vec2 hd=abs(q-holes[k])-vec2(pw,ph)*.5; vec2 hh=vec2(hd.x*ar,hd.y); float hr=ph*.25;
        float hs=length(max(hh+hr,0.))+min(max(hh.x,hh.y),0.)-hr; holeMask=max(holeMask,1.-smoothstep(-.002,.002,hs)); }
      q=(q-wc)/ws+.5; }
  }
  // ---- signal: lines, time-base jitter, tracking, head switching, interlace
  float lines = uSig1.y>0. ? min(uSig1.y,fr.y/3.2) : fr.y; float L=floor(q.y*lines); if(uSig1.y>0.) q.y=(L+.5)/lines;
  float dx=0.; float jit=uSig3.w; dx+=(h1(vec2(L,uSeed))-.5)*jit*.004;
  float tr=uSig3.x; if(tr>0.){ float b=uSig3.y, bd=abs(q.y-b); float band=1.-smoothstep(.0,.045+tr*.05,bd);
    dx+=band*(vnoise(L*.35+uSeed*3.)-.3)*tr*.06 + band*(h1(vec2(L*1.7,uSeed))-.5)*tr*.02; }
  float hs=uSig3.z; if(hs>0.&&q.y>.965){ float k=(q.y-.965)/.035; dx+=hs*.03*k*(1.+h1(vec2(L,uSeed+2.))); }
  if(uSig4.x>0.&&mod(L,2.)>.5) dx+=uSig4.x*.006;
  float xpx=1./fr.x;
  // luma with bandwidth loss, chroma with heavier loss + shift + rightward smear
  float res=uSig1.x, chr=uSig1.z, sh=uSig1.w, bleed=uSig2.x;
  float Y=0., wY=0., Yw=0., wW=0.; vec2 C=vec2(0.); float wC=0.;
  float sY=1.+res*14., sC=2.+chr*40.;
  for(int i=-8;i<=8;i++){ float t=float(i);
    vec3 a=YUV*at(vec2(q.x+dx+t*sY*.35*xpx,q.y)); float k=exp(-t*t/18.); Y+=a.x*k; wY+=k;
    vec3 b=YUV*at(vec2(q.x+dx+t*sY*1.2*xpx,q.y)); Yw+=b.x*k; wW+=k;
    vec3 c=YUV*at(vec2(q.x+dx-sh*xpx*fr.x*.004+t*sC*.35*xpx - (t>0.?t*bleed*6.*xpx:0.),q.y)); float kc=exp(-t*t/18.)*(t>0.?1.+bleed*2.:1.); C+=c.yz*kc; wC+=kc; }
  Y/=wY; Yw/=wW; C/=wC;
  Y+=uSig2.y*(Y-Yw)*2.2;                                       // sharpening halos (edge enhancement)
  if(uSig2.z>0.){ float g=(YUV*at(vec2(q.x+dx-uSig2.w*xpx*fr.x*.0015,q.y))).x; Y=mix(Y,Y+g*.6,uSig2.z); Y/=1.+uSig2.z*.35; } // ghost / multipath echo
  // colour: saturation and hue drift
  float sat=1.+uSig4.y; float hr=uSig4.z; C=mat2(cos(hr),sin(hr),-sin(hr),cos(hr))*C*sat;
  // noise: luma grain stretched along the line, chroma blotches, snow, dropouts
  vec2 np=vec2(floor(q.x*fr.x/(1.+uSig1.x*3.)),L);
  Y+=(h1(np+uSeed)-.5)*uSig4.w*.25;
  C+=(vec2(h1(vec2(floor(q.x*fr.x/6.),L)+uSeed*1.3),h1(vec2(floor(q.x*fr.x/6.),L)+uSeed*2.7))-.5)*uDisp2.w*.22;
  if(uDisp2.z>0.){ float sn=h1(np*1.7+uSeed*5.); Y=mix(Y,sn,uDisp2.z*.5*step(.4,sn)); }
  { float dp=uDisp2.y; if(dp>0.){ float lr=h1(vec2(L,uSeed+11.)); if(lr<dp*.012){ float st=h1(vec2(L,uSeed+13.)), ln=.05+h1(vec2(L,uSeed+17.))*.3; if(q.x>st&&q.x<st+ln) Y=mix(Y,1.,.85); } } }
  vec3 c=clamp(RGB*vec3(Y,C),0.,1.);
  // digital compression: 8×8 blocks (scaled to a small-sensor resolution) and colour banding
  float blk=uDispV.z; if(blk>0.){ float bpx=8.*max(1.,fr.x/640.); vec2 bq=(floor(q*fr/bpx)+.5)*bpx/fr; vec2 o2=bpx*.3/fr;
    vec3 avg=(at(bq+vec2(o2.x,o2.y))+at(bq-vec2(o2.x,o2.y))+at(bq+vec2(o2.x,-o2.y))+at(bq+vec2(-o2.x,o2.y)))*.25;
    c=mix(c,avg+(c-avg)*(1.-blk*.75),blk); float lv=mix(48.,10.,blk); c=floor(c*lv+.5)/lv; }
  if(uTintC.x>=0.){ float y=dot(c,vec3(.299,.587,.114)); c=y*uTintC; }
  // cine flicker
  c*=1.+(h1(vec2(uSeed,3.7))-.5)*uGate.w*.25;
  // ---- display: phosphor bloom, scanlines, shadow mask, vignette, rounded tube corners
  float bl=uDisp1.w; if(bl>0.){ vec3 g=vec3(0.); for(int i=0;i<8;i++){ float a=float(i)*.785+.3; for(int j=1;j<=2;j++){ vec2 off=vec2(cos(a),sin(a))*float(j)*.006*vec2(fr.y/fr.x,1.); g+=at(q+off); } } g/=16.; c+=max(g-.35,0.)*bl*.9; }
  float sc=uDisp1.x; if(sc>0.){ float n=min(uDisp1.y,fr.y/3.2); float ph=fract(q.y*n); float lum=dot(c,vec3(.3,.6,.1)); float w=mix(.32,.5,lum); float beam=smoothstep(0.,w,ph)*smoothstep(1.,1.-w,ph); c*=mix(1.,beam*1.55,sc); }
  if(uMaskT>0){ float m=uDisp2.x; vec2 sp=gl_FragCoord.xy/max(1.,fr.x/900.); vec3 mk;
    if(uMaskT==1){ float k=mod(floor(sp.x),3.); mk=vec3(k<.5?1.:.25,k>.5&&k<1.5?1.:.25,k>1.5?1.:.25); }
    else if(uMaskT==2){ float row=floor(sp.y/2.); float k=mod(floor(sp.x+mod(row,2.)*1.5),3.); mk=vec3(k<.5?1.:.3,k>.5&&k<1.5?1.:.3,k>1.5?1.:.3)*(mod(floor(sp.y),2.)<.5?1.:.8); }
    else { float row=floor(sp.y/3.); float k=mod(floor(sp.x),3.); float slot=step(.5,mod(floor(sp.y)+mod(floor(sp.x/3.),2.)*1.5,3.)); mk=vec3(k<.5?1.:.25,k>.5&&k<1.5?1.:.25,k>1.5?1.:.25)*mix(.6,1.,slot); }
    c*=mix(vec3(1.),mk*1.45,m); }
  o.rgb=c;
  // ---- on-screen display (follows the tube's curve)
  if(uOSDOn>.5){ vec4 t=texture(uOSD,q); o.rgb=mix(o.rgb,t.rgb,t.a); }
  // vignette + corners + gate
  { float cv=uDispV.x, cr=uDispV.y; vec2 ee=(q-.5)*2.; float v=1.-cv*.75*smoothstep(.3,1.45,length(ee*vec2(1.,1.)));
    vec2 cd=abs(ee)-(1.-cr*.18); float corner=cr>0.?1.-smoothstep(-.01,.01,length(max(cd,0.))-cr*.18):1.; o.rgb*=v*corner; }
  o.rgb*=screen;
  if(uGateT>0){ vec3 base=vec3(.05,.045,.04)+vec3(.02)*h1(px*.5); o.rgb=mix(base,o.rgb,gateMask); o.rgb=mix(o.rgb,vec3(.9,.88,.84),holeMask*rebate); }
  o.a=1.;
}`;
const PACK_FS = `#version 300 es
precision highp float; uniform sampler2D uA,uB,uC,uD; uniform vec3 uOn; in vec2 vUv; out vec4 o;
void main(){ vec3 L=vec3(.27,.67,.06); o=vec4(uOn.x>.5?dot(texture(uA,vUv).rgb,L):0., uOn.y>.5?dot(texture(uB,vUv).rgb,L)*.55+dot(texture(uD,vUv).rgb,L)*.45:0., uOn.z>.5?dot(texture(uC,vUv).rgb,L):0., 1.); }`;
const BLUR_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uDir; in vec2 vUv; out vec4 o;
void main(){ vec3 s=vec3(0.); float w=0.; for(int i=-12;i<=12;i++){ float f=float(i); float k=exp(-f*f/60.); s+=texture(uTex,vUv+uDir*f).rgb*k; w+=k; } o=vec4(s/w,1.); }`;
const FINAL_FS = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler2D uPrep,uHal,uGlowTex,uSrc,uBorder,uCurve; uniform sampler3D uLut;
uniform vec2 uRes,uShaper; uniform vec4 uFrame,uImg,uWin; uniform vec3 uBg; uniform mat3 uGeo;
uniform vec3 uFlare; uniform vec3 uFlareC[4];
uniform vec4 uPaperG; uniform vec3 uPaperT;
uniform float uOrig,uFilmAmt,uHasLut,uN,uHalAmt,uGlow,uBefore,uFlip,uEncoded,uContrast,uHighlights,uShadows,uWhites,uBlacks,uVibrance,uSat;
uniform sampler2D uA[6]; uniform float uAPost[6],uAMono[6],uAOn[6],uAAmt[6],uAInv[6]; uniform int uAMode[6]; uniform mat3 uAM[6]; uniform vec3 uAHue[6];
uniform sampler2D uStructTex,uDust; uniform sampler2D uFineTex; uniform float uFine,uToneBal; uniform vec4 uStructB,uSB,uSVig,uBurnS; uniform vec3 uSAmp; uniform vec2 uZones;
uniform float uStruct,uDustOn,uDustDark,uSilver,uToneAmt; uniform vec2 uBurn; uniform vec3 uToneLo,uToneHi;
uniform float uGrain,uGrainCell,uGrainSoft,uClip,uBorderOn,uCurveOn,uHslOn,uGradeOn,uToSRGB,uSrcToP3; uniform int uMono; uniform uint uSeed;
uniform float uHslH[8]; uniform float uHslS[8]; uniform float uHslL[8];
uniform vec4 uGSh,uGMid,uGHi; uniform vec2 uGBlend;
out vec4 o;
vec3 enc(vec3 c){ c=max(c,0.); return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-.055, step(.0031308,c)); }
vec3 dec(vec3 c){ return mix(c/12.92, pow((c+.055)/1.055,vec3(2.4)), step(.04045,c)); }
const mat3 AP1_TO_709 = mat3(1.7050510,-0.1302564,-0.0240034, -0.6217921,1.1408047,-0.1289690, -0.0832589,-0.0105483,1.1529724);
const mat3 P3_TO_709 = mat3(1.2249401,-0.0420569,-0.0196376, -0.2249404,1.0420571,-0.0786361, 0.0,0.0,1.0982735);
const mat3 R709_TO_P3 = mat3(0.8224621,0.0331941,0.0170827, 0.1775380,0.9668058,0.0723974, 0.0,0.0,0.9105199);
const mat3 P3_TO_LMS = mat3(0.4813798544,0.2288134566,0.0839487985, 0.4621183697,0.6532081524,0.2826298458, 0.0565017758,0.1179783910,0.6334213558);
const mat3 LMS_TO_P3 = mat3(3.1277689713,-1.0910090184,-0.0260108491, -2.2571357625,2.4133317103,-0.5080413342, 0.1293667912,-0.3223226918,1.5340521833);
vec3 toLab(vec3 l){ vec3 m=pow(max(P3_TO_LMS*l,0.),vec3(1./3.));
  return vec3(.2104542553*m.x+.7936177850*m.y-.0040720468*m.z, 1.9779984951*m.x-2.4285922050*m.y+.4505937099*m.z, .0259040371*m.x+.7827717662*m.y-.8086757660*m.z); }
vec3 fromLab(vec3 L){ vec3 m=vec3(L.x+.3963377774*L.y+.2158037573*L.z, L.x-.1055613458*L.y-.0638541728*L.z, L.x-.0894841775*L.y-1.2914855480*L.z);
  return LMS_TO_P3*(m*m*m); }
uint pcg(uint v){uint s=v*747796405u+2891336453u;uint w=((s>>((s>>28u)+4u))^s)*277803737u;return (w>>22u)^w;}
float u01(inout uint s){s=pcg(s);return float(s)*(1./4294967295.);}
float emulsion(vec2 p,float silver,float rMean,uint layer){
  float area=3.14159*rMean*rMean*1.2;
  float lam=-log(max(1.-clamp(silver,0.,1.)*.985,1e-3));
  float pres=clamp(lam/(2.*area),0.,1.); float E=1.-exp(-2.*pres*area);
  ivec2 c=ivec2(floor(p)); float keep=1.;
  for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){
    ivec2 cc=c+ivec2(dx,dy);
    uint s=pcg(uint(cc.x+65536)*73856093u^uint(cc.y+65536)*19349663u^layer*83492791u^uSeed);
    for(int k=0;k<2;k++){ float pr=u01(s); vec2 off=vec2(u01(s),u01(s)); float g=u01(s)+u01(s)+u01(s)-1.5;
      if(pr>pres) continue; float r=rMean*exp(.55*g); float d=length(p-vec2(cc)-off);
      keep*=smoothstep(r-uGrainSoft,r+uGrainSoft,d); }
  }
  return (1.-keep)-E;
}
float grainField(vec2 p,float silver,uint seed){
  return emulsion(p,silver,.42,seed)*.62 + emulsion(p*.57+vec2(17.3,4.1),silver,.45,seed+1u)*.34 + emulsion(p*.31+vec2(-8.7,31.2),silver,.48,seed+2u)*.2;
}
float lumaA(vec3 c){ return dot(c,vec3(.2290,.6917,.0793)); }
vec3 layer(vec3 c, vec4 a, int i){
  int m=uAMode[i]; float k=uAAmt[i];
  if(m==0){ vec3 s=clamp(dec(a.rgb)*uAHue[i],0.,1.); if(uAMono[i]>.5) s=vec3(max(s.r,max(s.g,s.b))*.92+lumaA(s)*.08); s=enc(s); return 1.-(1.-c)*(1.-s*k); }
  if(m==2){ float g=a.r; vec3 o=mix(2.*c*g, 1.-2.*(1.-c)*(1.-g), step(.5,c)); return mix(c,o,k); }
  vec3 col = uAInv[i]>.5 ? vec3(1.)-a.rgb : a.rgb;
  return mix(c, col, clamp(a.a*k,0.,1.));
}
float luma(vec3 c){ return dot(c,vec3(.2290,.6917,.0793)); }
float crv(float x,int ch){ float v=texture(uCurve,vec2(x*255./256.+.5/256.,.5))[ch]; return v; }
void main(){
  vec2 px=gl_FragCoord.xy;
  vec2 fuv=(px-uFrame.xy)/uFrame.zw;
  if(fuv.x<0.||fuv.y<0.||fuv.x>1.||fuv.y>1.){ o=vec4(uBg,1.); return; }
  vec2 iuv=(px-uImg.xy)/uImg.zw;
  vec4 bd = uBorderOn>.5 ? texture(uBorder,vec2(fuv.x,1.-fuv.y)) : vec4(0.);
  vec3 col=vec3(0.);
  bool inImg = iuv.x>=0.&&iuv.y>=0.&&iuv.x<=1.&&iuv.y<=1.;
  if(inImg && bd.a<.999){
    float u=iuv.x, vt=1.-iuv.y;
    if(uBefore>.5){
      vec2 s=(uGeo*vec3(u,vt,1.)).xy;
      vec3 c=texture(uSrc,vec2(s.x, uFlip>.5?1.-s.y:s.y)).rgb;
      vec3 lin = uEncoded>.5 ? dec(max(c,0.)) : c;
      if(s.x<0.||s.y<0.||s.x>1.||s.y>1.) lin=vec3(0.);
      col = enc(uSrcToP3>.5 ? R709_TO_P3*lin : lin);
    } else {
      vec2 puv=vec2((u-uWin.x)/(uWin.z-uWin.x), 1.-(vt-uWin.y)/(uWin.w-uWin.y));
      vec3 E=texture(uPrep,puv).rgb;
      float Yblur=-1.;
      if(uStruct!=0.){ vec3 B=texture(uStructTex,puv).rgb; float Y=max(dot(E,vec3(.27,.67,.06)),1e-6), Yb=max(dot(B,vec3(.27,.67,.06)),1e-6); Yblur=Yb;
        // structure by tone range, like Silver Efex: highlights / midtones / shadows
        float v=pow(clamp(Yb/.18*.18,0.,1.),1./2.2), ws=1.-smoothstep(.1,.45,v), wh=smoothstep(.45,.85,v), wm=max(0.,1.-ws-wh);
        float k=uStructB.x+uStructB.y*wh+uStructB.z*wm+uStructB.w*ws;
        E*=pow(Y/Yb, clamp(k,-1.,1.5)*.9); }
      if(uFine!=0.){ vec3 B=texture(uFineTex,puv).rgb; float Y=max(dot(E,vec3(.27,.67,.06)),1e-6), Yb=max(dot(B,vec3(.27,.67,.06)),1e-6);
        E*=pow(Y/Yb, clamp(uFine,-1.,1.)*1.3); }
      if(uHalAmt>0.){ vec3 h=texture(uHal,puv).rgb; float hy=uFlare.x>.5?h.r:dot(h,vec3(.3,.6,.1)); E += hy*vec3(1.,.12,.02)*uHalAmt; }
      if(uFlare.x>.5){ float st=texture(uHal,puv).g; E += st*uFlareC[0]*uFlare.y;
        // ghosts: soft discs mirrored through the centre at different scales
        vec2 d=puv-.5; float gs[4]=float[4](-.45,-1.1,.6,-1.8); float gw[4]=float[4](.9,.55,.35,.4);
        for(int i=0;i<4;i++){ vec2 q=.5+d*gs[i]; if(q.x<0.||q.y<0.||q.x>1.||q.y>1.) continue; float g=texture(uHal,q).b; E += g*uFlareC[i==0?1:i]*gw[i]*uFlare.z; } }
      if(uGlow>0.){ vec3 g=texture(uGlowTex,puv).rgb; E = mix(E, E*.75+g*.5, uGlow*.6); }
      vec3 c;
      if(uHasLut>.5){
        vec3 x=clamp((log2(max(E,vec3(1e-12))/.18)+uShaper.x)/(uShaper.x+uShaper.y),0.,1.);
        c=texture(uLut, x*(uN-1.)/uN + .5/uN).rgb;
        if(uFilmAmt<.999){ vec3 l=max(R709_TO_P3*(AP1_TO_709*E),0.); vec3 nt=enc(l*1.2/(1.+l)); c=mix(nt,c,uFilmAmt); }
        if(uPaperG.x>.5){ // darkroom paper: contrast grade, base lift, paper tone
          float y=max(luma(c),1e-4), k=uPaperG.y, v=y<.5?.5*pow(2.*y,k):1.-.5*pow(2.*(1.-y),k); v=uPaperG.z+v*(1.-uPaperG.z);
          c=clamp(c*(v/y),0.,1.); c*=mix(vec3(1.),uPaperT,(1.-v)*.9+.1); }
      } else if(uOrig>.5){ c=clamp(enc(max(R709_TO_P3*(AP1_TO_709*E),0.)),0.,1.); }   // the photo as shot
      else { vec3 l=max(R709_TO_P3*(AP1_TO_709*E),0.); c=enc(l*1.2/(1.+l)); }
      float y=luma(c);
      float hm=smoothstep(.35,1.,y), sm=1.-smoothstep(0.,.6,y);
      float dy = uHighlights*.32*hm*(uHighlights>0.?(1.-y):y) + uShadows*.38*sm*(uShadows>0.?(1.-y)*.9:y);
      float ny=clamp(y+dy,0.,1.);
      c *= ny/max(y,1e-4);
      float lo=-uBlacks*.07, hi=1.+uWhites*.12;
      c = (c-lo*(1.-c))/max(1e-3,1.-lo); c = 1.-(1.-c)*(1.-(hi-1.)*c*c*1.4);
      vec3 sc=clamp(c,0.,1.); vec3 s=sc*sc*(3.-2.*sc);
      c = uContrast>=0. ? mix(sc,s,uContrast) : mix(sc,.46+(sc-.46)*.55,-uContrast);
      c=clamp(c,0.,1.);
      if(uCurveOn>.5) c=vec3(crv(c.r,0),crv(c.g,1),crv(c.b,2));
      if(uMono==0){
        y=luma(c); float sat=length(c-y)*1.6;
        c = y+(c-y)*(1.+uSat); c = y+(c-y)*(1.+uVibrance*(1.-clamp(sat,0.,1.)));
        c=clamp(c,0.,1.);
        if(uHslOn>.5 || uGradeOn>.5){
          vec3 L=toLab(dec(c));
          if(uHslOn>.5){
            float C=length(L.yz), h=degrees(atan(L.z,L.y)); if(h<0.) h+=360.;
            float dh=0., ds=0., dl=0.;
            float centers[8]=float[8](25.,55.,95.,140.,195.,250.,290.,340.);
            for(int i=0;i<8;i++){ float d=abs(h-centers[i]); d=min(d,360.-d); float w=max(0.,1.-d/42.); w=w*w*(3.-2.*w);
              dh+=uHslH[i]*w; ds+=uHslS[i]*w; dl+=uHslL[i]*w; }
            float cw=smoothstep(.01,.08,C);
            h+=dh*cw; C*=max(0.,1.+ds*cw); L.x*=1.+dl*cw*.5*clamp(C*6.,0.,1.);
            L.yz=C*vec2(cos(radians(h)),sin(radians(h)));
          }
          if(uGradeOn>.5){
            float l=L.x, bal=uGBlend.y*.25, bl=mix(.15,.45,uGBlend.x);
            float ws=1.-smoothstep(.0,.55+bal,l), wh=smoothstep(.45+bal,1.,l), wm=max(0.,1.-ws-wh);
            ws=mix(ws,1.-l,bl); wh=mix(wh,l,bl);
            L.yz+=uGSh.xy*ws+uGMid.xy*wm+uGHi.xy*wh;
            L.x+= (uGSh.z*ws+uGMid.z*wm+uGHi.z*wh)*.12;
          }
          c=clamp(enc(max(fromLab(L),0.)),0.,1.);
        }
      }
      if(uSilver>.5){
        vec3 l=dec(c); float L=dot(l,vec3(.2290,.6917,.0793));
        vec2 e=abs(vec2(u,vt)-.5)*2.; float ed=pow(pow(e.x,4.)+pow(e.y,4.),.25);
        L*=1.-uBurn.x*.85*smoothstep(1.-uBurn.y,1.15,ed);
        // per-side burn (top, bottom, left, right)
        { float sz=uBurn.y; vec4 e4=vec4(1.-vt*2.,vt*2.-1.,1.-u*2.,u*2.-1.);
          L*=(1.-uBurnS.x*.85*smoothstep(1.-sz,1.1,e4.x))*(1.-uBurnS.y*.85*smoothstep(1.-sz,1.1,e4.y))*(1.-uBurnS.z*.85*smoothstep(1.-sz,1.1,e4.z))*(1.-uBurnS.w*.85*smoothstep(1.-sz,1.1,e4.w)); }
        // tonality in a perceptual space: brightness by range, contrast, amplify whites / blacks, soft contrast
        float v=pow(max(L,0.),1./2.2);
        float ws=1.-smoothstep(0.,.5,v), wh=smoothstep(.5,1.,v);
        v+= uSB.x*.25*v*(1.-v)*4.*.5 + uSB.y*.18*wh*(1.-v*.6) + uSB.z*.18*ws*v*1.5;
        if(uSB.w!=0.){ float k=uSB.w>0.?1.+uSB.w*1.4:1.+uSB.w*.7; v=clamp(v,0.,1.); v=v<.5?.5*pow(2.*v,k):1.-.5*pow(2.*(1.-v),k); }
        v+= uSAmp.x*.35*smoothstep(.45,1.,v)*(1.-v)*2. - uSAmp.y*.35*(1.-smoothstep(0.,.55,v))*v*2.;
        if(uSAmp.z!=0.&&Yblur>0.){ float vb=pow(clamp(Yblur*2.,0.,1.),1./2.2); v=mix(v, 1.-(1.-v)*(1.-vb*.55), uSAmp.z); v=mix(v,.5+(v-.5)*.85,uSAmp.z*.5); }
        // vignette (negative = lighten edges)
        if(uSVig.x!=0.){ vec2 q=(vec2(u,vt)-.5-uSVig.zw*.5)*vec2(uImg.z/uImg.w,1.); float r=length(q)/length(vec2(uImg.z/uImg.w,1.)*.5);
          float m=smoothstep(mix(.95,.1,uSVig.y),1.25,r); v = uSVig.x>0. ? v*(1.-uSVig.x*.8*m) : v+(1.-v)*(-uSVig.x)*.8*m; }
        L=pow(clamp(v,0.,1.2),2.2);
        float t=smoothstep(0.,1.,clamp(pow(L,1./2.2)-uToneBal*.35,0.,1.)); vec3 tint=mix(uToneLo,uToneHi,t);
        c=clamp(enc(L*mix(vec3(1.),tint,uToneAmt)),0.,1.);
      }
      // Studio asset layers before the grain: leaks / burns / flares (screen), paper texture (overlay)
      if(uAOn[0]>.5&&uAPost[0]<.5) c=layer(c,texture(uA[0],(uAM[0]*vec3(u,vt,1.)).xy),0);
      if(uAOn[1]>.5&&uAPost[1]<.5) c=layer(c,texture(uA[1],(uAM[1]*vec3(u,vt,1.)).xy),1);
      if(uAOn[2]>.5&&uAPost[2]<.5) c=layer(c,texture(uA[2],(uAM[2]*vec3(u,vt,1.)).xy),2);
      if(uAOn[3]>.5&&uAPost[3]<.5) c=layer(c,texture(uA[3],(uAM[3]*vec3(u,vt,1.)).xy),3);
      if(uAOn[4]>.5&&uAPost[4]<.5) c=layer(c,texture(uA[4],(uAM[4]*vec3(u,vt,1.)).xy),4);
      if(uAOn[5]>.5&&uAPost[5]<.5) c=layer(c,texture(uA[5],(uAM[5]*vec3(u,vt,1.)).xy),5);
      if(uGrain>0.){
        vec2 ip=vec2(u,vt)*uImg.zw/uGrainCell;
        float k=uGrain*1.7; float yy=luma(c);
        float lum=grainField(ip,1.-yy,1u);
        if(uMono==1) c-=lum*k;
        else { vec3 ch=vec3(emulsion(ip*.8,1.-c.r,.44,11u),emulsion(ip*.8+5.1,1.-c.g,.44,12u),emulsion(ip*.8+9.7,1.-c.b,.44,13u));
               c-=(lum*.8+ch*.3)*k; }
      }
      // dust and frames sit on top of everything, like the scan of a real print/negative
      if(uAOn[0]>.5&&uAPost[0]>.5) c=layer(c,texture(uA[0],(uAM[0]*vec3(u,vt,1.)).xy),0);
      if(uAOn[1]>.5&&uAPost[1]>.5) c=layer(c,texture(uA[1],(uAM[1]*vec3(u,vt,1.)).xy),1);
      if(uAOn[2]>.5&&uAPost[2]>.5) c=layer(c,texture(uA[2],(uAM[2]*vec3(u,vt,1.)).xy),2);
      if(uAOn[3]>.5&&uAPost[3]>.5) c=layer(c,texture(uA[3],(uAM[3]*vec3(u,vt,1.)).xy),3);
      if(uAOn[4]>.5&&uAPost[4]>.5) c=layer(c,texture(uA[4],(uAM[4]*vec3(u,vt,1.)).xy),4);
      if(uAOn[5]>.5&&uAPost[5]>.5) c=layer(c,texture(uA[5],(uAM[5]*vec3(u,vt,1.)).xy),5);
      if(uDustOn>.5){ float a=texture(uDust,vec2(u*uImg.z/uImg.w,vt)*1.0).a; c=mix(c, uDustDark>.5?vec3(.04):vec3(.97), clamp(a*uDustOn*1.05,0.,1.)); }
      col=clamp(c,0.,1.);
      if(uToSRGB>.5) col=clamp(enc(P3_TO_709*dec(col)),0.,1.);
      if(uZones.x>.5){ float z=floor(clamp(pow(luma(dec(col)),1./2.2)*1.0001,0.,1.)*10.+.5); vec3 g=vec3(z/10.); col = abs(z-uZones.y)<.5 ? mix(g,vec3(1.,.55,.1),.75) : g; }
      if(uClip>.5){ if(max(col.r,max(col.g,col.b))>.996) col=vec3(1.,.15,.1); else if(min(col.r,min(col.g,col.b))<.004) col=vec3(.15,.45,1.); }
    }
  }
  col = mix(col, bd.rgb, bd.a);
  o=vec4(col,1.);
}`;
