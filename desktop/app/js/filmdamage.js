// Moving film damage for video: dust that changes every frame, scratches that run down the reel for a while,
// the odd hair stuck in the gate, gate weave and exposure flicker. Drawn on top of each finished frame.
const FilmDamage = {
  DEFAULTS:{on:false,amount:60,dust:50,dustSize:50,scratch:35,hair:20,weave:30,flicker:25,colour:'mix',seed:1},
  make(o,w,h){ const p=Object.assign({},this.DEFAULTS,o||{}); let s=(p.seed*2654435761)>>>0||1;
    const rnd=()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; };
    return {p,w,h,rnd,k:h/1080,scr:[],hairs:[],stuck:[],wx:0,wy:0,fl:0}; },
  // returns the gate-weave offset (pixels) for this frame; call draw() after the frame has been placed
  weave(S){ const p=S.p, A=p.amount/100, a=p.weave/100*A*2.2*S.k, r=S.rnd;
    S.wx=S.wx*0.6+(r()-0.5)*a*0.8; S.wy=S.wy*0.55+(r()-0.5)*a*1.6+(r()<0.02*p.weave/100?(r()-0.5)*a*3:0); return [Math.round(S.wx),Math.round(S.wy)]; },
  tone(S,dark){ const c=S.p.colour; const d=c==='dark'?true:c==='light'?false:dark; return d?'0,0,0':'255,252,240'; },
  draw(x,S){ const {p,w,h,rnd:r,k}=S, A=p.amount/100; if(A<=0) return;
    // exposure flicker: the lamp and the shutter are never quite even
    if(p.flicker>0){ S.fl=S.fl*0.5+(r()-0.5)*0.12*p.flicker/100*A; const f=S.fl+(r()<0.015*p.flicker/100?(r()-0.3)*0.12*A:0);
      x.fillStyle=f>0?`rgba(255,250,235,${Math.min(0.35,f)})`:`rgba(0,0,0,${Math.min(0.35,-f)})`; x.fillRect(0,0,w,h); }
    // dust: new specks every frame, a few that stick for several frames
    const nd=Math.round(Math.pow(p.dust/100,1.4)*A*170*(w*h)/(1920*1080)), sz=(0.6+p.dustSize/50)*k;
    const speck=(cx,cy,rad,ang,el,alpha,dark,fibre)=>{ x.save(); x.translate(cx,cy); x.rotate(ang); x.fillStyle=`rgba(${this.tone(S,dark)},${alpha})`;
      if(fibre){ x.strokeStyle=x.fillStyle; x.lineWidth=Math.max(0.7,rad*0.35); x.beginPath(); x.moveTo(-rad*3,0); x.quadraticCurveTo(0,rad*(r()*4-2),rad*3,rad*(r()*2-1)); x.stroke(); }
      else { x.beginPath(); for(let i=0;i<7;i++){ const a=i/7*Math.PI*2, q=rad*(0.6+r()*0.6); x.lineTo(Math.cos(a)*q*el,Math.sin(a)*q); } x.closePath(); x.fill(); } x.restore(); };
    for(let i=0;i<nd;i++){ const big=r()<0.12, rad=sz*(big?2+r()*4:0.4+r()*1.4); speck(r()*w,r()*h,rad,r()*6.28,0.5+r(),0.35+r()*0.55,r()<0.6,r()<0.12); }
    if(r()<0.06*p.dust/100*A) S.stuck.push({x:r()*w,y:r()*h,rad:sz*(1+r()*3),life:2+Math.floor(r()*10),dark:r()<0.6,ang:r()*6});
    S.stuck=S.stuck.filter(d=>{ speck(d.x,d.y,d.rad,d.ang,1,0.7,d.dark,false); return --d.life>0; });
    // scratches: long vertical lines that wander slowly across the frame and last for seconds
    if(r()<0.025*p.scratch/100*A+0.002*A) S.scr.push({x:r()*w,v:(r()-0.5)*0.6*k,life:20+Math.floor(r()*150),wd:(0.6+r()*1.6)*k,a:0.25+r()*0.5,dark:r()<0.35,y0:r()<0.7?0:r()*h*0.6,y1:r()<0.7?h:h*(0.4+r()*0.6),gap:r()<0.4});
    S.scr=S.scr.filter(s=>{ s.x+=s.v+(r()-0.5)*0.8*k; s.v+=(r()-0.5)*0.05*k; const al=s.a*(0.55+r()*0.45)*A; x.strokeStyle=`rgba(${this.tone(S,s.dark)},${al})`; x.lineWidth=s.wd;
      x.beginPath(); let y=s.y0, xx=s.x; x.moveTo(xx,y); while(y<s.y1){ y+=h/14; xx+=(r()-0.5)*0.9*k; if(s.gap&&r()<0.12) x.moveTo(xx,y); else x.lineTo(xx,y); } x.stroke();
      if(r()<0.3){ x.strokeStyle=`rgba(${this.tone(S,s.dark)},${al*0.35})`; x.lineWidth=s.wd*3; x.stroke(); } return --s.life>0&&s.x>-20&&s.x<w+20; });
    // hairs caught in the gate: curly strands near an edge, a few frames to a couple of seconds
    if(r()<0.01*p.hair/100*A){ const edge=r()<0.5, n=6+Math.floor(r()*6), pts=[]; let px=edge?r()*w*0.25+(r()<0.5?0:w*0.75):r()*w, py=edge?r()*h:(r()<0.5?0:h), a=r()*6.28; const L=(30+r()*140)*k;
      for(let i=0;i<n;i++){ pts.push([px,py]); a+=(r()-0.5)*1.6; px+=Math.cos(a)*L/n; py+=Math.sin(a)*L/n; } S.hairs.push({pts,life:3+Math.floor(r()*40),wd:(0.8+r()*1.2)*k,dark:r()<0.75}); }
    S.hairs=S.hairs.filter(hr=>{ x.strokeStyle=`rgba(${this.tone(S,hr.dark)},${0.75*A})`; x.lineWidth=hr.wd; x.lineCap='round'; x.beginPath(); hr.pts.forEach(([a,b],i)=>{ const j=i?(r()-0.5)*0.6*k:0; i?x.lineTo(a+j,b+j):x.moveTo(a,b); }); x.stroke(); return --hr.life>0; });
  },
  // the frame is already on canvas cv: weave shifts it (slightly enlarged so the gate edge never shows), then the damage goes on top
  frame(x,S,cv){ const [dx,dy]=this.weave(S), z=S.p.weave>0?0.014:0; if(dx||dy||z) x.drawImage(cv,dx-S.w*z/2,dy-S.h*z/2,S.w*(1+z),S.h*(1+z)); this.draw(x,S); }
};
