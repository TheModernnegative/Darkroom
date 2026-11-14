// "How to film a 3D scan" — a 30-second animated guide drawn on a canvas (no video file needed).
const Tutorial = {
  T:30, t:0, playing:false, last:0,
  scenes:[
    [0,4,'title'], [4,10,'orbit'], [10,15,'heights'], [15,20,'settings'], [20,27,'donts'], [27,30,'next'],
  ],
  open(){
    let m=document.getElementById('tutorial');
    if(!m){ m=document.createElement('div'); m.id='tutorial'; m.className='modal';
      m.innerHTML=`<div class="sheet tut"><canvas id="tutCv" width="1280" height="720"></canvas>
        <div class="tutBar"><button class="tbtn" id="tutPlay">❚❚</button><input type="range" id="tutSeek" min="0" max="30" step="0.05" value="0"><span id="tutTime">0:00</span><button class="tbtn" id="tutClose">Close</button></div></div>`;
      document.body.appendChild(m);
      m.querySelector('#tutPlay').onclick=()=>{ this.playing=!this.playing; if(this.playing&&this.t>=this.T) this.t=0; this.last=performance.now(); this.ui(); if(this.playing) requestAnimationFrame(f=>this.tick(f)); };
      m.querySelector('#tutClose').onclick=()=>this.close();
      m.querySelector('#tutSeek').oninput=e=>{ this.t=+e.target.value; this.draw(); this.ui(); };
      m.addEventListener('pointerdown',e=>{ if(e.target===m) this.close(); });
      document.addEventListener('keydown',e=>{ if(!m.classList.contains('on')) return; if(e.key==='Escape'){ e.stopPropagation(); this.close(); } if(e.key===' '){ e.preventDefault(); e.stopPropagation(); m.querySelector('#tutPlay').click(); } },true);
    }
    m.classList.add('on'); this.t=0; this.playing=true; this.last=performance.now(); this.ui(); requestAnimationFrame(f=>this.tick(f));
  },
  close(){ this.playing=false; const m=document.getElementById('tutorial'); if(m) m.classList.remove('on'); },
  ui(){ const m=document.getElementById('tutorial'); if(!m) return; m.querySelector('#tutPlay').textContent=this.playing?'❚❚':'▶';
    m.querySelector('#tutSeek').value=this.t; const s=Math.floor(this.t); m.querySelector('#tutTime').textContent=`0:${String(s).padStart(2,'0')} / 0:30`; },
  tick(now){ if(!this.playing) return; this.t+= (now-this.last)/1000; this.last=now;
    if(this.t>=this.T){ this.t=this.T; this.playing=false; } this.draw(); this.ui(); if(this.playing) requestAnimationFrame(f=>this.tick(f)); },

  // ------------------------------------------------------------------ drawing helpers
  C:{bg:'#141414',ink:'#ecebe7',dim:'#8b8a86',acc:'#e0533d',ok:'#5ccf7a',bad:'#ff5c4d',sub:'#2a2a2a'},
  ease(x){ x=Math.max(0,Math.min(1,x)); return x*x*(3-2*x); },
  text(x,s,X,Y,size=40,col,weight=600,align='center',alpha=1){ x.save(); x.globalAlpha=alpha; x.fillStyle=col||this.C.ink; x.font=`${weight} ${size}px -apple-system,"Helvetica Neue",Arial,sans-serif`; x.textAlign=align; x.textBaseline='middle'; x.fillText(s,X,Y); x.restore(); },
  subject(x,X,Y,s=1){ // a vase on a little plinth
    x.save(); x.translate(X,Y); x.scale(s,s);
    x.fillStyle='#3a3a3a'; x.fillRect(-46,40,92,16);
    const g=x.createLinearGradient(-40,0,40,0); g.addColorStop(0,'#b5552f'); g.addColorStop(.5,'#e98a55'); g.addColorStop(1,'#93401f'); x.fillStyle=g;
    x.beginPath(); x.moveTo(-14,-58); x.bezierCurveTo(-14,-30,-44,-20,-40,8); x.bezierCurveTo(-36,34,-20,40,0,40); x.bezierCurveTo(20,40,36,34,40,8); x.bezierCurveTo(44,-20,14,-30,14,-58); x.closePath(); x.fill();
    x.fillStyle='#6b2a12'; x.beginPath(); x.ellipse(0,-58,14,5,0,0,7); x.fill(); x.restore(); },
  phone(x,X,Y,ang,s=1,col){ x.save(); x.translate(X,Y); x.rotate(ang); x.scale(s,s);
    x.fillStyle=col||'#f2f2f2'; x.beginPath(); if(x.roundRect) x.roundRect(-14,-24,28,48,6); else x.rect(-14,-24,28,48); x.fill();
    x.fillStyle='#111'; x.beginPath(); x.arc(0,-14,5,0,7); x.fill();
    // field of view cone toward the subject (-y direction)
    x.fillStyle='rgba(224,83,61,.16)'; x.beginPath(); x.moveTo(0,-24); x.lineTo(-70,-190); x.lineTo(70,-190); x.closePath(); x.fill(); x.restore(); },
  caption(x,s,alpha=1){ const W=x.canvas.width; x.save(); x.globalAlpha=alpha; x.fillStyle='rgba(0,0,0,.55)'; x.fillRect(0,630,W,90); x.restore(); this.text(x,s,W/2,675,34,this.C.ink,500,'center',alpha); },
  badge(x,ok,X,Y,s=1){ x.save(); x.translate(X,Y); x.scale(s,s); x.fillStyle=ok?this.C.ok:this.C.bad; x.beginPath(); x.arc(0,0,26,0,7); x.fill();
    x.strokeStyle='#fff'; x.lineWidth=6; x.lineCap='round'; x.beginPath(); if(ok){ x.moveTo(-11,1); x.lineTo(-3,9); x.lineTo(12,-8); } else { x.moveTo(-9,-9); x.lineTo(9,9); x.moveTo(9,-9); x.lineTo(-9,9); } x.stroke(); x.restore(); },

  draw(){
    const cv=document.getElementById('tutCv'); if(!cv) return; const x=cv.getContext('2d'), W=cv.width, H=cv.height, C=this.C, t=this.t;
    x.fillStyle=C.bg; x.fillRect(0,0,W,H);
    const sc=this.scenes.find(s=>t>=s[0]&&t<s[1])||this.scenes[this.scenes.length-1], lt=t-sc[0], dur=sc[1]-sc[0];
    const fade=Math.min(1,lt/0.4,(dur-lt)/0.4+ (sc[2]==='next'?1:0));
    x.save(); x.globalAlpha=Math.max(0,fade);
    this['s_'+sc[2]](x,W,H,lt,dur);
    x.restore();
    // progress dots
    this.scenes.forEach((s,i)=>{ x.fillStyle= t>=s[0] ? C.acc : '#444'; x.beginPath(); x.arc(W/2-75+i*30,30,6,0,7); x.fill(); });
  },
  s_title(x,W,H,lt){
    this.subject(x,W/2,H/2-40,1.6+0.05*Math.sin(lt*2));
    this.text(x,'Filming a 3D scan',W/2,H/2+120,64,this.C.ink,700);
    this.text(x,'30 seconds · one phone · one walk around your subject',W/2,H/2+180,30,this.C.dim,500);
  },
  s_orbit(x,W,H,lt,dur){ // top-down: walk a full circle, subject centred
    const cx=W/2, cy=H/2-20, R=230, a=-Math.PI/2+this.ease(lt/dur)*Math.PI*2*0.98;
    x.strokeStyle='#333'; x.lineWidth=3; x.setLineDash([10,12]); x.beginPath(); x.arc(cx,cy,R,0,7); x.stroke(); x.setLineDash([]);
    x.strokeStyle=this.C.acc; x.lineWidth=5; x.beginPath(); x.arc(cx,cy,R,-Math.PI/2,a); x.stroke();
    this.subject(x,cx,cy,0.9);
    const px=cx+R*Math.cos(a), py=cy+R*Math.sin(a); this.phone(x,px,py,Math.atan2(cx-px,-(cy-py)),1.1);
    this.text(x,'TOP VIEW',90,60,22,this.C.dim,700,'left');
    this.text(x,'Walk slowly all the way around',W-90,250,32,this.C.ink,600,'right'); this.text(x,'— keep the subject centred,',W-90,292,28,this.C.dim,500,'right'); this.text(x,'about the same distance away',W-90,328,28,this.C.dim,500,'right');
    this.caption(x,'One full circle, phone always pointed at the subject');
  },
  s_heights(x,W,H,lt,dur){ // side view: three loops at different heights
    const gx=W/2, gy=470; x.fillStyle='#262626'; x.fillRect(80,gy+30,W-160,6); this.subject(x,gx,gy-10,1.1);
    const rows=[[gy-260,'High — looking down',2],[gy-120,'Eye level',1],[gy+0,'Low — looking up',3]];
    rows.forEach(([y,label,order],i)=>{ const on=this.ease((lt-(order-1)*1.2)/1); x.globalAlpha=Math.max(.15,on);
      const side= i%2?-1:1, X=gx+side*360, ang=Math.atan2(gx-X,-((gy-40)-y));
      this.phone(x,X,y,ang,1); this.text(x,label,X+side*-0,y-60,26,this.C.ink,600,'center');
      x.strokeStyle='rgba(224,83,61,.5)'; x.setLineDash([6,8]); x.lineWidth=3; x.beginPath(); x.ellipse(gx,y+10,330,40,0,Math.PI*.05,Math.PI*.95); x.stroke(); x.setLineDash([]); x.globalAlpha=1; });
    this.text(x,'SIDE VIEW',90,60,22,this.C.dim,700,'left');
    this.caption(x,'Do 2–3 loops: eye level, then higher, then lower');
  },
  s_settings(x,W,H,lt){
    const items=[['⏱','60–120 seconds','total for all the loops'],['🐢','Slow & steady','about one step per second'],['🔒','Lock focus & exposure','press & hold on the subject'],['1×','Stay on one lens','no zooming, 1080p or 4K, 30 fps'],['☁︎','Soft, even light','overcast or open shade is perfect']];
    items.forEach(([ic,a,b],i)=>{ const on=this.ease((lt-i*0.6)/0.5); const y=140+i*100; x.globalAlpha=on;
      x.fillStyle='#202020'; x.beginPath(); if(x.roundRect) x.roundRect(250,y-38,780,80,14); else x.rect(250,y-38,780,80); x.fill();
      this.text(x,ic,310,y+2,40,this.C.acc,700); this.text(x,a,370,y-10,32,this.C.ink,600,'left'); this.text(x,b,370,y+22,22,this.C.dim,500,'left'); this.badge(x,true,980,y+2,0.8); x.globalAlpha=1; });
    this.caption(x,'Settings that make a clean scan');
  },
  s_donts(x,W,H,lt){
    const cells=[['Don’t move the subject','people, pets, wind in leaves'],['Don’t stand still and pan','you have to walk around it'],['Avoid glass, mirrors, chrome','and plain white walls'],
      ['Don’t rush','motion blur ruins frames'],['No zooming or lens switching','stay on 1×'],['Nothing moving behind','people walking, cars, shadows']];
    cells.forEach(([a,b],i)=>{ const col=i%3, row=Math.floor(i/3), X=110+col*360, Y=150+row*230, on=this.ease((lt-i*0.45)/0.5); x.globalAlpha=on;
      x.fillStyle='#1f1f1f'; x.beginPath(); if(x.roundRect) x.roundRect(X,Y-80,330,190,16); else x.rect(X,Y-80,330,190); x.fill();
      // little pictograms
      x.save(); x.translate(X+165,Y-10);
      if(i===0){ this.subject(x,-30+8*Math.sin(lt*8),0,0.55); x.strokeStyle='#888'; x.lineWidth=3; for(let k=0;k<3;k++){ x.beginPath(); x.moveTo(20+k*10,-20); x.lineTo(30+k*10,-20); x.stroke(); } }
      if(i===1){ this.subject(x,0,0,0.5); this.phone(x,-90,40,Math.atan2(90,40)+0.4*Math.sin(lt*3),0.6); }
      if(i===2){ x.fillStyle='#9fc8e8'; x.globalAlpha*=.8; x.fillRect(-40,-45,80,90); x.fillStyle='#fff'; x.fillRect(-28,-35,10,70); }
      if(i===3){ x.strokeStyle='#ddd'; x.lineWidth=4; for(let k=0;k<5;k++){ x.globalAlpha=0.2+k*0.15; this.subject(x,-40+k*16,0,0.45); } }
      if(i===4){ x.strokeStyle='#ddd'; x.lineWidth=4; x.beginPath(); x.arc(0,0,34,0,7); x.stroke(); this.text(x,'2×',0,0,26,'#ddd',700); }
      if(i===5){ this.subject(x,-30,0,0.5); x.fillStyle='#777'; const px=40+20*Math.sin(lt*2); x.beginPath(); x.arc(px,-25,10,0,7); x.fill(); x.fillRect(px-8,-15,16,40); }
      x.restore();
      this.badge(x,false,X+295,Y-50,0.7);
      this.text(x,a,X+165,Y+62,22,this.C.ink,600); this.text(x,b,X+165,Y+90,18,this.C.dim,500); x.globalAlpha=1; });
    this.caption(x,'What ruins a scan');
  },
  s_next(x,W,H,lt){
    this.text(x,'Then in Splat Darkroom',W/2,200,48,this.C.ink,700);
    const steps=['3D Scan','New scan from video…','pick your clip','wait ~30–60 min'];
    steps.forEach((s,i)=>{ const on=this.ease((lt-i*0.35)/0.4); x.globalAlpha=on; const X=170+i*315, Y=360;
      x.fillStyle=i===1?this.C.acc:'#262626'; x.beginPath(); if(x.roundRect) x.roundRect(X-135,Y-40,270,80,40); else x.rect(X-135,Y-40,270,80); x.fill();
      this.text(x,s,X,Y,24,'#fff',600); if(i<3) this.text(x,'→',X+157,Y,34,this.C.dim,600); x.globalAlpha=1; });
    this.text(x,'Then orbit, focus and expose frames through any film.',W/2,500,28,this.C.dim,500);
  },
};
