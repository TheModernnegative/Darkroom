// 3D scan (Gaussian splat) renderer: thin-lens depth of field, renders into an offscreen
// target that the develop engine treats as a display-referred source.
// ============================================================ math
const M4 = {
  persp(fovy, aspect, near, far){const f=1/Math.tan(fovy/2),nf=1/(near-far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);},
  lookAt(e,t,u){let zx=e[0]-t[0],zy=e[1]-t[1],zz=e[2]-t[2];let l=Math.hypot(zx,zy,zz);zx/=l;zy/=l;zz/=l;
    let xx=u[1]*zz-u[2]*zy,xy=u[2]*zx-u[0]*zz,xz=u[0]*zy-u[1]*zx;l=Math.hypot(xx,xy,xz);xx/=l;xy/=l;xz/=l;
    const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
    return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
      -(xx*e[0]+xy*e[1]+xz*e[2]),-(yx*e[0]+yy*e[1]+yz*e[2]),-(zx*e[0]+zy*e[1]+zz*e[2]),1]);},
  mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
};
const MODELS = { // scene "up" fixes, baked as model rotation
  'Y-up':  [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  'Y-down':[1,0,0,0, 0,-1,0,0, 0,0,-1,0, 0,0,0,1],
  'Z-up':  [1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1],
};

// ============================================================ splat data
// Internal representation: n, pos Float32(3n), rgba Uint8(4n), cov Float32(6n) [xx,xy,xz,yy,yz,zz]
function covFromScaleRot(sx,sy,sz,qw,qx,qy,qz,out,o){
  const l=Math.hypot(qw,qx,qy,qz)||1;qw/=l;qx/=l;qy/=l;qz/=l;
  const r00=1-2*(qy*qy+qz*qz),r01=2*(qx*qy-qw*qz),r02=2*(qx*qz+qw*qy),
        r10=2*(qx*qy+qw*qz),r11=1-2*(qx*qx+qz*qz),r12=2*(qy*qz-qw*qx),
        r20=2*(qx*qz-qw*qy),r21=2*(qy*qz+qw*qx),r22=1-2*(qx*qx+qy*qy);
  const a00=r00*sx,a01=r01*sy,a02=r02*sz,a10=r10*sx,a11=r11*sy,a12=r12*sz,a20=r20*sx,a21=r21*sy,a22=r22*sz;
  out[o]=a00*a00+a01*a01+a02*a02; out[o+1]=a00*a10+a01*a11+a02*a12; out[o+2]=a00*a20+a01*a21+a02*a22;
  out[o+3]=a10*a10+a11*a11+a12*a12; out[o+4]=a10*a20+a11*a21+a12*a22; out[o+5]=a20*a20+a21*a21+a22*a22;
}

function parsePLY(buf){
  const bytes=new Uint8Array(buf);
  const headEnd=(()=>{const s=new TextDecoder().decode(bytes.subarray(0,Math.min(bytes.length,20000)));const i=s.indexOf('end_header');if(i<0)throw new Error('Not a PLY file');return {txt:s.slice(0,i),off:s.indexOf('\n',i)+1};})();
  const lines=headEnd.txt.split(/\r?\n/);
  if(!/binary_little_endian/.test(headEnd.txt)) throw new Error('Only binary little-endian PLY is supported');
  if(/element chunk/.test(headEnd.txt)) throw new Error('This is a compressed PLY (SuperSplat). Export a standard PLY instead');
  let n=0,inVertex=false;const props=[];const size={char:1,uchar:1,int8:1,uint8:1,short:2,ushort:2,int16:2,uint16:2,int:4,uint:4,int32:4,uint32:4,float:4,float32:4,double:8,float64:8};
  for(const L of lines){const t=L.trim().split(/\s+/);
    if(t[0]==='element'){inVertex=t[1]==='vertex';if(inVertex)n=+t[2];}
    else if(t[0]==='property'&&inVertex){props.push({type:t[1],name:t[2]});}}
  let stride=0;const off={};for(const p of props){off[p.name]={o:stride,t:p.type};stride+=size[p.type];}
  const dv=new DataView(buf,headEnd.off);
  const rd=(name,i)=>{const p=off[name];const at=i*stride+p.o;switch(p.t){case 'float':case 'float32':return dv.getFloat32(at,true);case 'double':case 'float64':return dv.getFloat64(at,true);case 'uchar':case 'uint8':return dv.getUint8(at);default:return dv.getFloat32(at,true);}};
  const isSplat='scale_0' in off&&'rot_0' in off;
  const pos=new Float32Array(n*3),rgba=new Uint8Array(n*4),cov=new Float32Array(n*6);
  const C0=0.28209479177387814;
  // fast path for all-float splat PLYs
  const allFloat=props.every(p=>p.type==='float'||p.type==='float32');
  const f32=allFloat&&((headEnd.off%4)===0)?new Float32Array(buf,headEnd.off,n*stride/4):null;
  const S=stride/4,ix=off.x&&off.x.o/4,iy=off.y&&off.y.o/4,iz=off.z&&off.z.o/4;
  for(let i=0;i<n;i++){
    let x,y,z;
    if(f32){const b=i*S;x=f32[b+ix];y=f32[b+iy];z=f32[b+iz];}else{x=rd('x',i);y=rd('y',i);z=rd('z',i);}
    pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=z;
    if(isSplat){
      const g=f32?(nm=>f32[i*S+off[nm].o/4]):(nm=>rd(nm,i));
      const r=0.5+C0*g('f_dc_0'),gg=0.5+C0*g('f_dc_1'),bb=0.5+C0*g('f_dc_2');
      const a=1/(1+Math.exp(-g('opacity')));
      rgba[i*4]=Math.max(0,Math.min(255,r*255));rgba[i*4+1]=Math.max(0,Math.min(255,gg*255));rgba[i*4+2]=Math.max(0,Math.min(255,bb*255));rgba[i*4+3]=a*255;
      covFromScaleRot(Math.exp(g('scale_0')),Math.exp(g('scale_1')),Math.exp(g('scale_2')),g('rot_0'),g('rot_1'),g('rot_2'),g('rot_3'),cov,i*6);
    } else { // plain point cloud: small isotropic splats
      rgba[i*4]=off.red?rd('red',i):200;rgba[i*4+1]=off.green?rd('green',i):200;rgba[i*4+2]=off.blue?rd('blue',i):200;rgba[i*4+3]=255;
      cov[i*6]=cov[i*6+3]=cov[i*6+5]=1e-4;
    }
  }
  return {n,pos,rgba,cov,isPointCloud:!isSplat};
}
function parseSplat(buf){
  const n=Math.floor(buf.byteLength/32),f=new Float32Array(buf),u=new Uint8Array(buf);
  const pos=new Float32Array(n*3),rgba=new Uint8Array(n*4),cov=new Float32Array(n*6);
  for(let i=0;i<n;i++){pos[i*3]=f[i*8];pos[i*3+1]=f[i*8+1];pos[i*3+2]=f[i*8+2];
    rgba.set(u.subarray(i*32+24,i*32+28),i*4);
    covFromScaleRot(f[i*8+3],f[i*8+4],f[i*8+5],(u[i*32+28]-128)/128,(u[i*32+29]-128)/128,(u[i*32+30]-128)/128,(u[i*32+31]-128)/128,cov,i*6);}
  return {n,pos,rgba,cov};
}

// ============================================================ demo scene (procedural forest still life)
function demoScene(){
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  const hash=(x,y)=>{const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);};
  const vnoise=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    return (hash(xi,yi)*(1-u)+hash(xi+1,yi)*u)*(1-v)+(hash(xi,yi+1)*(1-u)+hash(xi+1,yi+1)*u)*v;};
  const fbm=(x,y)=>vnoise(x,y)*0.5+vnoise(x*2.1,y*2.1)*0.3+vnoise(x*4.3,y*4.3)*0.2;
  const P=[],C=[],V=[];
  const add=(x,y,z,sx,sy,sz,q,r,g,b,a)=>{P.push(x,y,z);C.push(r,g,b,a);const o=V.length;V.length+=6;covFromScaleRot(sx,sy,sz,q[0],q[1],q[2],q[3],V,o);};
  const qy=(t)=>[Math.cos(t/2),0,Math.sin(t/2),0];
  const qrand=()=>{const u1=rnd(),u2=rnd()*6.283,u3=rnd()*6.283;return [Math.sqrt(u1)*Math.cos(u3),Math.sqrt(1-u1)*Math.sin(u2),Math.sqrt(1-u1)*Math.cos(u2),Math.sqrt(u1)*Math.sin(u3)];};
  const qmul=(a,b)=>[a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
  const ground=(x,z)=>(fbm(x*0.35,z*0.35)-0.5)*0.35;
  const sun=[-0.35,0.55,-1].map(v=>v/Math.hypot(-0.35,0.55,-1));
  const dapple=(x,z)=>0.55+0.9*Math.pow(fbm(x*0.9+3,z*0.9-2),2.2);
  // leaf litter
  for(let i=0;i<150000;i++){
    const a=rnd()*6.283,rr=Math.sqrt(rnd())*9,x=Math.cos(a)*rr,z=Math.sin(a)*rr-1;
    const y=ground(x,z)+rnd()*0.03;
    const t=rnd(),l=dapple(x,z)*(0.6+0.5*rnd());
    let r,g,b;if(t<0.45){r=120;g=78;b=38;}else if(t<0.7){r=160;g=112;b=50;}else if(t<0.85){r=70;g=58;b=40;}else{r=62;g=82;b=40;}
    const s=0.018+rnd()*0.03,tilt=[Math.cos(0.15),Math.sin(0.15)*(rnd()-.5)*2,0,Math.sin(0.15)*(rnd()-.5)*2];
    add(x,y,z,s,0.003,s*(0.5+rnd()*0.4),qmul(qy(rnd()*6.283),tilt),Math.min(255,r*l),Math.min(255,g*l),Math.min(255,b*l),235);
  }
  // stump
  const stumpR=0.36,stumpH=0.52;
  for(let i=0;i<45000;i++){
    const a=rnd()*6.283,h=rnd()*stumpH,flare=1+Math.pow(1-h/stumpH,3)*0.35,rr=stumpR*flare*(1+0.06*(vnoise(a*6,h*14)-0.5));
    const x=Math.cos(a)*rr,z=Math.sin(a)*rr;
    const bark=vnoise(a*22,h*5),l=(0.35+0.65*bark)*(0.55+0.6*Math.max(0,Math.cos(a)*sun[0]*-1+Math.sin(a)*-sun[2]*0.6+0.3));
    add(x,ground(x,z)+h,z,0.008,0.03,0.008,qy(-a),58*l+20,46*l+16,36*l+12,250);
  }
  for(let i=0;i<14000;i++){ // cut top with growth rings
    const a=rnd()*6.283,rr=Math.sqrt(rnd())*stumpR*0.98,x=Math.cos(a)*rr,z=Math.sin(a)*rr;
    const ring=0.5+0.5*Math.sin(rr*190+vnoise(a*3,rr*8)*4),l=0.7+0.3*ring;
    add(x,ground(0,0)+stumpH+0.005,z,0.012,0.003,0.012,qy(rnd()*6),150*l,118*l,82*l,250);
  }
  // stone cairn on stump (the subject)
  const stones=[[0,0.07,0.21,0.13,0.17,0.3],[0.02,0.21,0.15,0.1,0.13,-0.5],[-0.01,0.32,0.1,0.075,0.09,0.9],[0.0,0.405,0.06,0.05,0.055,0.2]];
  const baseY=ground(0,0)+stumpH;
  for(const [ox,oy,ax,ay,az,rot] of stones){
    const cnt=Math.floor(26000*ax);
    for(let i=0;i<cnt*10;i++){
      const u=rnd()*2-1,th=rnd()*6.283,s=Math.sqrt(1-u*u);let nx=s*Math.cos(th),ny=u,nz=s*Math.sin(th);
      const bump=1+0.05*(vnoise(nx*5+ox*9,nz*5+ny*3)-0.5);
      const lx=nx*ax*bump,ly=ny*ay*bump,lz=nz*az*bump,cr=Math.cos(rot),sr=Math.sin(rot);
      const x=ox+lx*cr-lz*sr,z=lx*sr+lz*cr,y=baseY+oy+ly;
      const shade=Math.max(0.12,-(nx*cr-nz*sr)*sun[0]+ny*sun[1]-(nx*sr+nz*cr)*sun[2])*0.85+0.18;
      const speck=0.82+0.25*vnoise(x*90,y*90+z*40)+(rnd()<0.03?0.25:0);
      const base=128+18*Math.sin(rot*3);const l=shade*speck;
      add(x,y,z,0.006,0.006,0.0025,[Math.cos(th/2),0,Math.sin(th/2),0],Math.min(255,base*l*1.02),Math.min(255,base*l),Math.min(255,base*l*0.95),255);
    }
  }
  // background trunks
  for(let t=0;t<16;t++){
    const a=-Math.PI/2+(rnd()-.5)*2.6,d=2.6+rnd()*7,tx=Math.cos(a)*d+(rnd()-.5),tz=Math.sin(a)*d-1.5,tr=0.12+rnd()*0.28;
    for(let i=0;i<6000;i++){
      const aa=rnd()*6.283,h=rnd()*7,x=tx+Math.cos(aa)*tr,z=tz+Math.sin(aa)*tr;
      const l=(0.35+0.5*vnoise(aa*8,h*3))*(0.45+0.55*Math.max(0,-Math.cos(aa)*sun[0]-Math.sin(aa)*sun[2]));
      add(x,ground(tx,tz)+h,z,0.02,0.07,0.02,qy(-aa),75*l+12,68*l+12,58*l+10,250);
    }
  }
  // canopy + backlit foliage
  for(let i=0;i<45000;i++){
    const x=(rnd()-.5)*18,z=-1-rnd()*11,y=2.2+rnd()*5,l=0.4+0.9*Math.pow(rnd(),2);
    add(x,y,z,0.05,0.035,0.012,qrand(),60*l+10,95*l+14,40*l+6,200);
  }
  // bright sky / sun patch behind (for halation)
  for(let i=0;i<9000;i++){
    const az=-Math.PI/2+(rnd()-.5)*2.4,el=(rnd()-.1)*0.9,R=16;
    const x=Math.cos(az)*Math.cos(el)*R,z=Math.sin(az)*Math.cos(el)*R-1,y=1.2+Math.sin(el)*R*0.6;
    const ds=Math.hypot(az+Math.PI/2+0.25,el-0.18),b=Math.min(1,0.55+0.9*Math.exp(-ds*ds*12));
    add(x,y,z,0.35,0.35,0.35,[1,0,0,0],235*b,238*b,228*b,rnd()<Math.pow(fbm(x*0.4,y*0.4),1.5)*1.6?210:0);
  }
  // foreground ferns
  for(let f=0;f<9;f++){
    const fx=(rnd()-.5)*2.6,fz=1.2+rnd()*1.2;
    for(let fr=0;fr<7;fr++){const ang=rnd()*6.283,len=0.35+rnd()*0.3;
      for(let s=0;s<220;s++){const tt=s/220,x=fx+Math.cos(ang)*len*tt,z=fz+Math.sin(ang)*len*tt,y=ground(fx,fz)+Math.sin(tt*2.2)*0.18*len;
        const side=(s%2?1:-1)*0.04*(1-tt);
        add(x-Math.sin(ang)*side,y,z+Math.cos(ang)*side,0.022*(1-tt*0.6),0.002,0.008,qy(-ang+(s%2?0.8:-0.8)),55,95,35,240);}}
  }
  const n=P.length/3;
  return {n,pos:new Float32Array(P),rgba:new Uint8Array(C.map(v=>Math.max(0,Math.min(255,v)))),cov:new Float32Array(V),demo:true};
}


const SPLAT_VS=`#version 300 es
precision highp float;precision highp int;
uniform highp usampler2D uData;
uniform mat4 uProj,uView;
uniform vec2 uViewport;uniform float uFocalPx,uCovScale;
uniform vec2 uTiltDir; uniform float uFocus,uFocusY,uTiltK,uFmm,uN,uMmPerUnit,uPxPerMm,uDof,uSwirl,uCatEye,uAnam;
in vec2 aQuad;in uint aIndex;
out vec4 vColor;out vec2 vPos;
void main(){
  ivec2 t0=ivec2(int((aIndex&1023u)<<1),int(aIndex>>10));
  uvec4 d0=texelFetch(uData,t0,0);
  vec4 cam=uView*vec4(uintBitsToFloat(d0.xyz),1.);
  float d=-cam.z;
  vec4 clip=uProj*cam;
  float lim=1.3*clip.w;
  if(d<0.02||clip.x<-lim||clip.x>lim||clip.y<-lim||clip.y>lim){gl_Position=vec4(0.,0.,2.,1.);return;}
  uvec4 d1=texelFetch(uData,t0+ivec2(1,0),0);
  vec2 a=unpackHalf2x16(d1.x),b=unpackHalf2x16(d1.y),c=unpackHalf2x16(d1.z);
  mat3 V=mat3(a.x,a.y,b.x, a.y,b.y,c.x, b.x,c.x,c.y)*uCovScale;
  float iz=1./d;
  mat3 J=mat3(vec3(uFocalPx*iz,0.,0.),vec3(0.,uFocalPx*iz,0.),vec3(uFocalPx*cam.x*iz*iz,uFocalPx*cam.y*iz*iz,0.));
  mat3 T=J*mat3(uView);
  mat3 cv=T*V*transpose(T);
  float xx=cv[0][0]+0.3,xy=cv[0][1],yy=cv[1][1]+0.3;
  float alpha=float(d0.w>>24)/255.;
  // ---- thin-lens depth of field: grow each gaussian by its circle of confusion, conserve energy
  if(uDof>0.5){
    float S=max(uFocus+(dot(cam.xy,uTiltDir)-uFocusY)*uTiltK,0.01);
    float Smm=S*uMmPerUnit;
    float m=uFmm/max(Smm-uFmm,1.);
    float cocPx=min((uFmm/uN)*m*abs(d-S)/d*uPxPerMm,420.);
    float add=cocPx*cocPx/16.;
    float det0=xx*yy-xy*xy;
    // lens character: Petzval swirl (tangential stretch), cat's-eye (radial squeeze), anamorphic (tall ovals)
    vec2 sp=clip.xy/clip.w*uViewport*.5; float rr=length(sp)/length(uViewport*.5);
    vec2 er=rr>1e-4?normalize(sp):vec2(1.,0.), et=vec2(-er.y,er.x);
    float ar=max(.12,1.-uCatEye*.85*rr*rr-uSwirl*.45*rr*rr), at=1.+uSwirl*2.6*rr*rr;
    mat2 C=add*(ar*outerProduct(er,er)+at*outerProduct(et,et));
    vec2 AS=vec2(1./sqrt(1.+uAnam),sqrt(1.+uAnam)); C=mat2(AS.x,0.,0.,AS.y)*C*mat2(AS.x,0.,0.,AS.y);
    xx+=C[0][0];yy+=C[1][1];xy+=C[0][1];
    alpha*=sqrt(max(det0,1e-6)/max(xx*yy-xy*xy,1e-6));
  }
  if(alpha<1./255.){gl_Position=vec4(0.,0.,2.,1.);return;}
  float mid=.5*(xx+yy),rad=length(vec2(.5*(xx-yy),xy));
  float l1=mid+rad,l2=max(mid-rad,0.1);
  vec2 dg=normalize(vec2(xy,l1-xx));
  if(abs(xy)<1e-7)dg=xx>=yy?vec2(1.,0.):vec2(0.,1.);
  vec2 ax1=min(sqrt(2.*l1),1024.)*dg,ax2=min(sqrt(2.*l2),1024.)*vec2(dg.y,-dg.x);
  vColor=vec4(vec3(float(d0.w&255u),float((d0.w>>8)&255u),float((d0.w>>16)&255u))/255.,alpha);
  vPos=aQuad;
  vec2 ndc=clip.xy/clip.w;
  gl_Position=vec4(ndc+(aQuad.x*ax1+aQuad.y*ax2)*2./uViewport,0.,1.);
}`;
const SPLAT_FS=`#version 300 es
precision highp float;
in vec4 vColor;in vec2 vPos;out vec4 o;
void main(){float A=-dot(vPos,vPos);if(A<-4.)discard;float B=exp(A)*vColor.a;if(B<1./255.)discard;o=vec4(vColor.rgb*B,B);}`;


const SCAN_FORMATS={'35mm':{w:36,h:24,f:50,r:[14,200]},'6x7':{w:70,h:56,f:90,r:[35,300]},'4x5':{w:127,h:101.6,f:150,r:[65,480]},'8x10':{w:254,h:203.2,f:300,r:[120,760]}};
const STOPS=[0.95,1.2,1.4,2,2.8,4,5.6,8,11,16,22,32,45,64];
// Lens library for 3D scans: optics (format, focal length, widest stop, bokeh character) + rendering traits
// post: falloff (vignette), glow (spherical-aberration haze), fringe (lateral CA), distort (barrel −), softEdges (field softness)
const LENSES=[
 {id:'planar50',  name:'50mm f/1.4 · classic double-Gauss', format:'35mm', fmm:50,  f:1.4, catEye:.2,  post:{falloff:.35,glow:.04,fringe:3,distort:-2},
  desc:'Clean, neutral standard lens: crisp focus, round-ish bokeh that turns to cat\'s-eyes toward the corners wide open.'},
 {id:'helios',    name:'Helios 44-2 58mm f/2 · swirly', format:'35mm', fmm:58, f:2, swirl:.8, catEye:.3, post:{falloff:.55,glow:.14,fringe:9,distort:-1,softEdges:15},
  desc:'Soviet Biotar copy famous for its swirling, spinning background bokeh and gentle glow.'},
 {id:'petzval',   name:'Petzval 85mm f/2.2 · art lens', format:'35mm', fmm:85, f:2.2, swirl:1.2, catEye:.25, post:{falloff:.75,glow:.12,fringe:6,softEdges:40},
  desc:'1840s portrait design: sharp centre, strong swirl and soft edges that pull the eye to the subject.'},
 {id:'nocti',     name:'50mm f/0.95 · dream lens', format:'35mm', fmm:50, f:.95, catEye:.7, post:{falloff:.9,glow:.3,fringe:12,distort:-2,softEdges:10},
  desc:'Ultra-fast: razor-thin focus, glowing highlights, heavy vignette and big cat\'s-eye bokeh.'},
 {id:'p85',       name:'85mm f/1.2 · portrait', format:'35mm', fmm:85, f:1.2, catEye:.35, post:{falloff:.45,glow:.06,fringe:4},
  desc:'Creamy portrait lens: melting background, smooth roll-off, very little distortion.'},
 {id:'w24',       name:'24mm f/1.4 · wide', format:'35mm', fmm:24, f:1.4, catEye:.3, post:{falloff:.7,glow:.04,fringe:6,distort:-7},
  desc:'Wide and fast: environmental portraits with a little barrel distortion and corner falloff.'},
 {id:'t200',      name:'200mm f/2 · telephoto', format:'35mm', fmm:200, f:2, catEye:.25, post:{falloff:.25,glow:.03,fringe:3,distort:1},
  desc:'Long and fast: compressed perspective, huge smooth bokeh, background flattened behind the subject.'},
 {id:'anamorphic',name:'Anamorphic 50mm T2 · 2× squeeze', format:'35mm', fmm:50, f:2, anam:.9, landscape:true, post:{falloff:.5,glow:.12,fringe:16,distort:-4},
  desc:'Cinema anamorphic: tall oval bokeh, blue-ish fringing, wide-screen feel. Best in horizontal orientation.'},
 {id:'speedpanchro',name:'Speed Panchro 32mm T2 · vintage cine', format:'35mm', fmm:32, f:2, swirl:.25, catEye:.3, post:{falloff:.55,glow:.22,fringe:8,distort:-3,softEdges:12},
  desc:'Classic Hollywood cine glass: warm glow, soft contrast, gentle swirl.'},
 {id:'fisheye',   name:'Fisheye 15mm f/2.8', format:'35mm', fmm:15, f:2.8, post:{falloff:.6,glow:.04,fringe:22,distort:-60},
  desc:'Extreme barrel distortion and a huge field of view — the skate-video look.'},
 {id:'tilt24',    name:'Tilt-shift 24mm f/3.5 · architecture & miniature', format:'35mm', fmm:24, f:3.5, tilt:-8, post:{falloff:.45,glow:.02,fringe:5,distort:-3},
  desc:'Tilt the lens down to make a scene look like a tiny model (the miniature effect), or level it for big depth of field.'},
 {id:'tilt45',    name:'Tilt-shift 45mm f/2.8', format:'35mm', fmm:45, f:2.8, tilt:5, catEye:.1, post:{falloff:.35,glow:.03,fringe:3},
  desc:'Normal-length tilt-shift: lay the plane of focus along a table, a face or a road.'},
 {id:'tilt90',    name:'Tilt-shift 90mm f/2.8', format:'35mm', fmm:90, f:2.8, tilt:6, catEye:.15, post:{falloff:.35,glow:.03,fringe:3},
  desc:'Front tilt sets a plane of focus that runs at an angle through the scene.'},
 {id:'soft',      name:'Soft-focus / Lensbaby', format:'35mm', fmm:50, f:2, swirl:.4, catEye:.3, post:{falloff:.6,glow:.5,fringe:10,softEdges:55},
  desc:'Dreamy: a small sweet spot, blooming highlights and smeared edges.'},
 {id:'mamiya80',  name:'Mamiya 80mm f/2.8 · 6×7', format:'6x7', fmm:80, f:2.8, catEye:.2, post:{falloff:.35,glow:.04,fringe:3},
  desc:'Medium-format normal lens: the big-negative look with shallow depth at moderate apertures.'},
 {id:'holga',     name:'Holga 60mm f/8 · plastic toy', format:'6x7', fmm:60, f:8, swirl:.3, post:{falloff:1.3,glow:.2,fringe:40,distort:-10,softEdges:60},
  desc:'Plastic meniscus lens: heavy vignette, smeary corners, colour fringing.'},
 {id:'lf150',     name:'150mm f/5.6 · 4×5 view camera', format:'4x5', fmm:150, f:5.6, post:{falloff:.3,glow:.02,fringe:2},
  desc:'Large-format standard: huge negative, very shallow depth even at f/5.6, crisp and neutral.'},
 {id:'lf300',     name:'300mm f/5.6 · 8×10 portrait', format:'8x10', fmm:300, f:5.6, catEye:.1, post:{falloff:.3,glow:.06,fringe:2},
  desc:'Ultra-large format: the deepest subject separation of all — eyes sharp, ears already soft.'},
];
const Splat = {
  scene:null, covScale:1, sortedCount:0, sortBusy:false, sortWant:false, lastSortView:null,
  cam:{format:'4x5',portrait:true,fmm:150,stop:6,focus:2.4,tilt:0,dof:true,up:'Y-up',scale:1,bg:'#0a0a09',roll:0,model:null,lens:'',tiltDir:0,swirl:0,catEye:0,anam:0,post:null,
       yaw:0.25,pitch:0.12,dist:2.4,target:[0,0.85,0],focusLock:null},
  init(gl){
    this.gl=gl;
    this.P=GLU.program(SPLAT_VS,SPLAT_FS,['aQuad']);
    this.vao=gl.createVertexArray(); gl.bindVertexArray(this.vao);
    const qb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,qb); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-2,-2,2,-2,2,2,-2,2]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    this.indexBuf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.indexBuf);
    const li=gl.getAttribLocation(this.P.p,'aIndex'); gl.enableVertexAttribArray(li); gl.vertexAttribIPointer(li,1,gl.UNSIGNED_INT,0,0); gl.vertexAttribDivisor(li,1);
    gl.bindVertexArray(null);
    this.dataTex=gl.createTexture();
    this.worker=new Worker(URL.createObjectURL(new Blob([`
let pos=null,n=0;
onmessage=e=>{const d=e.data;
  if(d.pos){pos=d.pos;n=d.n;return;}
  const v=d.view,z=new Float32Array(n);let mn=1e30,mx=-1e30;
  for(let i=0;i<n;i++){const k=v[2]*pos[3*i]+v[6]*pos[3*i+1]+v[10]*pos[3*i+2]+v[14];z[i]=k;if(k<mn)mn=k;if(k>mx)mx=k;}
  const B=65536,sc=(B-1)/Math.max(mx-mn,1e-9),cnt=new Uint32Array(B),key=new Uint16Array(n);
  for(let i=0;i<n;i++){const k=((z[i]-mn)*sc)|0;key[i]=k;cnt[k]++;}
  let s=0;for(let i=0;i<B;i++){const c=cnt[i];cnt[i]=s;s+=c;}
  const idx=new Uint32Array(n);for(let i=0;i<n;i++)idx[cnt[key[i]]++]=i;
  postMessage({idx,id:d.id},[idx.buffer]);
};`],{type:'text/javascript'})));
    this.worker.onmessage=e=>{ this.sortBusy=false; const gl=this.gl; gl.bindBuffer(gl.ARRAY_BUFFER,this.indexBuf); gl.bufferData(gl.ARRAY_BUFFER,e.data.idx,gl.DYNAMIC_DRAW);
      this.sortedCount=e.data.idx.length; this.onDirty&&this.onDirty(); if(this.sortWant) this.requestSort(); };
  },
  toHalf(v){ const f=Splat._f32||(Splat._f32=new Float32Array(1)), u=Splat._u32||(Splat._u32=new Uint32Array(f.buffer)); f[0]=v; const x=u[0];
    const s=(x>>>16)&0x8000; let e=((x>>>23)&0xff)-127+15; let m=x&0x7fffff;
    if(e<=0){ if(e<-10) return s; m=(m|0x800000)>>(1-e); return s|((m+0x1000)>>13); }
    if(e>=31) return s|0x7bff; return s|(e<<10)|((m+0x1000)>>13); },
  load(s){
    const gl=this.gl; const maxRows=gl.getParameter(gl.MAX_TEXTURE_SIZE); if(s.n>maxRows*1024) s.n=maxRows*1024;
    this.scene=s; const n=s.n;
    const tr=new Float32Array(Math.min(n,20000)); for(let i=0;i<tr.length;i++){ const j=Math.floor(i*n/tr.length)*6; tr[i]=s.cov[j]+s.cov[j+3]+s.cov[j+5]; }
    tr.sort(); this.covScale=Math.max(tr[tr.length>>1]/3,1e-12);
    const W=2048,H=Math.ceil(n/1024),u=new Uint32Array(W*H*4),f=new Float32Array(u.buffer),k=1/this.covScale,h=v=>this.toHalf(v);
    for(let i=0;i<n;i++){ const o=i*8,c=i*6;
      f[o]=s.pos[i*3]; f[o+1]=s.pos[i*3+1]; f[o+2]=s.pos[i*3+2];
      u[o+3]=s.rgba[i*4]|(s.rgba[i*4+1]<<8)|(s.rgba[i*4+2]<<16)|(s.rgba[i*4+3]<<24);
      u[o+4]=h(s.cov[c]*k)|(h(s.cov[c+1]*k)<<16); u[o+5]=h(s.cov[c+2]*k)|(h(s.cov[c+3]*k)<<16); u[o+6]=h(s.cov[c+4]*k)|(h(s.cov[c+5]*k)<<16); }
    gl.bindTexture(gl.TEXTURE_2D,this.dataTex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32UI,W,H,0,gl.RGBA_INTEGER,gl.UNSIGNED_INT,u);
    this.worker.postMessage({pos:s.pos,n}); this.sortedCount=0; this.lastSortView=null;
    this.frame(); this.requestSort();
  },
  sensor(){ const F=SCAN_FORMATS[this.cam.format]; return this.cam.portrait?[F.h,F.w]:[F.w,F.h]; },
  camPos(){ const c=this.cam, cp=Math.cos(c.pitch); return [c.target[0]+c.dist*cp*Math.sin(c.yaw), c.target[1]+c.dist*Math.sin(c.pitch), c.target[2]+c.dist*cp*Math.cos(c.yaw)]; },
  view(){ const c=this.cam, e=this.camPos(), t=c.target; let up=[0,1,0];
    if(c.roll){ // rotate "up" about the viewing axis (horizon fine-tune)
      let f=[t[0]-e[0],t[1]-e[1],t[2]-e[2]]; const l=Math.hypot(...f); f=f.map(v=>v/l); const a=c.roll*Math.PI/180, co=Math.cos(a), si=Math.sin(a);
      const cr=[f[1]*up[2]-f[2]*up[1], f[2]*up[0]-f[0]*up[2], f[0]*up[1]-f[1]*up[0]], d=f[0]*up[0]+f[1]*up[1]+f[2]*up[2];
      up=up.map((u,i)=>u*co+cr[i]*si+f[i]*d*(1-co)); }
    return M4.lookAt(e,t,up); },
  modelM(){ return new Float32Array(this.cam.model||MODELS[this.cam.up]); },
  viewModel(){ return M4.mul(this.view(),this.modelM()); },
  frame(){
    const c=this.cam, s=this.scene; if(!s) return;
    if(s.demo){ Object.assign(c,{yaw:0.25,pitch:0.12,dist:2.4,target:[0,0.85,0],up:'Y-up',focusLock:[0,0.86,0]}); return; }
    const n=s.n,m=this.modelM(),N=Math.min(n,40000),xs=[],ys=[],zs=[];
    for(let i=0;i<N;i++){ const j=Math.floor(i*n/N)*3,x=s.pos[j],y=s.pos[j+1],z=s.pos[j+2];
      xs.push(m[0]*x+m[4]*y+m[8]*z); ys.push(m[1]*x+m[5]*y+m[9]*z); zs.push(m[2]*x+m[6]*y+m[10]*z); }
    const med=a=>{const b=a.slice().sort((p,q)=>p-q);return b[b.length>>1];};
    const ctr=[med(xs),med(ys),med(zs)];
    const ds=xs.map((x,i)=>Math.hypot(x-ctr[0],ys[i]-ctr[1],zs[i]-ctr[2])).sort((p,q)=>p-q);
    const r=ds[Math.floor(ds.length*0.5)]||1;
    Object.assign(c,{target:ctr,dist:r*1.6,yaw:0,pitch:0.1,focusLock:ctr.slice()});
  },
  requestSort(){ if(!this.scene) return; if(this.sortBusy){ this.sortWant=true; return; } this.sortWant=false; this.sortBusy=true;
    const v=this.viewModel(); this.lastSortView=v; this.worker.postMessage({view:v}); },
  maybeSort(){ const v=this.viewModel(), l=this.lastSortView;
    if(!l||Math.abs(v[2]-l[2])+Math.abs(v[6]-l[6])+Math.abs(v[10]-l[10])+Math.abs(v[14]-l[14])*0.2>0.004) this.requestSort(); },
  // render the splats into rt (w×h). Values are display-referred sRGB-encoded colours.
  render(rt){
    const gl=this.gl, c=this.cam, s=this.scene; const iw=rt.w, ih=rt.h;
    gl.bindFramebuffer(gl.FRAMEBUFFER,rt.f); gl.viewport(0,0,iw,ih);
    const bg=parseInt(c.bg.slice(1),16); gl.clearColor((bg>>16&255)/255,(bg>>8&255)/255,(bg&255)/255,1); gl.clear(gl.COLOR_BUFFER_BIT);
    if(!s||!this.sortedCount) return;
    const [sw,sh]=this.sensor(), fovy=2*Math.atan(sh/(2*c.fmm)), focalPx=ih/2/Math.tan(fovy/2);
    const V=this.viewModel(), Pm=M4.persp(fovy,iw/ih,0.02,2000);
    let focusY=0;
    if(c.focusLock){ const p=c.focusLock, mm=this.modelM(), v=this.view();
      const wx=mm[0]*p[0]+mm[4]*p[1]+mm[8]*p[2], wy=mm[1]*p[0]+mm[5]*p[1]+mm[9]*p[2], wz=mm[2]*p[0]+mm[6]*p[1]+mm[10]*p[2];
      const cz=v[2]*wx+v[6]*wy+v[10]*wz+v[14]; { const td=(c.tiltDir||0)*Math.PI/180, cx_=v[0]*wx+v[4]*wy+v[8]*wz+v[12], cy_=v[1]*wx+v[5]*wy+v[9]*wz+v[13]; focusY=cx_*Math.sin(td)+cy_*Math.cos(td); } if(-cz>0.01) c.focus=-cz; }
    gl.useProgram(this.P.p); const u=this.P.u;
    gl.uniformMatrix4fv(u.uProj,false,Pm); gl.uniformMatrix4fv(u.uView,false,V);
    gl.uniform2f(u.uViewport,iw,ih); gl.uniform1f(u.uFocalPx,focalPx); gl.uniform1f(u.uCovScale,this.covScale);
    gl.uniform1f(u.uFocus,c.focus); gl.uniform1f(u.uFocusY,focusY); gl.uniform1f(u.uTiltK,-Math.tan(c.tilt*Math.PI/180)); { const td=(c.tiltDir||0)*Math.PI/180; gl.uniform2f(u.uTiltDir,Math.sin(td),Math.cos(td)); }
    gl.uniform1f(u.uFmm,c.fmm); gl.uniform1f(u.uN,STOPS[c.stop]); gl.uniform1f(u.uMmPerUnit,c.scale*1000); gl.uniform1f(u.uPxPerMm,ih/sh); gl.uniform1f(u.uDof,c.dof?1:0); gl.uniform1f(u.uSwirl,c.swirl||0); gl.uniform1f(u.uCatEye,c.catEye||0); gl.uniform1f(u.uAnam,c.anam||0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.dataTex); gl.uniform1i(u.uData,0);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao); gl.drawArraysInstanced(gl.TRIANGLE_FAN,0,4,this.sortedCount); gl.bindVertexArray(null); gl.disable(gl.BLEND);
    this.last={iw,ih,focalPx};
  },
  pick(px,py,iw,ih){   // px,py in image pixels (top-left origin)
    const s=this.scene; if(!s) return null;
    const [sw,sh]=this.sensor(), fovy=2*Math.atan(sh/(2*this.cam.fmm)), f=ih/2/Math.tan(fovy/2);
    const V=this.viewModel(),hx=iw/2,hy=ih/2,R=Math.max(5,ih*0.012),R2=R*R,P=s.pos,n=s.n,A=s.rgba; const cand=[];
    for(let i=0;i<n;i++){ if(A[i*4+3]<70) continue; const x=P[i*3],y=P[i*3+1],z=P[i*3+2];
      const cz=V[2]*x+V[6]*y+V[10]*z+V[14]; if(cz>-0.03) continue; const d=-cz;
      const sx=hx+f*(V[0]*x+V[4]*y+V[8]*z+V[12])/d, sy=hy-f*(V[1]*x+V[5]*y+V[9]*z+V[13])/d;
      const dx=sx-px, dy=sy-py; if(dx*dx+dy*dy<R2) cand.push([d,i]); }
    if(!cand.length) return null; cand.sort((a,b)=>a[0]-b[0]); const i=cand[Math.floor(cand.length*0.12)][1];
    return [P[i*3],P[i*3+1],P[i*3+2]];
  },
  toWorld(p){ const m=this.modelM(); return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2], m[1]*p[0]+m[5]*p[1]+m[9]*p[2], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]]; },
  // ---- levelling: make the scene's ground/table plane horizontal so orbits stay upright
  applyRotation(R){ // R: 3x3 row-major, applied in world space; keeps the current view
    const c=this.cam, M=this.modelM(), R4=new Float32Array([R[0],R[3],R[6],0, R[1],R[4],R[7],0, R[2],R[5],R[8],0, 0,0,0,1]);
    const e=this.camPos(), rot=v=>[R[0]*v[0]+R[1]*v[1]+R[2]*v[2], R[3]*v[0]+R[4]*v[1]+R[5]*v[2], R[6]*v[0]+R[7]*v[1]+R[8]*v[2]];
    const t2=rot(c.target), e2=rot(e), d=[e2[0]-t2[0],e2[1]-t2[1],e2[2]-t2[2]], dist=Math.hypot(...d);
    c.model=Array.from(M4.mul(R4,M)); c.target=t2; c.dist=dist; c.pitch=Math.asin(Math.max(-1,Math.min(1,d[1]/dist))); c.yaw=Math.atan2(d[0],d[2]); c.roll=0;
    this.lastSortView=null; },
  rotTo(n,to){ // rotation taking unit vector n onto `to`
    const v=[n[1]*to[2]-n[2]*to[1], n[2]*to[0]-n[0]*to[2], n[0]*to[1]-n[1]*to[0]], s=Math.hypot(...v), c=n[0]*to[0]+n[1]*to[1]+n[2]*to[2];
    if(s<1e-8) return c>0?[1,0,0,0,1,0,0,0,1]:[1,0,0,0,-1,0,0,0,-1];
    const k=v.map(x=>x/s), K=[0,-k[2],k[1], k[2],0,-k[0], -k[1],k[0],0], a=Math.atan2(s,c), sa=Math.sin(a), ca=1-Math.cos(a);
    const KK=[0,0,0,0,0,0,0,0,0]; for(let r=0;r<3;r++) for(let q=0;q<3;q++) for(let j=0;j<3;j++) KK[r*3+q]+=K[r*3+j]*K[j*3+q];
    return [0,1,2,3,4,5,6,7,8].map(i=>(i%4===0?1:0)+sa*K[i]+ca*KK[i]); },
  levelToView(){ const v=this.view(); const up=[v[1],v[5],v[9]]; this.applyRotation(this.rotTo(up,[0,1,0])); },
  autoLevel(){
    const s=this.scene; if(!s||s.demo) return false; const M=this.modelM(), n=s.n, N=Math.min(n,30000), P=[];
    for(let i=0;i<N;i++){ const j=Math.floor(i*n/N); if(s.rgba[j*4+3]<80) continue; const x=s.pos[j*3],y=s.pos[j*3+1],z=s.pos[j*3+2];
      P.push([M[0]*x+M[4]*y+M[8]*z, M[1]*x+M[5]*y+M[9]*z, M[2]*x+M[6]*y+M[10]*z]); }
    if(P.length<100) return false;
    const c=this.cam.target; const ds=P.map(p=>Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2])).sort((a,b)=>a-b); const R=ds[Math.floor(ds.length*.6)]||1, thr=R*0.02;
    const near=P.filter(p=>Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2])<R*2.5);
    let best=null, bs=0; let sd=12345; const rnd=()=>{ sd=(sd*16807)%2147483647; return sd/2147483647; };
    for(let it=0;it<700;it++){
      const a=near[Math.floor(rnd()*near.length)], b=near[Math.floor(rnd()*near.length)], q=near[Math.floor(rnd()*near.length)];
      const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], w=[q[0]-a[0],q[1]-a[1],q[2]-a[2]]; let nn=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]]; const l=Math.hypot(...nn); if(l<1e-9) continue; nn=nn.map(x=>x/l);
      let cnt=0; for(let i=0;i<near.length;i+=3){ const p=near[i]; if(Math.abs((p[0]-a[0])*nn[0]+(p[1]-a[1])*nn[1]+(p[2]-a[2])*nn[2])<thr) cnt++; }
      const score=cnt*(0.35+0.65*Math.abs(nn[1]));   // prefer planes near the current "up"
      if(score>bs){ bs=score; best={nn,a}; } }
    if(!best) return false;
    let nn=best.nn; // point "up" toward where most of the subject is
    let above=0; for(let i=0;i<near.length;i+=5){ const p=near[i]; above+=Math.sign((p[0]-best.a[0])*nn[0]+(p[1]-best.a[1])*nn[1]+(p[2]-best.a[2])*nn[2]); }
    if(above<0) nn=nn.map(x=>-x);
    this.applyRotation(this.rotTo(nn,[0,1,0])); return true; },
  pan(dx,dy){ const v=this.view(),k=this.cam.dist*0.0016; for(let i=0;i<3;i++) this.cam.target[i]+=(-v[i*4]*dx+v[i*4+1]*dy)*k; },
};
