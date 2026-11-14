// Develop tools shared by the Mac app and the phone/iPad app:
// crop & straighten (with on-canvas overlay), tone curve editor, HSL colour mixer, colour-grading wheels,
// preset import/export.  Needs: Engine, UI, DEFAULTS, HSL_BANDS, cloneParams.  `host` supplies
// changed(), commit(), toast() and (optionally) the overlay element.
const ASPECTS = [['free','Free'],['orig','Original'],['1:1','1 : 1'],['4:5','4 : 5'],['2:3','2 : 3'],['5:7','5 : 7'],['3:4','3 : 4'],['6:7','6 × 7'],['9:16','9 : 16'],['65:24','XPan']];
const Tools = {
  host:null,
  init(host){ this.host=host; },
  P(){ return Engine.p; },


  // ------------------------------------------------------------------ coordinates: viewer ⇄ source uv
  toSrc(cx,cy,el){ const L=this.host._lastL; if(!L||!Engine.src) return null; const b=el.getBoundingClientRect(), dpr=L.dpr;
    const px=(cx-b.left)*dpr, py=L.H-(cy-b.top)*dpr; const u=(px-L.ix)/L.iw, vt=(L.iy+L.ih-py)/L.ih;
    const s=CM.vec(Engine.geom(this.P(),Engine.src,Engine.cropMode),[u,vt,1]); return {x:s[0],y:s[1],u,vt}; },
  toView(sx,sy){ const L=this.host._lastL; const M=CM.inv(Engine.geom(this.P(),Engine.src,Engine.cropMode)); const o=CM.vec(M,[sx,sy,1]);
    return [L.ix+o[0]*L.iw, (L.H-L.iy-L.ih)+o[1]*L.ih]; },   // canvas px, top-left origin

  // ------------------------------------------------------------------ white balance eyedropper + auto
  pickWB(on){ this.eyedrop=on; document.body.classList.toggle('eyedrop',on); const b=document.getElementById('wbPick'); if(b) b.classList.toggle('on',on); },
  eyedropClick(e,el){ if(!this.eyedrop) return false; const L=this.host._lastL, b=el.getBoundingClientRect(), dpr=L.dpr;
    const c=Engine.sampleAt((e.clientX-b.left)*dpr, L.H-(e.clientY-b.top)*dpr, L); this.pickWB(false);
    if(!c){ this.host.toast('Click on the photo'); return true; }
    const [t,ti]=Engine.solveWB(c,this.P().temp,this.P().tint); this.P().temp=t; this.P().tint=ti; this.host.changed(); this.host.commit(); UI.refresh(); this.host.toast(`White balance: temp ${t>0?'+':''}${t} · tint ${ti>0?'+':''}${ti}`); return true; },
  autoWB(){ const r=Engine.autoWB(this.P()); if(!r) return; this.P().temp=r[0]; this.P().tint=r[1]; this.host.changed(); this.host.commit(); UI.refresh(); this.host.toast(`Auto white balance: ${r[0]>0?'+':''}${r[0]} / ${r[1]>0?'+':''}${r[1]}`); },

  // ------------------------------------------------------------------ masks: gradient, radial, brush
  maskSel:null, maskEdit:false, brush:{size:60,flow:60,erase:false},
  masks(){ const p=this.P(); if(!Array.isArray(p.masks)) p.masks=[]; return p.masks; },
  mask(){ return this.masks().find(m=>m.id===this.maskSel)||null; },
  addMask(type){
    if(!Engine.src){ this.host.toast('Open a photo first'); return; }
    const ms=this.masks(); if(ms.length>=MAX_MASKS){ this.host.toast('Up to '+MAX_MASKS+' masks per photo'); return; }
    const n={linear:'Gradient',radial:'Radial',brush:'Brush'}[type];
    const m={id:'m'+Date.now().toString(36),type,name:n+' '+(ms.filter(x=>x.type===type).length+1),on:true,feather:type==='radial'?50:100,amount:100,invert:false,
      adj:{ev:0,temp:0,tint:0,sat:0,contrast:0},g:type==='linear'?{x0:.5,y0:.15,x1:.5,y1:.55}:type==='radial'?{cx:.5,cy:.45,rx:.22,ry:.3,angle:0}:{}};
    if(type==='brush'){ const [W,H]=[Engine.src.w,Engine.src.h], k=Math.min(1,1024/Math.max(W,H)); const c=document.createElement('canvas'); c.width=Math.max(8,Math.round(W*k)); c.height=Math.max(8,Math.round(H*k)); m._canvas=c; m.ver=1; }
    ms.push(m); this.maskSel=m.id; this.setMaskEdit(true); this.host.changed(); this.host.commit(); this.renderMasks();
    this.host.toast(type==='brush'?'Paint where you want the adjustment (⌥ / Erase to remove)':type==='linear'?'Drag the gradient lines; adjust with the sliders':'Drag the ellipse to move it, its edge to resize');
  },
  removeMask(id){ const p=this.P(); p.masks=this.masks().filter(m=>m.id!==id); if(this.maskSel===id) this.maskSel=null; delete Engine.maskTexCache[id]; this.host.changed(); this.host.commit(); this.renderMasks(); this.overlay(); },
  setMaskEdit(on){ this.maskEdit=on; document.body.classList.toggle('masking',on); if(on&&Engine.cropMode) this.setCropMode(false); Engine.dirty=true; requestAnimationFrame(()=>this.overlay()); },
  drawMasks(x,L){
    const m=this.mask(); if(!m||!this.maskEdit||!Engine.src) return;
    const dpr=L.dpr; x.save(); x.beginPath(); x.rect(L.ix,L.H-L.iy-L.ih,L.iw,L.ih); x.clip(); x.lineWidth=1.4*dpr; x.strokeStyle='rgba(255,255,255,.9)'; x.fillStyle='#fff';
    const dot=(a,b,r=5)=>{ x.beginPath(); x.arc(a,b,r*dpr,0,7); x.fill(); x.strokeStyle='#000'; x.lineWidth=1*dpr; x.stroke(); x.strokeStyle='rgba(255,255,255,.9)'; x.lineWidth=1.4*dpr; };
    if(m.type==='linear'){ const g=m.g, A=this.toView(g.x0,g.y0), B=this.toView(g.x1,g.y1);
      const dx=B[0]-A[0], dy=B[1]-A[1], len=Math.hypot(dx,dy)||1, nx=-dy/len*4000, ny=dx/len*4000;
      for(const [P,dash] of [[A,[]],[B,[6*dpr,5*dpr]]]){ x.setLineDash(dash); x.beginPath(); x.moveTo(P[0]-nx,P[1]-ny); x.lineTo(P[0]+nx,P[1]+ny); x.stroke(); }
      x.setLineDash([]); dot(A[0],A[1]); dot(B[0],B[1]); dot((A[0]+B[0])/2,(A[1]+B[1])/2,4); this._mh={A,B}; }
    else if(m.type==='radial'){ const g=m.g, C=this.toView(g.cx,g.cy), Rx=this.toView(g.cx+g.rx,g.cy), Ry=this.toView(g.cx,g.cy+g.ry);
      const rx=Math.hypot(Rx[0]-C[0],Rx[1]-C[1]), ry=Math.hypot(Ry[0]-C[0],Ry[1]-C[1]), an=Math.atan2(Rx[1]-C[1],Rx[0]-C[0]);
      x.beginPath(); x.ellipse(C[0],C[1],rx,ry,an,0,7); x.stroke();
      const f=Math.max(0.01,1-(m.feather??50)/100); x.setLineDash([5*dpr,5*dpr]); x.beginPath(); x.ellipse(C[0],C[1],rx*f,ry*f,an,0,7); x.stroke(); x.setLineDash([]);
      dot(C[0],C[1]); dot(Rx[0],Rx[1],4); dot(Ry[0],Ry[1],4); this._mh={C,Rx,Ry}; }
    else if(m.type==='brush'){ if(m._canvas){ // tint the painted area
        const cv=this._tint||(this._tint=document.createElement('canvas')); cv.width=m._canvas.width; cv.height=m._canvas.height; const t=cv.getContext('2d');
        t.clearRect(0,0,cv.width,cv.height); t.drawImage(m._canvas,0,0); t.globalCompositeOperation='source-in'; t.fillStyle='rgba(230,60,50,.38)'; t.fillRect(0,0,cv.width,cv.height); t.globalCompositeOperation='source-over';
        if(!Engine.cropMode && !this.P().angle && !this.P().rot && !this.P().flip){ const A=this.toView(0,0), B=this.toView(1,1); x.drawImage(cv,A[0],A[1],B[0]-A[0],B[1]-A[1]); } }
      if(this._cursor){ const [cx,cy]=this._cursor; const A=this.toView(0,0), B=this.toView(1,1); const r=this.brush.size/2/1024*Math.max(Math.abs(B[0]-A[0]),Math.abs(B[1]-A[1]));
        x.beginPath(); x.arc(cx,cy,Math.max(3,r),0,7); x.stroke(); } }
    x.restore();
  },
  maskPointer(type,e,el){
    if(!this.maskEdit||!Engine.src) return false; const m=this.mask(); if(!m) return false;
    const L=this.host._lastL, b=el.getBoundingClientRect(), dpr=L.dpr, px=(e.clientX-b.left)*dpr, py=(e.clientY-b.top)*dpr, S=this.toSrc(e.clientX,e.clientY,el);
    if(type==='hover'){ if(m.type==='brush'){ this._cursor=[px,py]; this.overlay(); } return false; }
    if(type==='down'){
      this._mdrag=null; const near=(P,r=14)=>P&&Math.hypot(P[0]-px,P[1]-py)<r*dpr;
      if(m.type==='brush'){ this._mdrag={k:'paint',erase:this.brush.erase||e.altKey}; this.paint(m,S,true); return true; }
      const h=this._mh||{};
      if(m.type==='linear'){ const mid=h.A&&[(h.A[0]+h.B[0])/2,(h.A[1]+h.B[1])/2];
        this._mdrag = near(h.A)?{k:'A'} : near(h.B)?{k:'B'} : near(mid,18)?{k:'move',s:S,g:Object.assign({},m.g)} : {k:'new',s:S}; }
      else if(m.type==='radial'){ this._mdrag = near(h.Rx)?{k:'rx'} : near(h.Ry)?{k:'ry'} : near(h.C,22)?{k:'move',s:S,g:Object.assign({},m.g)} : {k:'newR',s:S}; }
      return true;
    }
    if(type==='move' && this._mdrag){ const d=this._mdrag, g=m.g;
      if(d.k==='paint'){ this._cursor=[px,py]; this.paint(m,S,false,d.erase); }
      else if(d.k==='A'){ g.x0=S.x; g.y0=S.y; } else if(d.k==='B'){ g.x1=S.x; g.y1=S.y; }
      else if(d.k==='move'){ const dx=S.x-d.s.x, dy=S.y-d.s.y; if(m.type==='linear') Object.assign(g,{x0:d.g.x0+dx,y0:d.g.y0+dy,x1:d.g.x1+dx,y1:d.g.y1+dy}); else Object.assign(g,{cx:d.g.cx+dx,cy:d.g.cy+dy}); }
      else if(d.k==='new'){ Object.assign(g,{x0:d.s.x,y0:d.s.y,x1:S.x,y1:S.y}); }
      else if(d.k==='rx'){ g.rx=Math.max(.005,Math.hypot(S.x-g.cx,(S.y-g.cy)*Engine.src.h/Engine.src.w)); }
      else if(d.k==='ry'){ g.ry=Math.max(.005,Math.hypot((S.x-g.cx)*Engine.src.w/Engine.src.h,S.y-g.cy)); }
      else if(d.k==='newR'){ g.cx=d.s.x; g.cy=d.s.y; g.rx=Math.max(.005,Math.abs(S.x-d.s.x)); g.ry=Math.max(.005,Math.abs(S.y-d.s.y)); }
      Engine.dirty=true; this.host.changed(); this.overlay(); return true; }
    if(type==='up' && this._mdrag){ const d=this._mdrag; this._mdrag=null; if(d.k==='paint'){ m.data=m._canvas.toDataURL('image/png'); this._last=null; }
      this.host.commit(); this.host.changed(); this.overlay(); return true; }
    return false;
  },
  paint(m,S,first,erase){
    if(!m._canvas||!S) return; const c=m._canvas, x=c.getContext('2d'), X=S.x*c.width, Y=S.y*c.height;
    const R=Math.max(1.5,this.brush.size/2*Math.max(c.width,c.height)/1024);
    x.globalCompositeOperation=erase?'destination-out':'source-over';
    const dab=(px,py)=>{ const g=x.createRadialGradient(px,py,0,px,py,R); const a=this.brush.flow/100*.5; g.addColorStop(0,`rgba(255,255,255,${a})`); g.addColorStop(.55,`rgba(255,255,255,${a*.8})`); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.beginPath(); x.arc(px,py,R,0,7); x.fill(); };
    if(first||!this._last) dab(X,Y); else { const [lx,ly]=this._last, d=Math.hypot(X-lx,Y-ly), n=Math.max(1,Math.ceil(d/(R*.25))); for(let i=1;i<=n;i++) dab(lx+(X-lx)*i/n,ly+(Y-ly)*i/n); }
    this._last=[X,Y]; x.globalCompositeOperation='source-over'; m.ver=(m.ver||0)+1; Engine.dirty=true;
  },
  buildMaskPanel(root,open=false){
    const H=this.host, P=()=>this.P();
    const b=UI.panel(root,'pMasks','Masks',open,()=>{ P().masks=[]; this.maskSel=null; H.changed(); H.commit(); this.renderMasks(); this.overlay(); });
    const row=document.createElement('div'); row.className='btnrow'; b.appendChild(row);
    UI.button(row,'+ Gradient',()=>this.addMask('linear')); UI.button(row,'+ Radial',()=>this.addMask('radial')); UI.button(row,'+ Brush',()=>this.addMask('brush'));
    this._maskBody=document.createElement('div'); b.appendChild(this._maskBody); this.renderMasks();
  },
  renderMasks(){
    const el=this._maskBody; if(!el) return; el.innerHTML=''; const H=this.host, ms=this.masks();
    if(!ms.length){ UI.note(el,'Gradient for skies, radial to lift a face, brush to dodge and burn. Adjustments happen before the film, like dodging in the darkroom.'); return; }
    const list=document.createElement('div'); list.className='maskList'; el.appendChild(list);
    ms.forEach(m=>{ const d=document.createElement('div'); d.className='mrow'+(m.id===this.maskSel?' on':'')+(m.on===false?' off':'');
      d.innerHTML=`<span class="mi">${m.type==='linear'?'▤':m.type==='radial'?'◎':'✎'}</span><span class="mn"></span><button class="me" title="Show / hide">${m.on===false?'○':'●'}</button><button class="md" title="Delete">×</button>`;
      d.querySelector('.mn').textContent=m.name;
      d.onclick=e=>{ if(e.target.tagName==='BUTTON') return; this.maskSel=m.id; this.setMaskEdit(true); this.renderMasks(); };
      d.querySelector('.me').onclick=()=>{ m.on=m.on===false; H.changed(); H.commit(); this.renderMasks(); };
      d.querySelector('.md').onclick=()=>this.removeMask(m.id);
      list.appendChild(d); });
    const m=this.mask(); if(!m) return;
    const sub=document.createElement('div'); sub.className='msub'; el.appendChild(sub);
    const A=(k,label,o)=>UI.slider(sub,'mk_'+k,label,Object.assign({def:0,get:()=>m.adj[k]||0,set:v=>{ m.adj[k]=v; H.changed(); },commit:()=>H.commit()},o));
    A('ev','Exposure',{min:-3,max:3,step:0.01,fmt:x=>(x>0?'+':'')+x.toFixed(2)});
    A('contrast','Contrast',{min:-100,max:100,step:1});
    A('temp','Temp',{min:-100,max:100,step:1,track:'linear-gradient(90deg,#3c6bd6,#888 50%,#e4c03a)'});
    A('tint','Tint',{min:-100,max:100,step:1,track:'linear-gradient(90deg,#3fae4a,#888 50%,#c446c0)'});
    A('sat','Saturation',{min:-100,max:100,step:1});
    UI.slider(sub,'mk_feather',m.type==='brush'?'Softness':'Feather',{min:1,max:100,step:1,def:m.type==='radial'?50:100,get:()=>m.feather,set:v=>{ m.feather=v; H.changed(); this.overlay(); },commit:()=>H.commit()});
    UI.slider(sub,'mk_amount','Amount',{min:0,max:100,step:1,def:100,get:()=>m.amount??100,set:v=>{ m.amount=v; H.changed(); },commit:()=>H.commit(),fmt:x=>Math.round(x)+'%'});
    UI.check(sub,'mk_inv','Invert',()=>!!m.invert,v=>{ m.invert=v; H.changed(); H.commit(); });
    if(m.type==='brush'){
      UI.slider(sub,'br_size','Brush size',{min:4,max:400,step:1,def:60,get:()=>this.brush.size,set:v=>{ this.brush.size=v; this.overlay(); }});
      UI.slider(sub,'br_flow','Flow',{min:5,max:100,step:1,def:60,get:()=>this.brush.flow,set:v=>{ this.brush.flow=v; }});
      UI.check(sub,'br_erase','Erase (or hold ⌥)',()=>this.brush.erase,v=>{ this.brush.erase=v; });
      const r2=document.createElement('div'); r2.className='btnrow'; sub.appendChild(r2);
      UI.button(r2,'Clear',()=>{ const c=m._canvas; c.getContext('2d').clearRect(0,0,c.width,c.height); m.data=c.toDataURL(); m.ver=(m.ver||0)+1; H.changed(); H.commit(); });
      UI.button(r2,'Fill',()=>{ const c=m._canvas, x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); m.data=c.toDataURL(); m.ver=(m.ver||0)+1; H.changed(); H.commit(); });
    }
    const r3=document.createElement('div'); r3.className='btnrow'; sub.appendChild(r3);
    UI.button(r3,this.maskEdit?'Hide overlay':'Show overlay',()=>{ this.setMaskEdit(!this.maskEdit); this.renderMasks(); });
  },

  // ------------------------------------------------------------------ crop
  aspectValue(p){ // width/height of the crop in pixels, or null for free
    if(p.aspect==='free') return null;
    const [W,H]=Engine.oriented(p);
    if(p.aspect==='orig') return W/H;
    const [a,b]=p.aspect.split(':').map(Number); let r=a/b;
    if((W>H)!==(r>1) && Math.abs(r-1)>1e-3) r=1/r;          // follow the photo's orientation
    if(p.cropPortrait!=null) r = p.cropPortrait ? Math.min(r,1/r) : Math.max(r,1/r);
    return r;
  },
  applyAspect(keepCentre=true){
    const p=this.P(); if(!Engine.src) return; const r=this.aspectValue(p); if(!r){ this.fit(); return; }
    const [W,H]=Engine.oriented(p); const c=p.crop, mx=c.x+c.w/2, my=c.y+c.h/2;
    // largest rect of ratio r inside the current crop
    let w=c.w, h=w*W/r/H; if(h>c.h){ h=c.h; w=h*H*r/W; }
    if(!keepCentre){ w=1; h=W/r/H; if(h>1){ h=1; w=H*r/W; } }
    p.crop={x:(keepCentre?mx:.5)-w/2,y:(keepCentre?my:.5)-h/2,w,h}; this.fit();
  },
  fit(){ const p=this.P(); if(!Engine.src) return;
    const c=p.crop; c.w=Math.min(1,c.w); c.h=Math.min(1,c.h); c.x=Math.min(1-c.w,Math.max(0,c.x)); c.y=Math.min(1-c.h,Math.max(0,c.y));
    p.crop=Engine.fitCrop(p,Engine.src,c); },
  rotate(dir){ const p=this.P(); p.rot=((p.rot||0)+dir+4)%4; const c=p.crop;
    p.crop = dir>0 ? {x:1-c.y-c.h,y:c.x,w:c.h,h:c.w} : {x:c.y,y:1-c.x-c.w,w:c.h,h:c.w};
    this.fit(); this.host.changed(); this.host.commit(); this.overlay(); },
  flip(){ const p=this.P(); p.flip=!p.flip; this.host.changed(); this.host.commit(); },
  resetCrop(){ const p=this.P(); Object.assign(p,{crop:{x:0,y:0,w:1,h:1},angle:0,rot:0,flip:false,aspect:'free'}); delete p.cropPortrait; this.host.changed(); this.host.commit(); UI.refresh(); this.overlay(); },
  setCropMode(on){
    if(on&&this.maskEdit) this.setMaskEdit(false);
    Engine.cropMode=on; document.body.classList.toggle('cropping',on);
    const b=document.getElementById('tbCrop'); if(b) b.classList.toggle('on',on);
    Engine.view={mode:'fit',cx:.5,cy:.5}; Engine.dirty=true;
    if(!on){ this.host.commit(); this.host.thumbSoon&&this.host.thumbSoon(80); }
    requestAnimationFrame(()=>this.overlay());
  },
  // overlay canvas over the viewer: dim outside crop, rule-of-thirds, handles
  overlay(){
    const ov=document.getElementById('cropOv'); if(!ov) return;
    const L=this.host._lastL; const showM=this.maskEdit&&this.mask()&&Engine.src&&L&&L.iw&&!this.host.compare;
    const on=(Engine.cropMode&&Engine.src&&L&&L.iw)||showM;
    ov.style.display=on?'block':'none'; if(!on) return;
    const dpr=L.dpr; if(ov.width!==L.W||ov.height!==L.H){ ov.width=L.W; ov.height=L.H; }
    const x=ov.getContext('2d'); x.clearRect(0,0,L.W,L.H);
    if(!Engine.cropMode){ this.drawMasks(x,L); return; }
    const c=this.P().crop, top=L.H-L.iy-L.ih;
    const rx=L.ix+c.x*L.iw, ry=top+c.y*L.ih, rw=c.w*L.iw, rh=c.h*L.ih; this._r={rx,ry,rw,rh,L,top};
    x.fillStyle='rgba(0,0,0,.62)'; x.beginPath(); x.rect(0,0,L.W,L.H); x.rect(rx,ry,rw,rh); x.fill('evenodd');
    x.strokeStyle='rgba(255,255,255,.35)'; x.lineWidth=1*dpr; x.beginPath();
    const g=this._dragging&&this._dragKind==='angle'?8:3;
    for(let i=1;i<g;i++){ x.moveTo(rx+rw*i/g,ry); x.lineTo(rx+rw*i/g,ry+rh); x.moveTo(rx,ry+rh*i/g); x.lineTo(rx+rw,ry+rh*i/g); } x.stroke();
    x.strokeStyle='#fff'; x.lineWidth=1.2*dpr; x.strokeRect(rx,ry,rw,rh);
    x.lineWidth=3*dpr; const k=18*dpr; x.beginPath();
    for(const [px,py,sx,sy] of [[rx,ry,1,1],[rx+rw,ry,-1,1],[rx,ry+rh,1,-1],[rx+rw,ry+rh,-1,-1]]){ x.moveTo(px,py+sy*k); x.lineTo(px,py); x.lineTo(px+sx*k,py); }
    for(const [px,py,h] of [[rx+rw/2,ry,1],[rx+rw/2,ry+rh,1],[rx,ry+rh/2,0],[rx+rw,ry+rh/2,0]]){ if(h){ x.moveTo(px-k/2,py); x.lineTo(px+k/2,py); } else { x.moveTo(px,py-k/2); x.lineTo(px,py+k/2); } }
    x.stroke();
    const [W,H]=Engine.oriented(this.P()); x.font=`${11*dpr}px -apple-system,sans-serif`; x.fillStyle='rgba(255,255,255,.8)';
    x.fillText(`${Math.round(c.w*W)} × ${Math.round(c.h*H)}${this.P().angle?'   '+(this.P().angle>0?'+':'')+this.P().angle.toFixed(1)+'°':''}`,rx+6*dpr,ry+rh+16*dpr);
  },
  // pointer handling on the viewer while cropping. Returns true if the event was consumed.
  cropPointer(type,e,el){
    if(!Engine.cropMode||!this._r) return false;
    const R=this._r, L=R.L, dpr=L.dpr, b=el.getBoundingClientRect(); const px=(e.clientX-b.left)*dpr, py=(e.clientY-b.top)*dpr;
    if(type==='down'){
      const m=12*dpr, inX=px>R.rx-m&&px<R.rx+R.rw+m, inY=py>R.ry-m&&py<R.ry+R.rh+m;
      const l=Math.abs(px-R.rx)<m, r=Math.abs(px-R.rx-R.rw)<m, t=Math.abs(py-R.ry)<m, bo=Math.abs(py-R.ry-R.rh)<m;
      let kind = (inX&&inY) ? ((l||r||t||bo) ? 'edge' : 'move') : 'angle';
      this._dragging=true; this._dragKind=kind; this._edges={l:l&&inY,r:r&&inY,t:t&&inX,b:bo&&inX};
      this._start={px,py,crop:Object.assign({},this.P().crop),angle:this.P().angle,a0:Math.atan2(py-(R.top+L.ih/2),px-(L.ix+L.iw/2))};
      return true;
    }
    if(type==='move' && this._dragging){
      const p=this.P(), s=this._start, du=(px-s.px)/L.iw, dv=(py-s.py)/L.ih;
      if(this._dragKind==='move'){ p.crop=Object.assign({},s.crop,{x:s.crop.x+du,y:s.crop.y+dv}); const c=p.crop; c.x=Math.min(1-c.w,Math.max(0,c.x)); c.y=Math.min(1-c.h,Math.max(0,c.y));
        if(!Engine.cropInside(p,Engine.src,c)) p.crop=this._lastOk||s.crop; }
      else if(this._dragKind==='angle'){ const a=Math.atan2(py-(R.top+L.ih/2),px-(L.ix+L.iw/2)); let d=(a-s.a0)*180/Math.PI; if(d>180) d-=360; if(d<-180) d+=360;
        p.angle=Math.max(-45,Math.min(45,s.angle+d)); this.fit(); UI.refresh(); }
      else { const E=this._edges, c0=s.crop; let x0=c0.x, y0=c0.y, x1=c0.x+c0.w, y1=c0.y+c0.h;
        if(E.l) x0=Math.min(x1-.02,Math.max(0,x0+du)); if(E.r) x1=Math.max(x0+.02,Math.min(1,x1+du));
        if(E.t) y0=Math.min(y1-.02,Math.max(0,y0+dv)); if(E.b) y1=Math.max(y0+.02,Math.min(1,y1+dv));
        const r=this.aspectValue(p);
        if(r){ const [W,H]=Engine.oriented(p); let w=x1-x0, h=y1-y0;
          if(E.l||E.r){ h=w*W/r/H; } else { w=h*H*r/W; }
          if(E.t&&!E.b) y0=y1-h; else if(!E.t&&!E.b) y0=(c0.y+c0.h/2)-h/2; y1=y0+h;
          if(E.l&&!E.r) x0=x1-w; else if(!E.l&&!E.r) x0=(c0.x+c0.w/2)-w/2; x1=x0+w;
          if(x0<0||y0<0||x1>1||y1>1){ p.crop=this._lastOk||c0; } else p.crop={x:x0,y:y0,w,h}; }
        else p.crop={x:x0,y:y0,w:x1-x0,h:y1-y0};
        if(!Engine.cropInside(p,Engine.src,p.crop)) p.crop=this._lastOk||c0; }
      this._lastOk=Object.assign({},p.crop); Engine.dirty=true; this.host.changed(); this.overlay(); return true;
    }
    if(type==='up' && this._dragging){ this._dragging=false; this._lastOk=null; this.host.commit(); this.overlay(); return true; }
    return false;
  },
  cropCursor(e,el){ if(!Engine.cropMode||!this._r||this._dragging) return; const R=this._r, dpr=R.L.dpr, b=el.getBoundingClientRect(); const px=(e.clientX-b.left)*dpr, py=(e.clientY-b.top)*dpr, m=12*dpr;
    const l=Math.abs(px-R.rx)<m, r=Math.abs(px-R.rx-R.rw)<m, t=Math.abs(py-R.ry)<m, bo=Math.abs(py-R.ry-R.rh)<m, inside=px>R.rx&&px<R.rx+R.rw&&py>R.ry&&py<R.ry+R.rh;
    el.style.cursor = (l&&t||r&&bo)?'nwse-resize':(r&&t||l&&bo)?'nesw-resize':(l||r)?'ew-resize':(t||bo)?'ns-resize':inside?'move':'alias'; },

  buildCropPanel(root,open=false){
    const H=this.host, P=()=>this.P();
    const b=UI.panel(root,'pCrop','Crop & Straighten',open,()=>this.resetCrop());
    const row=document.createElement('div'); row.className='btnrow'; b.appendChild(row);
    UI.button(row,'Crop  (R)',()=>this.setCropMode(!Engine.cropMode),'tbtn accent').id='cropToolBtn';
    UI.button(row,'⟲',()=>this.rotate(-1),'tbtn').title='Rotate left';
    UI.button(row,'⟳',()=>this.rotate(1),'tbtn').title='Rotate right';
    UI.button(row,'⇋',()=>this.flip(),'tbtn').title='Flip horizontal';
    UI.select(b,'aspect','Aspect',()=>ASPECTS,()=>P().aspect,v=>{ P().aspect=v; this.applyAspect(true); H.changed(); H.commit(); this.overlay(); });
    UI.seg(b,'cropOrient','',[['l','Landscape'],['p','Portrait']],()=>{ const r=this.aspectValue(P()); return r&&r<1?'p':'l'; },v=>{ P().cropPortrait=v==='p'; this.applyAspect(false); H.changed(); H.commit(); this.overlay(); UI.refresh(); });
    UI.slider(b,'angle','Straighten',{min:-45,max:45,step:0.1,def:0,get:()=>P().angle,set:v=>{ P().angle=v; this.fit(); H.changed(); this.overlay(); },commit:()=>H.commit(),fmt:x=>(x>0?'+':'')+x.toFixed(1)+'°'});
    UI.note(b,'Drag inside the frame to move it, drag edges to resize, drag outside to rotate. Enter or R to finish.');
  },

  // ------------------------------------------------------------------ tone curve
  buildCurvePanel(root,open=false){
    const H=this.host, P=()=>this.P();
    const b=UI.panel(root,'pCurve','Tone Curve',open,()=>{ P().curve=cloneParams(DEFAULTS.curve); H.changed(); H.commit(); draw(); });
    let ch='m';
    UI.seg(b,'curveCh','Channel',[['m','RGB'],['r','Red'],['g','Green'],['b','Blue']],()=>ch,v=>{ ch=v; draw(); });
    const wrap=document.createElement('div'); wrap.className='curveBox'; b.appendChild(wrap);
    const cv=document.createElement('canvas'); wrap.appendChild(cv);
    UI.note(b,'Click to add a point, drag to shape, double-click a point to remove it.');
    const col={m:'#ddd',r:'#ff5a4e',g:'#5ad36b',b:'#5b8cff'};
    let drag=-1;
    const pts=()=>P().curve[ch];
    const size=()=>{ const dpr=window.devicePixelRatio||1, w=Math.max(120,wrap.clientWidth||236); cv.width=w*dpr; cv.height=w*dpr; cv.style.width=w+'px'; cv.style.height=w+'px'; return [w*dpr,dpr]; };
    const draw=()=>{
      const [S,dpr]=size(), x=cv.getContext('2d'); x.clearRect(0,0,S,S);
      x.fillStyle='#161616'; x.fillRect(0,0,S,S);
      // histogram behind the curve
      const h=Engine.src&&Engine.histogram?Engine._lastHist:null;
      if(h){ const a=ch==='m'?h.y:h[ch]; let mx=1; for(let i=2;i<254;i++) mx=Math.max(mx,a[i]); x.fillStyle='rgba(255,255,255,.07)'; x.beginPath(); x.moveTo(0,S);
        for(let i=0;i<256;i++) x.lineTo(i/255*S,S-Math.min(1,a[i]/mx)*S*.9); x.lineTo(S,S); x.fill(); }
      x.strokeStyle='#2c2c2c'; x.lineWidth=1*dpr; x.beginPath(); for(let i=1;i<4;i++){ x.moveTo(S*i/4,0); x.lineTo(S*i/4,S); x.moveTo(0,S*i/4); x.lineTo(S,S*i/4); } x.stroke();
      x.strokeStyle='#3a3a3a'; x.beginPath(); x.moveTo(0,S); x.lineTo(S,0); x.stroke();
      Engine.curveLUT(P()); const f=Engine.curveFn(pts());
      x.strokeStyle=col[ch]; x.lineWidth=1.6*dpr; x.beginPath();
      for(let i=0;i<=200;i++){ const u=i/200, v=Math.min(1,Math.max(0,f(u))); i?x.lineTo(u*S,(1-v)*S):x.moveTo(u*S,(1-v)*S); } x.stroke();
      x.fillStyle=col[ch]; pts().forEach(q=>{ x.beginPath(); x.arc(q[0]*S,(1-q[1])*S,4.5*dpr,0,7); x.fill(); });
      const box=b.closest('.panel'); if(box) box.classList.toggle('changed',!Engine.curveIsIdentity(P()));
    };
    const pos=e=>{ const r=cv.getBoundingClientRect(); return [Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,1-(e.clientY-r.top)/r.height))]; };
    const hit=(u,v)=>{ const r=cv.getBoundingClientRect(), tol=10/r.width; return pts().findIndex(q=>Math.hypot(q[0]-u,q[1]-v)<tol); };
    cv.addEventListener('pointerdown',e=>{ const [u,v]=pos(e); let i=hit(u,v);
      if(i<0){ const a=pts(); a.push([u,v]); a.sort((p,q)=>p[0]-q[0]); i=a.findIndex(q=>q[0]===u&&q[1]===v); }
      drag=i; cv.setPointerCapture(e.pointerId); P().curve=Object.assign({},P().curve); Engine.curveKey=''; H.changed(); draw(); });
    cv.addEventListener('pointermove',e=>{ if(drag<0) return; const [u,v]=pos(e); const a=pts(); const lo=drag>0?a[drag-1][0]+.01:0, hi=drag<a.length-1?a[drag+1][0]-.01:1;
      a[drag]=[drag===0?Math.min(u,hi):drag===a.length-1?Math.max(u,lo):Math.min(hi,Math.max(lo,u)),v]; Engine.curveKey=''; H.changed(); draw(); });
    cv.addEventListener('pointerup',()=>{ if(drag>=0){ drag=-1; H.commit(); } });
    cv.addEventListener('dblclick',e=>{ const [u,v]=pos(e); const i=hit(u,v); const a=pts(); if(i>0&&i<a.length-1){ a.splice(i,1); Engine.curveKey=''; H.changed(); H.commit(); draw(); } });
    UI.sliders.curve=draw; new ResizeObserver(()=>draw()).observe(wrap);
    this.drawCurve=draw;
  },

  // ------------------------------------------------------------------ HSL / colour mixer
  buildHSLPanel(root,open=false){
    const H=this.host, P=()=>this.P();
    const b=UI.panel(root,'pHSL','Color Mixer',open,()=>{ ['hslH','hslS','hslL'].forEach(k=>P()[k]=DEFAULTS[k].slice()); H.changed(); H.commit(); UI.refresh(); });
    let mode='hslS'; const host=document.createElement('div');
    UI.seg(b,'hslMode','',[['hslH','Hue'],['hslS','Saturation'],['hslL','Luminance']],()=>mode,v=>{ mode=v; build(); });
    b.appendChild(host);
    const sw=['#e8483c','#f08a2c','#e8cf3a','#56b84a','#3fc6c4','#3f6ee6','#8c55e0','#d74fb4'];
    const build=()=>{ host.innerHTML='';
      HSL_BANDS.forEach(([name],i)=>{
        const track = mode==='hslH' ? `linear-gradient(90deg,${sw[(i+7)%8]},${sw[i]},${sw[(i+1)%8]})` : mode==='hslS' ? `linear-gradient(90deg,#808080,${sw[i]})` : `linear-gradient(90deg,#111,${sw[i]},#fff)`;
        UI.slider(host,'hsl_'+mode+i,name,{min:-100,max:100,step:1,def:0,track,get:()=>P()[mode][i],set:v=>{ P()[mode]=P()[mode].slice(); P()[mode][i]=v; H.changed(); },commit:()=>H.commit()});
      }); };
    build();
  },

  // ------------------------------------------------------------------ colour grading (3-way wheels)
  buildGradingPanel(root,open=false){
    const H=this.host, P=()=>this.P();
    const keys=['gShH','gShS','gShL','gMidH','gMidS','gMidL','gHiH','gHiS','gHiL','gBlend','gBalance'];
    const b=UI.panel(root,'pGrade','Color Grading',open,()=>{ keys.forEach(k=>P()[k]=DEFAULTS[k]); H.changed(); H.commit(); UI.refresh(); });
    const wheels=document.createElement('div'); wheels.className='wheels'; b.appendChild(wheels);
    [['gSh','Shadows'],['gMid','Midtones'],['gHi','Highlights']].forEach(([k,label])=>{
      const w=document.createElement('div'); w.className='wheel'; w.innerHTML=`<canvas></canvas><span>${label}</span>`; wheels.appendChild(w);
      const cv=w.querySelector('canvas'); const D=84, dpr=window.devicePixelRatio||1; cv.width=D*dpr; cv.height=D*dpr; cv.style.width=D+'px'; cv.style.height=D+'px';
      const draw=()=>{ const x=cv.getContext('2d'), R=D*dpr/2; x.clearRect(0,0,2*R,2*R);
        const img=x.createImageData(2*R,2*R);
        for(let j=0;j<2*R;j++) for(let i=0;i<2*R;i++){ const dx=i-R, dy=R-j, r=Math.hypot(dx,dy)/R; if(r>1) continue;
          const h=Math.atan2(dy,dx)*180/Math.PI; const c=Tools.hueRGB(h,r); const o=(j*2*R+i)*4; img.data.set([c[0]*255,c[1]*255,c[2]*255,255],o); }
        x.putImageData(img,0,0);
        const h=P()[k+'H']*Math.PI/180, s=P()[k+'S']/100; const px=R+Math.cos(h)*s*R*.95, py=R-Math.sin(h)*s*R*.95;
        x.strokeStyle='#000'; x.lineWidth=3*dpr; x.beginPath(); x.arc(px,py,5*dpr,0,7); x.stroke(); x.strokeStyle='#fff'; x.lineWidth=1.5*dpr; x.stroke();
        w.classList.toggle('changed',!!(P()[k+'S']||P()[k+'L'])); };
      const set=e=>{ const r=cv.getBoundingClientRect(); const dx=e.clientX-r.left-r.width/2, dy=r.height/2-(e.clientY-r.top); let s=Math.min(1,Math.hypot(dx,dy)/(r.width/2*.95));
        if(e.shiftKey) s=P()[k+'S']/100;   // shift: change hue only
        P()[k+'H']=(Math.atan2(dy,dx)*180/Math.PI+360)%360; P()[k+'S']=Math.round(s*100); H.changed(); draw(); };
      let down=false;
      cv.addEventListener('pointerdown',e=>{ down=true; cv.setPointerCapture(e.pointerId); set(e); });
      cv.addEventListener('pointermove',e=>{ if(down) set(e); });
      cv.addEventListener('pointerup',()=>{ if(down){ down=false; H.commit(); } });
      cv.addEventListener('dblclick',()=>{ P()[k+'S']=0; P()[k+'L']=0; H.changed(); H.commit(); UI.refresh(); });
      UI.sliders['wheel'+k]=draw; draw();
      UI.slider(w,k+'L','',{min:-100,max:100,step:1,def:0,get:()=>P()[k+'L'],set:v=>{ P()[k+'L']=v; H.changed(); draw(); },commit:()=>H.commit(),track:'linear-gradient(90deg,#111,#eee)'});
    });
    UI.slider(b,'gBlend','Blending',{min:0,max:100,step:1,def:50,get:()=>P().gBlend,set:v=>{ P().gBlend=v; H.changed(); },commit:()=>H.commit()});
    UI.slider(b,'gBalance','Balance',{min:-100,max:100,step:1,def:0,get:()=>P().gBalance,set:v=>{ P().gBalance=v; H.changed(); },commit:()=>H.commit()});
    UI.note(b,'Drag in a wheel to tint that tonal range (⇧ keeps strength, double-click resets). The slider under each wheel brightens or darkens it.');
  },
  hueRGB(h,s){ // display colour for the wheel: OKLCh-ish hue at chroma s, fixed lightness
    const a=Math.cos(h*Math.PI/180)*.13*s, b=Math.sin(h*Math.PI/180)*.13*s, L=.72;
    const l_=L+.3963377774*a+.2158037573*b, m_=L-.1055613458*a-.0638541728*b, s_=L-.0894841775*a-1.2914855480*b;
    const l=l_**3, m=m_**3, q=s_**3;
    const r=4.0767416621*l-3.3077115913*m+.2309699292*q, g=-1.2684380046*l+2.6097574011*m-.3413193965*q, bb=-.0041960863*l-.7034186147*m+1.7076147010*q;
    const e=v=>{ v=Math.min(1,Math.max(0,v)); return v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055; };
    return [e(r),e(g),e(bb)];
  },

  // ------------------------------------------------------------------ which areas have edits (tab / panel dots)
  GROUPS:{ film:['paper','format','filmAmt','autoExp','push'], light:['ev','contrast','highlights','shadows','whites','blacks','hlExpand','curve'],
    color:['temp','tint','vibrance','saturation','hslH','hslS','hslL','gShS','gShL','gMidS','gMidL','gHiS','gHiL'],
    crop:['crop','angle','rot','flip'], effects:['grain','grainSize','grainRough','halation','glow','falloff','border','sharpen','nr','nrColor'], masks:['masks'] },
  edited(p){ const out={}; const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    for(const g in this.GROUPS) out[g]=this.GROUPS[g].some(k=>{ const v=p[k], d=DEFAULTS[k]; if(typeof v==='number'&&typeof d==='number') return Math.abs(v-d)>1e-6; return k==='paper'?false:!same(v,d); });
    out.film = out.film || (p.paper!=null && p.paper!==Engine.stock(p.stock).papers[0].id);
    return out; },
  // ------------------------------------------------------------------ stock defaults (instant films bring their frame, softness, aspect)
  // returns a copy of p switched to stock id, with the new stock's defaults applied where the user hasn't changed things
  stockParams(p,id,applyAspect){
    const prev=Engine.stock(p.stock), next=Engine.stock(id), o=cloneParams(p); o.stock=id; o.paper=null;
    const pd=prev.defaults||{}, nd=next.defaults||{}, same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    for(const k in pd){ if(k==='aspect'||k==='frameTone') continue; if(!(k in nd) && same(o[k],pd[k])) o[k]=cloneParams(DEFAULTS[k]); }
    if(Borders.isInstant(o.border) && !Borders.isInstant(nd.border||'none') && !('border' in nd)) o.border='none';
    for(const k in nd){ if(k==='aspect'){ continue; } if(k==='frameTone'){ continue; }
      if(same(o[k],DEFAULTS[k]) || same(o[k],pd[k]) || k==='border') o[k]=cloneParams(nd[k]); }
    const untouched = o.aspect==='free' ? same(o.crop,DEFAULTS.crop) : o.aspect===pd.aspect;
    if(applyAspect && untouched && !o.angle){ if(nd.aspect) o.aspect=nd.aspect; else if(pd.aspect){ o.aspect='free'; o.crop=cloneParams(DEFAULTS.crop); } }
    return o;
  },
  // ------------------------------------------------------------------ preset amount
  // a = 0 → neutral (defaults, film at 0 strength), 1 → the preset exactly, >1 → exaggerated.
  // Only keys the preset contains are touched; exposure / WB / crop stay with the photo.
  blendPreset(cur,preset,a){
    const out=cloneParams(cur), lerp=(x,y)=>x+(y-x)*a;
    for(const k in preset){ const pv=preset[k], dv=DEFAULTS[k];
      if(k==='filmAmt') continue;
      if(typeof pv==='number' && typeof dv==='number') out[k]= k.endsWith('H')&&k.startsWith('g') ? pv : lerp(dv,pv);
      else if(Array.isArray(pv) && Array.isArray(dv) && typeof pv[0]==='number') out[k]=pv.map((v,i)=>lerp(dv[i]||0,v));
      else if(k==='curve'){ out.curve={}; for(const ch in pv) out.curve[ch]=pv[ch].map(([x,y])=>[x,Math.min(1,Math.max(0,x+(y-x)*a))]); }
      else out[k]=cloneParams(pv); }
    out.filmAmt=Math.max(0,Math.min(100,(preset.filmAmt??100)*a));
    return out;
  },
  // ------------------------------------------------------------------ preset files (.darkroom.json) — portable between Mac and phone
  presetFile(presets){ return JSON.stringify({type:'splat-darkroom-presets',v:1,author:'Daniel S. Workman',presets},null,1); },
  parsePresetFile(text){ const d=JSON.parse(text); const a=Array.isArray(d)?d:(d.presets||(d.settings?[d]:[]));
    return a.filter(p=>p&&p.name&&p.settings).map(p=>({name:String(p.name).slice(0,60),settings:p.settings,t:p.t||0,id:p.id||('u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5))})); },
  mergePresets(list,incoming){ let added=0, changed=0; incoming.forEach(p=>{ const i=list.findIndex(q=>q.name===p.name);
      if(i>=0){ if((p.t||0)>(list[i].t||0) || (!p.t&&!list[i].t&&JSON.stringify(p.settings)!==JSON.stringify(list[i].settings))){ list[i].settings=p.settings; list[i].t=p.t; changed++; } } else { list.push(p); added++; } }); this._mergeChanged=changed; return added; },
};
