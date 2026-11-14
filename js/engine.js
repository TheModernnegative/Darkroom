// Develop engine: source → (WB, exposure, lens) → halation/glow → film LUT → tone → grain → frame.
const DEFAULTS = {
  stock:'kodak_portra_400', paper:null, format:'35mm', autoExp:true, ev:0, temp:0, tint:0, hlExpand:0.55,
  contrast:0, highlights:0, shadows:0, whites:0, blacks:0, vibrance:0, saturation:0,
  grain:1, grainSize:1, grainRough:0.35, halation:1, glow:0, falloff:0.35, border:'none',
};
const FORMATS = { '35mm':{gauge:2.4,diag:43.3,label:'35mm'}, '645':{gauge:1.6,diag:69.8,label:'6×4.5'}, '6x7':{gauge:1.35,diag:89.6,label:'6×7'}, '4x5':{gauge:1.0,diag:162.6,label:'4×5'} };

const Engine = {
  manifest:null, luts:{}, src:null, p:Object.assign({},DEFAULTS), before:false, showClip:false,
  view:{mode:'fit', cx:.5, cy:.5}, RT:{}, dirty:true, hoverParams:null, histDirty:true,

  init(canvas){
    this.canvas=canvas; const gl=GLU.init(canvas); this.gl=gl;
    this.P = {
      prep: GLU.program(GLU.QUAD_VS, PREP_FS),
      bright: GLU.program(GLU.QUAD_VS, BRIGHT_FS),
      blur: GLU.program(GLU.QUAD_VS, BLUR_FS),
      final: GLU.program(GLU.QUAD_VS, FINAL_FS),
    };
    this.borderTex = GLU.tex2D(1,1,'rgba8',new Uint8Array([0,0,0,0]));
    this.blackTex = GLU.tex2D(1,1,'rgba8',new Uint8Array([0,0,0,255]));
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
    if(!buf || buf.byteLength!==N*N*N*6){   // hosted builds ship LUTs as base64 JSON
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

  // ---------------------------------------------------------------- sources
  // src: {tex, w, h, dispRef, encoded(bool: values are sRGB-encoded), flipY, key}
  setSource(src){ this.src=src; this.dirty=true; this.histDirty=true; },

  // auto exposure key from linear luminance samples (center weighted log-average)
  keyFromSamples(lum, w, h){
    let s=0, ws=0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const Y=lum[y*w+x]; if(!(Y>=0)) continue;
      const dx=(x/w-.5)/.35, dy=(y/h-.5)/.35, wt=Math.exp(-(dx*dx+dy*dy)); s+=wt*Math.log(Math.max(Y,1e-5)); ws+=wt; }
    return Math.exp(s/ws);
  },

  // ---------------------------------------------------------------- geometry
  layout(){
    const c=this.canvas, dpr=window.devicePixelRatio||1;
    const W=Math.max(2,Math.round(c.clientWidth*dpr)), H=Math.max(2,Math.round(c.clientHeight*dpr));
    if(c.width!==W||c.height!==H){ c.width=W; c.height=H; }
    if(!this.src) return {W,H,dpr};
    const b=Borders.margins(this.p.border, this.src.w, this.src.h);   // fractions of image w/h
    const fw0=this.src.w*(1+b.l+b.r), fh0=this.src.h*(1+b.t+b.b);
    let scale;
    if(this.view.mode==='fit'){ const pad=(this.pad??28)*dpr; scale=Math.min((W-2*pad)/fw0,(H-2*pad)/fh0); }
    else scale=this.view.zoom||1;
    const fw=fw0*scale, fh=fh0*scale;
    let fx, fy;
    if(this.view.mode==='fit'){ fx=(W-fw)/2; fy=(H-fh)/2; }
    else { fx=W/2 - this.view.cx*fw; fy=H/2 - (1-this.view.cy)*fh; }
    const ix=fx+b.l*this.src.w*scale, iy=fy+b.b*this.src.h*scale, iw=this.src.w*scale, ih=this.src.h*scale;
    // visible window of the image (uv, v from top)
    const u0=Math.max(0,(0-ix)/iw), u1=Math.min(1,(W-ix)/iw);
    const vt0=Math.max(0,(iy+ih-H)/ih), vt1=Math.min(1,(iy+ih-0)/ih);
    return {W,H,dpr,scale,fx,fy,fw,fh,ix,iy,iw,ih,win:[u0,vt0,u1,vt1],b};
  },

  // ---------------------------------------------------------------- render
  render(opts={}){
    const gl=this.gl; const L=opts.layout||this.layout();
    const target=opts.target||null;           // {f,w,h} offscreen; null = canvas
    const p=opts.params||this.p;
    if(!this.src){ gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,L.W,L.H); gl.clearColor(.07,.07,.07,1); gl.clear(gl.COLOR_BUFFER_BIT); return L; }
    const st=this.stock(opts.stockOverride||p.stock), paper=this.paperFor(Object.assign({},p,{stock:st.id}));
    const lut=this.luts[paper.lut]; if(!lut){ this.lut(paper.lut).then(()=>{this.dirty=true;}); }
    const [u0,v0,u1,v1]=L.win;
    const vw=Math.max(1,Math.round((u1-u0)*L.iw)), vh=Math.max(1,Math.round((v1-v0)*L.ih));
    if(vw<1||vh<1) return L;
    const R=opts.RT||this.RT;
    R.prep=GLU.ensure(R.prep,vw,vh,'rgba16f');
    const qw=Math.max(8,vw>>2), qh=Math.max(8,vh>>2);
    R.ha=GLU.ensure(R.ha,qw,qh); R.hb=GLU.ensure(R.hb,qw,qh); R.ga=GLU.ensure(R.ga,qw,qh); R.gb=GLU.ensure(R.gb,qw,qh);
    const s=this.src;
    // ---- 1. prep (linear AP1 film exposure)
    let u;
    gl.useProgram(this.P.prep.p); u=this.P.prep.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER,R.prep.f); gl.viewport(0,0,vw,vh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,s.tex); gl.uniform1i(u.uSrc,0);
    gl.uniform4f(u.uWin,u0,v0,u1,v1); gl.uniform1f(u.uFlip,s.flipY?1:0); gl.uniform1f(u.uEncoded,s.encoded?1:0);
    gl.uniform1f(u.uDispRef,s.dispRef?1:0); gl.uniform1f(u.uHL,p.hlExpand*0.85);
    gl.uniformMatrix3fv(u.uWB,true,new Float32Array(CM.wbMatrix(p.temp,p.tint)));
    gl.uniformMatrix3fv(u.uToAP1,true,new Float32Array(CM.REC709_TO_AP1));
    const auto = p.autoExp && s.key ? Math.min(16,Math.max(1/16, 0.18*0.62/s.key)) : 1;
    gl.uniform1f(u.uK, auto*Math.pow(2,p.ev));
    const F=FORMATS[p.format]||FORMATS['35mm'];
    gl.uniform1f(u.uFalloff,p.falloff); gl.uniform1f(u.uAspect,s.w/s.h);
    gl.uniform1f(u.uTanHalfDiag, F.diag/2/(F.diag*1.15));   // ~normal lens: half-diagonal angle ≈ 23°
    GLU.drawQuad();
    // ---- 2. halation (bright → red-weighted wide blur) and glow (whole-image bloom)
    const imgPx = Math.max(L.iw,L.ih);                       // image size in output px
    const blurChain=(a,b,thr,radiusFrac)=>{
      gl.useProgram(this.P.bright.p); u=this.P.bright.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER,a.f); gl.viewport(0,0,qw,qh);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,R.prep.t); gl.uniform1i(u.uTex,0); gl.uniform1f(u.uThr,thr);
      GLU.drawQuad();
      gl.useProgram(this.P.blur.p); u=this.P.blur.u; gl.uniform1i(u.uTex,0);
      const rpx = radiusFrac*imgPx/4;                         // radius in quarter-res px
      for(const k of [0.35,1.0]){ const step=Math.max(0.5,rpx*k/12);
        gl.bindFramebuffer(gl.FRAMEBUFFER,b.f); gl.bindTexture(gl.TEXTURE_2D,a.t); gl.uniform2f(u.uDir,step/qw,0); GLU.drawQuad();
        gl.bindFramebuffer(gl.FRAMEBUFFER,a.f); gl.bindTexture(gl.TEXTURE_2D,b.t); gl.uniform2f(u.uDir,0,step/qh); GLU.drawQuad(); }
    };
    const ahAmt = {strong:0.18, weak:0.5, none:1.6}[st.antihalation] ?? 0.3;
    const halAmt = ahAmt*p.halation;
    if(halAmt>0.001) blurChain(R.ha,R.hb,1.0,0.012);
    if(p.glow>0.001) blurChain(R.ga,R.gb,0.0,0.03);
    // ---- 3. film + tone + grain + frame
    gl.useProgram(this.P.final.p); u=this.P.final.u;
    if(target){ gl.bindFramebuffer(gl.FRAMEBUFFER,target.f); gl.viewport(0,0,target.w,target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,L.W,L.H); }
    const bind=(unit,type,tex,name)=>{ gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(type,tex); gl.uniform1i(u[name],unit); };
    bind(0,gl.TEXTURE_2D,R.prep.t,'uPrep'); bind(1,gl.TEXTURE_2D,R.ha.t,'uHal'); bind(2,gl.TEXTURE_2D,R.ga.t,'uGlowTex');
    bind(3,gl.TEXTURE_3D,lut||null,'uLut'); bind(4,gl.TEXTURE_2D,s.tex,'uSrc'); bind(5,gl.TEXTURE_2D,opts.borderTex||this.borderTex,'uBorder');
    gl.uniform2f(u.uRes, target?target.w:L.W, target?target.h:L.H);
    gl.uniform4f(u.uFrame,L.fx,L.fy,L.fw,L.fh); gl.uniform4f(u.uImg,L.ix,L.iy,L.iw,L.ih); gl.uniform4f(u.uWin,u0,v0,u1,v1);
    gl.uniform1f(u.uHasLut,lut?1:0); gl.uniform1f(u.uN,this.manifest.lutSize); gl.uniform2f(u.uShaper,this.manifest.shaper.lo,this.manifest.shaper.hi);
    gl.uniform1f(u.uHalAmt, halAmt>0.001?halAmt:0); gl.uniform1f(u.uGlow,p.glow);
    gl.uniform1f(u.uBefore,(this.before&&!opts.forceAfter)?1:0); gl.uniform1f(u.uFlip,s.flipY?1:0); gl.uniform1f(u.uEncoded,s.encoded?1:0);
    gl.uniform1f(u.uContrast,p.contrast/100); gl.uniform1f(u.uHighlights,p.highlights/100); gl.uniform1f(u.uShadows,p.shadows/100);
    gl.uniform1f(u.uWhites,p.whites/100); gl.uniform1f(u.uBlacks,p.blacks/100); gl.uniform1f(u.uVibrance,p.vibrance/100); gl.uniform1f(u.uSat,p.saturation/100);
    // grain: stock print-grain-index → amount; film gauge → crystal size relative to the frame
    const pgi=st.pgi||35; const baseAmt=Math.max(0.012,(pgi-14)/40)*0.055;
    const fullCell = Math.max(s.w,s.h)/ (1400/F.gauge) * (0.75+pgi/120) * p.grainSize;   // grain cell in source px
    const cellOut = fullCell*L.scale;                       // in output px
    gl.uniform1f(u.uGrain, p.grain*baseAmt*Math.min(1,cellOut));
    gl.uniform1f(u.uGrainCell, Math.max(1.0,cellOut)); gl.uniform1f(u.uGrainSoft,p.grainRough);
    gl.uniform1i(u.uMono, st.type==='bw'?1:0); gl.uniform1ui(u.uSeed,this.grainSeed);
    gl.uniform1f(u.uClip,this.showClip&&!target?1:0); gl.uniform3f(u.uBg,.071,.071,.071);
    gl.uniform1f(u.uBorderOn, p.border!=='none'?1:0);
    GLU.drawQuad();
    return L;
  },

  // histogram: render the frame region into a small target and read it back
  histogram(params){
    if(!this.src) return null;
    const gl=this.gl, L=this.layout();
    const hw=192, hh=Math.max(32,Math.round(hw*L.ih/L.iw));
    this.RT.hist=GLU.ensure(this.RT.hist,hw,hh,'rgba8');
    // whole image (not the border) into a small target
    const s=hw/L.iw; const LL={W:hw,H:hh,dpr:1,fx:0,fy:0,fw:hw,fh:hh,ix:0,iy:0,iw:hw,ih:hh,scale:L.scale*s,win:[0,0,1,1],b:{l:0,r:0,t:0,b:0}};
    const keepClip=this.showClip; this.showClip=false;
    this.render({layout:LL,target:this.RT.hist,RT:this.histRT||(this.histRT={}),params:Object.assign({},params||this.p,{border:'none'})});
    this.showClip=keepClip;
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
uniform mat3 uWB,uToAP1;
in vec2 vUv; out vec4 o;
vec3 dec(vec3 c){ return mix(c/12.92, pow((c+.055)/1.055,vec3(2.4)), step(.04045,c)); }
void main(){
  float u=mix(uWin.x,uWin.z,vUv.x), vt=mix(uWin.y,uWin.w,1.-vUv.y);
  vec3 c=texture(uSrc,vec2(u, uFlip>.5 ? 1.-vt : vt)).rgb;
  if(uEncoded>.5) c=dec(max(c,0.));
  if(uDispRef>.5){            // display-referred (phone JPEG/HEIC, scans): re-open the highlights
    float Y=dot(c,vec3(.2126,.7152,.0722));
    float yc=min(Y,1.);
    float Ye = Y<=1. ? Y/(1.-uHL*yc*yc) : Y/(1.-uHL);
    c*= Ye/max(Y,1e-6);
  }
  c = uWB*c*uK;
  // natural (cos^4) lens falloff, on exposure — it travels through the film curve like the real thing
  vec2 q=(vec2(u,vt)*2.-1.)*vec2(uAspect,1.)/length(vec2(uAspect,1.));
  float t=length(q)*uTanHalfDiag*1.6; float c2=1./(1.+t*t);
  c*=mix(1.,c2*c2,uFalloff);
  o=vec4(uToAP1*c,1.);
}`;
const BRIGHT_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform float uThr; in vec2 vUv; out vec4 o;
void main(){ vec3 c=max(texture(uTex,vUv).rgb,0.); float Y=dot(c,vec3(.27,.67,.06));
  float k = uThr>0. ? smoothstep(uThr,uThr*3.,Y) : 1.; o=vec4(min(c*k,vec3(40.)),1.); }`;
const BLUR_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uDir; in vec2 vUv; out vec4 o;
void main(){ vec3 s=vec3(0.); float w=0.; for(int i=-12;i<=12;i++){ float f=float(i); float k=exp(-f*f/60.); s+=texture(uTex,vUv+uDir*f).rgb*k; w+=k; } o=vec4(s/w,1.); }`;
const FINAL_FS = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler2D uPrep,uHal,uGlowTex,uSrc,uBorder; uniform sampler3D uLut;
uniform vec2 uRes,uShaper; uniform vec4 uFrame,uImg,uWin; uniform vec3 uBg;
uniform float uHasLut,uN,uHalAmt,uGlow,uBefore,uFlip,uEncoded,uContrast,uHighlights,uShadows,uWhites,uBlacks,uVibrance,uSat;
uniform float uGrain,uGrainCell,uGrainSoft,uClip,uBorderOn; uniform int uMono; uniform uint uSeed;
out vec4 o;
vec3 enc(vec3 c){ c=max(c,0.); return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-.055, step(.0031308,c)); }
vec3 dec(vec3 c){ return mix(c/12.92, pow((c+.055)/1.055,vec3(2.4)), step(.04045,c)); }
const mat3 AP1_TO_709 = mat3(1.7050510,-0.1302564,-0.0240034, -0.6217921,1.1408047,-0.1289690, -0.0832589,-0.0105483,1.1529724);
// ---- grain: Boolean-model emulsion (Newson et al.) — clumps of log-normal silver crystals
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
float luma(vec3 c){ return dot(c,vec3(.2126,.7152,.0722)); }
void main(){
  vec2 px=gl_FragCoord.xy;
  vec2 fuv=(px-uFrame.xy)/uFrame.zw;                     // frame uv (y up)
  if(fuv.x<0.||fuv.y<0.||fuv.x>1.||fuv.y>1.){ o=vec4(uBg,1.); return; }
  vec2 iuv=(px-uImg.xy)/uImg.zw;                         // image uv (y up)
  vec4 bd = uBorderOn>.5 ? texture(uBorder,vec2(fuv.x,1.-fuv.y)) : vec4(0.);
  vec3 col=vec3(0.);
  bool inImg = iuv.x>=0.&&iuv.y>=0.&&iuv.x<=1.&&iuv.y<=1.;
  if(inImg && bd.a<.999){
    float u=iuv.x, vt=1.-iuv.y;
    if(uBefore>.5){
      vec3 c=texture(uSrc,vec2(u, uFlip>.5?1.-vt:vt)).rgb;
      col = uEncoded>.5 ? c : enc(c);
    } else {
      vec2 puv=vec2((u-uWin.x)/(uWin.z-uWin.x), 1.-(vt-uWin.y)/(uWin.w-uWin.y));
      vec3 E=texture(uPrep,puv).rgb;
      if(uHalAmt>0.){ vec3 h=texture(uHal,puv).rgb; float hy=dot(h,vec3(.3,.6,.1)); E += hy*vec3(1.,.22,.04)*uHalAmt; }
      if(uGlow>0.){ vec3 g=texture(uGlowTex,puv).rgb; E = mix(E, E*.75+g*.5, uGlow*.6); }
      vec3 c;
      if(uHasLut>.5){
        vec3 x=clamp((log2(max(E,vec3(1e-12))/.18)+uShaper.x)/(uShaper.x+uShaper.y),0.,1.);
        c=texture(uLut, x*(uN-1.)/uN + .5/uN).rgb;
      } else c=enc(AP1_TO_709*E/(1.+AP1_TO_709*E));
      // ---- Lightroom-style tone, in display space
      float y=luma(c);
      float hm=smoothstep(.35,1.,y), sm=1.-smoothstep(0.,.6,y);
      float dy = uHighlights*.32*hm*(uHighlights>0.?(1.-y):y) + uShadows*.38*sm*(uShadows>0.?(1.-y)*.9:y);
      float ny=clamp(y+dy,0.,1.);
      c *= ny/max(y,1e-4); y=ny;
      // whites / blacks (end points)
      float lo=-uBlacks*.07, hi=1.+uWhites*.12;
      c = (c-lo*(1.-c))/max(1e-3,1.-lo); c = 1.-(1.-c)*(1.-(hi-1.)*c*c*1.4) ;
      // contrast: S-curve about mid-grey
      vec3 s=c*c*(3.-2.*c);
      c = uContrast>=0. ? mix(c,s,uContrast) : mix(c,.46+(c-.46)*.55,-uContrast);
      c=clamp(c,0.,1.);
      // colour
      y=luma(c); float sat=length(c-y)*1.6;
      if(uMono==0){ c = y+(c-y)*(1.+uSat); c = y+(c-y)*(1.+uVibrance*(1.-clamp(sat,0.,1.))); }
      c=clamp(c,0.,1.);
      // ---- grain (silver density follows the image, so it lives in the tones)
      if(uGrain>0.){
        vec2 ip=vec2(u,vt)*uImg.zw/uGrainCell;
        float k=uGrain*1.7; float yy=luma(c);
        float lum=grainField(ip,1.-yy,1u);
        if(uMono==1) c-=lum*k;
        else { vec3 ch=vec3(emulsion(ip*.8,1.-c.r,.44,11u),emulsion(ip*.8+5.1,1.-c.g,.44,12u),emulsion(ip*.8+9.7,1.-c.b,.44,13u));
               c-=(lum*.8+ch*.3)*k; }
      }
      col=clamp(c,0.,1.);
      if(uClip>.5){ if(max(col.r,max(col.g,col.b))>.996) col=vec3(1.,.15,.1); else if(min(col.r,min(col.g,col.b))<.004) col=vec3(.15,.45,1.); }
    }
  }
  col = mix(col, bd.rgb, bd.a);
  o=vec4(col,1.);
}`;
