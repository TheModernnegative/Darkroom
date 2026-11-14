// Develop engine: source → geometry (crop/rotate) → (WB, exposure, lens) → halation/glow → film LUT
// → tone (Basic, curve, HSL, colour grading) → grain → frame.  Output: Display P3 (or sRGB fallback).
const HSL_BANDS = [['Red',0],['Orange',30],['Yellow',60],['Green',120],['Aqua',180],['Blue',225],['Purple',270],['Magenta',315]];
const DEFAULTS = {
  stock:'kodak_portra_400', paper:null, format:'35mm', autoExp:true, ev:0, temp:0, tint:0, hlExpand:0.55,
  contrast:0, highlights:0, shadows:0, whites:0, blacks:0, vibrance:0, saturation:0,
  grain:1, grainSize:1, grainRough:0.35, halation:1, glow:0, falloff:0.35, border:'none',
  crop:{x:0,y:0,w:1,h:1}, angle:0, rot:0, flip:false, aspect:'free',
  curve:{m:[[0,0],[1,1]], r:[[0,0],[1,1]], g:[[0,0],[1,1]], b:[[0,0],[1,1]]},
  hslH:[0,0,0,0,0,0,0,0], hslS:[0,0,0,0,0,0,0,0], hslL:[0,0,0,0,0,0,0,0],
  gShH:220, gShS:0, gShL:0, gMidH:40, gMidS:0, gMidL:0, gHiH:45, gHiS:0, gHiL:0, gBlend:50, gBalance:0,
};
const PER_PHOTO_KEYS = ['ev','temp','tint','crop','angle','rot','flip','aspect'];
function cloneParams(p){ return JSON.parse(JSON.stringify(p)); }
function withDefaults(p){ return Object.assign(cloneParams(DEFAULTS), cloneParams(p||{})); }
const FORMATS = { '35mm':{gauge:2.4,diag:43.3,label:'35mm'}, '645':{gauge:1.6,diag:69.8,label:'6×4.5'}, '6x7':{gauge:1.35,diag:89.6,label:'6×7'}, '4x5':{gauge:1.0,diag:162.6,label:'4×5'} };

const Engine = {
  manifest:null, luts:{}, src:null, p:withDefaults(), before:false, showClip:false, cropMode:false,
  view:{mode:'fit', cx:.5, cy:.5}, RT:{}, dirty:true, hoverParams:null, histDirty:true, outP3:false,

  init(canvas){
    this.canvas=canvas; const gl=GLU.init(canvas); this.gl=gl;
    try{ if('drawingBufferColorSpace' in gl){ gl.drawingBufferColorSpace='display-p3'; this.outP3 = gl.drawingBufferColorSpace==='display-p3'; } }catch(e){}
    this.P = {
      prep: GLU.program(GLU.QUAD_VS, PREP_FS),
      bright: GLU.program(GLU.QUAD_VS, BRIGHT_FS),
      blur: GLU.program(GLU.QUAD_VS, BLUR_FS),
      final: GLU.program(GLU.QUAD_VS, FINAL_FS),
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
    const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D,t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB16F,N,N,N,0,gl.RGB,gl.HALF_FLOAT,new Uint16Array(buf));
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D,k,v);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
    return this.luts[name]=t;
  },
  async ensureLuts(p){ await this.lut(this.paperFor(p).lut); },

  setSource(src){ this.src=src; this.dirty=true; this.histDirty=true; },
  keyFromSamples(lum, w, h){
    let s=0, ws=0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const Y=lum[y*w+x]; if(!(Y>=0)) continue;
      const dx=(x/w-.5)/.35, dy=(y/h-.5)/.35, wt=Math.exp(-(dx*dx+dy*dy)); s+=wt*Math.log(Math.max(Y,1e-5)); ws+=wt; }
    return Math.exp(s/ws);
  },

  // ---------------------------------------------------------------- geometry
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
    const gl=this.gl; gl.bindTexture(gl.TEXTURE_2D,this.curveTex); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,256,1,0,gl.RGBA,gl.HALF_FLOAT,data);
    this.curveKey=key; return this.curveTex;
  },
  curveIsIdentity(p){ const id=c=>c.length===2&&c[0][0]===0&&c[0][1]===0&&c[1][0]===1&&c[1][1]===1; return id(p.curve.m)&&id(p.curve.r)&&id(p.curve.g)&&id(p.curve.b); },

  // ---------------------------------------------------------------- layout
  layout(p){
    p=p||this.p;
    const c=this.canvas, dpr=window.devicePixelRatio||1;
    const W=Math.max(2,Math.round(c.clientWidth*dpr)), H=Math.max(2,Math.round(c.clientHeight*dpr));
    if(c.width!==W||c.height!==H){ c.width=W; c.height=H; }
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
    else { fx=W/2 - this.view.cx*fw; fy=H/2 - (1-this.view.cy)*fh; }
    const ix=fx+b.l*sw*scale, iy=fy+b.b*sh*scale, iw=sw*scale, ih=sh*scale;
    const u0=Math.max(0,(0-ix)/iw), u1=Math.min(1,(W-ix)/iw);
    const vt0=Math.max(0,(iy+ih-H)/ih), vt1=Math.min(1,(iy+ih-0)/ih);
    return {W,H,dpr,scale,fx,fy,fw,fh,ix,iy,iw,ih,win:[u0,vt0,u1,vt1],b};
  },

  // ---------------------------------------------------------------- render
  render(opts={}){
    const gl=this.gl; const p=opts.params||this.p; const L=opts.layout||this.layout(p);
    const target=opts.target||null;
    if(!this.src){ gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,L.W,L.H); gl.clearColor(.07,.07,.07,1); gl.clear(gl.COLOR_BUFFER_BIT); return L; }
    const st=this.stock(p.stock), paper=this.paperFor(p);
    const lut=this.luts[paper.lut]; if(!lut){ this.lut(paper.lut).then(()=>{this.dirty=true;}); }
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
    gl.uniform1f(u.uDispRef,s.dispRef?1:0); gl.uniform1f(u.uHL,p.hlExpand*0.85);
    gl.uniformMatrix3fv(u.uWB,true,new Float32Array(CM.wbMatrix(p.temp,p.tint)));
    gl.uniformMatrix3fv(u.uToAP1,true,new Float32Array(CM.REC709_TO_AP1));
    const auto = p.autoExp && s.key ? Math.min(16,Math.max(1/16, 0.18*0.62/s.key)) : 1;
    gl.uniform1f(u.uK, auto*Math.pow(2,p.ev));
    const F=FORMATS[p.format]||FORMATS['35mm'];
    const [ow,oh]=this.dims(p,s,full);
    gl.uniform1f(u.uFalloff,p.falloff); gl.uniform1f(u.uAspect,ow/oh);
    gl.uniform1f(u.uTanHalfDiag, F.diag/2/(F.diag*1.15));
    GLU.drawQuad();
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
    const halAmt = ahAmt*p.halation;
    if(halAmt>0.001) blurChain(R.ha,R.hb,1.6,0.006);
    if(p.glow>0.001) blurChain(R.ga,R.gb,0.0,0.03);
    gl.useProgram(this.P.final.p); u=this.P.final.u;
    if(target){ gl.bindFramebuffer(gl.FRAMEBUFFER,target.f); gl.viewport(0,0,target.w,target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,L.W,L.H); }
    const bind=(unit,type,tex,name)=>{ gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(type,tex); gl.uniform1i(u[name],unit); };
    bind(0,gl.TEXTURE_2D,R.prep.t,'uPrep'); bind(1,gl.TEXTURE_2D,R.ha.t,'uHal'); bind(2,gl.TEXTURE_2D,R.ga.t,'uGlowTex');
    bind(3,gl.TEXTURE_3D,lut||null,'uLut'); bind(4,gl.TEXTURE_2D,s.tex,'uSrc'); bind(5,gl.TEXTURE_2D,opts.borderTex||this.borderTex,'uBorder');
    bind(6,gl.TEXTURE_2D,this.curveLUT(p),'uCurve');
    gl.uniform2f(u.uRes, target?target.w:L.W, target?target.h:L.H);
    gl.uniform4f(u.uFrame,L.fx,L.fy,L.fw,L.fh); gl.uniform4f(u.uImg,L.ix,L.iy,L.iw,L.ih); gl.uniform4f(u.uWin,u0,v0,u1,v1);
    gl.uniformMatrix3fv(u.uGeo,true,geo);
    gl.uniform1f(u.uHasLut,lut?1:0); gl.uniform1f(u.uN,this.manifest.lutSize); gl.uniform2f(u.uShaper,this.manifest.shaper.lo,this.manifest.shaper.hi);
    gl.uniform1f(u.uHalAmt, halAmt>0.001?halAmt:0); gl.uniform1f(u.uGlow,p.glow);
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
    const fullCell = Math.max(gw,gh)/(1400/F.gauge)*(0.75+pgi/120)*p.grainSize;
    const cellOut = fullCell*L.scale;
    gl.uniform1f(u.uGrain, p.grain*baseAmt*Math.min(1,cellOut));
    gl.uniform1f(u.uGrainCell, Math.max(1.0,cellOut)); gl.uniform1f(u.uGrainSoft,p.grainRough);
    gl.uniform1i(u.uMono, st.type==='bw'?1:0); gl.uniform1ui(u.uSeed,this.grainSeed);
    gl.uniform1f(u.uClip,this.showClip&&!target?1:0); gl.uniform3f(u.uBg,.071,.071,.071);
    gl.uniform1f(u.uBorderOn, (p.border!=='none'&&!full)?1:0);
    const wantP3 = opts.p3!=null ? opts.p3 : (target ? false : this.outP3);
    gl.uniform1f(u.uToSRGB, (this.manifest.output==='p3' && !wantP3)?1:0);
    gl.uniform1f(u.uSrcToP3, wantP3?1:0);
    GLU.drawQuad();
    return L;
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
uniform mat3 uWB,uToAP1,uGeo;
in vec2 vUv; out vec4 o;
vec3 dec(vec3 c){ return mix(c/12.92, pow((c+.055)/1.055,vec3(2.4)), step(.04045,c)); }
void main(){
  float u=mix(uWin.x,uWin.z,vUv.x), vt=mix(uWin.y,uWin.w,1.-vUv.y);
  vec2 s=(uGeo*vec3(u,vt,1.)).xy;
  if(s.x<0.||s.y<0.||s.x>1.||s.y>1.){ o=vec4(0.,0.,0.,1.); return; }
  vec3 c=texture(uSrc,vec2(s.x, uFlip>.5 ? 1.-s.y : s.y)).rgb;
  if(uEncoded>.5) c=dec(max(c,0.));
  if(uDispRef>.5){
    float Y=dot(c,vec3(.2126,.7152,.0722)); float yc=min(Y,1.);
    float Ye = Y<=1. ? Y/(1.-uHL*yc*yc) : Y/(1.-uHL);
    c*= Ye/max(Y,1e-6);
  }
  c = uWB*c*uK;
  vec2 q=(vec2(u,vt)*2.-1.)*vec2(uAspect,1.)/length(vec2(uAspect,1.));
  float t=length(q)*uTanHalfDiag*1.6; float c2=1./(1.+t*t);
  c*=mix(1.,c2*c2,uFalloff);
  o=vec4(uToAP1*c,1.);
}`;
const BRIGHT_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform float uThr; in vec2 vUv; out vec4 o;
void main(){ vec3 c=max(texture(uTex,vUv).rgb,0.); float Y=dot(c,vec3(.27,.67,.06));
  float k = uThr>0. ? smoothstep(uThr,uThr*2.5,Y) : 1.; o=vec4(min(c*k,vec3(40.)),1.); }`;
const BLUR_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uDir; in vec2 vUv; out vec4 o;
void main(){ vec3 s=vec3(0.); float w=0.; for(int i=-12;i<=12;i++){ float f=float(i); float k=exp(-f*f/60.); s+=texture(uTex,vUv+uDir*f).rgb*k; w+=k; } o=vec4(s/w,1.); }`;
const FINAL_FS = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler2D uPrep,uHal,uGlowTex,uSrc,uBorder,uCurve; uniform sampler3D uLut;
uniform vec2 uRes,uShaper; uniform vec4 uFrame,uImg,uWin; uniform vec3 uBg; uniform mat3 uGeo;
uniform float uHasLut,uN,uHalAmt,uGlow,uBefore,uFlip,uEncoded,uContrast,uHighlights,uShadows,uWhites,uBlacks,uVibrance,uSat;
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
      if(uHalAmt>0.){ vec3 h=texture(uHal,puv).rgb; float hy=dot(h,vec3(.3,.6,.1)); E += hy*vec3(1.,.12,.02)*uHalAmt; }
      if(uGlow>0.){ vec3 g=texture(uGlowTex,puv).rgb; E = mix(E, E*.75+g*.5, uGlow*.6); }
      vec3 c;
      if(uHasLut>.5){
        vec3 x=clamp((log2(max(E,vec3(1e-12))/.18)+uShaper.x)/(uShaper.x+uShaper.y),0.,1.);
        c=texture(uLut, x*(uN-1.)/uN + .5/uN).rgb;
      } else c=enc(R709_TO_P3*(AP1_TO_709*E/(1.+AP1_TO_709*E)));
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
      if(uGrain>0.){
        vec2 ip=vec2(u,vt)*uImg.zw/uGrainCell;
        float k=uGrain*1.7; float yy=luma(c);
        float lum=grainField(ip,1.-yy,1u);
        if(uMono==1) c-=lum*k;
        else { vec3 ch=vec3(emulsion(ip*.8,1.-c.r,.44,11u),emulsion(ip*.8+5.1,1.-c.g,.44,12u),emulsion(ip*.8+9.7,1.-c.b,.44,13u));
               c-=(lum*.8+ch*.3)*k; }
      }
      col=clamp(c,0.,1.);
      if(uToSRGB>.5) col=clamp(enc(P3_TO_709*dec(col)),0.,1.);
      if(uClip>.5){ if(max(col.r,max(col.g,col.b))>.996) col=vec3(1.,.15,.1); else if(min(col.r,min(col.g,col.b))<.004) col=vec3(.15,.45,1.); }
    }
  }
  col = mix(col, bd.rgb, bd.a);
  o=vec4(col,1.);
}`;
