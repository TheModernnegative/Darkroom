// Small WebGL2 helpers + colour math.
const GLU = {
  init(canvas){
    const gl = canvas.getContext('webgl2', {antialias:false, premultipliedAlpha:false, preserveDrawingBuffer:false, alpha:false});
    if(!gl) throw new Error('WebGL2 not available');
    gl.getExtension('EXT_color_buffer_float'); gl.getExtension('EXT_color_buffer_half_float'); gl.getExtension('OES_texture_float_linear');
    GLU.gl = gl; GLU.floatRT = !!gl.getExtension('EXT_color_buffer_float');
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,1,1,-1,1]), gl.STATIC_DRAW);
    GLU.quadVAO = gl.createVertexArray(); gl.bindVertexArray(GLU.quadVAO);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.bindVertexArray(null);
    return gl;
  },
  shader(type, src){ const gl=GLU.gl, s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ const log=gl.getShaderInfoLog(s); console.error(src.split('\n').map((l,i)=>(i+1)+': '+l).join('\n')); throw new Error(log); } return s; },
  program(vs, fs, attribs){ const gl=GLU.gl, p=gl.createProgram();
    gl.attachShader(p,GLU.shader(gl.VERTEX_SHADER,vs)); gl.attachShader(p,GLU.shader(gl.FRAGMENT_SHADER,fs));
    (attribs||['aP']).forEach((a,i)=>gl.bindAttribLocation(p,i,a));
    gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u={}; const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS); for(let i=0;i<n;i++){ const nm=gl.getActiveUniform(p,i).name.replace(/\[0\]$/,''); u[nm]=gl.getUniformLocation(p,nm); }
    return {p,u}; },
  QUAD_VS: `#version 300 es
layout(location=0) in vec2 aP; out vec2 vUv; void main(){ vUv=aP*.5+.5; gl_Position=vec4(aP,0.,1.); }`,
  tex2D(w,h,fmt='rgba16f',data=null,filter='linear'){
    const gl=GLU.gl, t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    const F={ rgba16f:[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT], rgba8:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE], srgba8:[gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE], rgba32f:[gl.RGBA32F,gl.RGBA,gl.FLOAT] }[fmt];
    let f=F; if(fmt==='rgba16f' && !GLU.floatRT && !data) f=[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE];
    gl.texImage2D(gl.TEXTURE_2D,0,f[0],w,h,0,f[1],f[2],data);
    const fl = filter==='nearest'?gl.NEAREST:gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,fl); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,fl);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t; },
  target(w,h,fmt='rgba16f'){ const gl=GLU.gl, t=GLU.tex2D(w,h,fmt); const f=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    return {t,f,w,h,fmt}; },
  free(rt){ if(!rt) return; const gl=GLU.gl; gl.deleteTexture(rt.t); gl.deleteFramebuffer(rt.f); },
  ensure(rt,w,h,fmt='rgba16f'){ if(rt && rt.w===w && rt.h===h && rt.fmt===fmt) return rt; GLU.free(rt); return GLU.target(w,h,fmt); },
  drawQuad(){ const gl=GLU.gl; gl.bindVertexArray(GLU.quadVAO); gl.drawArrays(gl.TRIANGLE_FAN,0,4); gl.bindVertexArray(null); },
};

// ---------------------------------------------------------------- colour math
const CM = {
  mul(a,b){ const o=new Array(9); for(let r=0;r<3;r++)for(let c=0;c<3;c++){ o[r*3+c]=a[r*3]*b[c]+a[r*3+1]*b[3+c]+a[r*3+2]*b[6+c]; } return o; },
  inv(m){ const [a,b,c,d,e,f,g,h,i]=m; const A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g; const det=a*A+b*B+c*C;
    return [A/det,-(b*i-c*h)/det,(b*f-c*e)/det, B/det,(a*i-c*g)/det,-(a*f-c*d)/det, C/det,-(a*h-b*g)/det,(a*e-b*d)/det]; },
  vec(m,v){ return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]; },
  // row-major 3x3s
  SRGB_TO_XYZ:[0.4124564,0.3575761,0.1804375, 0.2126729,0.7151522,0.0721750, 0.0193339,0.1191920,0.9503041],
  P3_TO_XYZ:[0.4865709,0.2656677,0.1982173, 0.2289746,0.6917385,0.0792869, 0.0000000,0.0451134,1.0439444],
  REC709_TO_AP1:[0.6130974,0.3395231,0.0473795, 0.0701937,0.9163538,0.0134525, 0.0206156,0.1095698,0.8698146],
  BRADFORD:[0.8951,0.2664,-0.1614, -0.7502,1.7135,0.0367, 0.0389,-0.0685,1.0296],
  cctToXY(T){ // CIE daylight locus (4000–25000K), Kim et al. Planckian below
    T=Math.max(1700,Math.min(25000,T));
    if(T>=4000){ const x = T<=7000 ? -4.6070e9/T**3+2.9678e6/T**2+0.09911e3/T+0.244063 : -2.0064e9/T**3+1.9018e6/T**2+0.24748e3/T+0.237040;
      return [x, -3*x*x+2.87*x-0.275]; }
    const x = -0.2661239e9/T**3-0.2343589e6/T**2+0.8776956e3/T+0.179910;
    const y = T<2222 ? -1.1063814*x**3-1.34811020*x**2+2.18555832*x-0.20219683 : -0.9549476*x**3-1.37418593*x**2+2.09137015*x-0.16748867;
    return [x,y]; },
  // white-balance matrix (linear Rec.709 → linear Rec.709): assume scene lit by (T,tint), adapt to D65
  wbMatrix(temp, tint){
    // temp, tint in [-100,100]; 0,0 = identity
    const mired = 1e6/6504 - temp*1.1;           // + temp = warmer result (assumed illuminant bluer)
    const T = 1e6/Math.max(mired, 20);
    let [x,y] = CM.cctToXY(T);
    const [x0,y0] = CM.cctToXY(6504); x += 0.3127-x0; y += 0.3290-y0;   // anchor 0 to exact D65
    // tint: move along the perpendicular to the locus in uv (green -, magenta +)
    const den = -2*x+12*y+3; let u=4*x/den, v=6*y/den; v -= tint*0.00035*-1; // + tint = magenta result
    const d2 = 2*u-8*v+4; x = 3*u/d2; y = 2*v/d2;
    const Ws=[x/y,1,(1-x-y)/y], Wd=[0.3127/0.3290,1,(1-0.3127-0.3290)/0.3290];
    const B=CM.BRADFORD, Bi=CM.inv(B), s=CM.vec(B,Ws), d=CM.vec(B,Wd);
    const D=[d[0]/s[0],0,0, 0,d[1]/s[1],0, 0,0,d[2]/s[2]];
    const A=CM.mul(Bi,CM.mul(D,B)); const X=CM.SRGB_TO_XYZ, Xi=CM.inv(X);
    return CM.mul(Xi,CM.mul(A,X)); },
  half2float: (()=>{ const t=new Float32Array(65536); for(let h=0;h<65536;h++){ const s=(h&0x8000)?-1:1, e=(h>>10)&31, m=h&1023;
    t[h]= e===0 ? s*m*5.960464477539063e-8 : e===31 ? (m?NaN:s*Infinity) : s*Math.pow(2,e-15)*(1+m/1024); } return t; })(),
};
