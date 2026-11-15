// Film borders: 35mm rebate with sprockets + edge print, 120 frame, 4x5 holder, gallery white.
const Borders = {
  styles:[['none','None'],['film','Film rebate (matches format)'],['print','Print border'],
    ['polaroid','Polaroid 600 / SX-70'],['polaroidGo','Polaroid Go'],['instaxMini','Instax Mini'],['instaxSquare','Instax Square'],['instaxWide','Instax Wide'],['peel','Peel-apart'],['wetplate','Wet plate']],
  // instant frames from published sizes (mm): picture w × h, side / top / bottom borders
  INSTANT:{ polaroid:{w:79,h:77,side:4.75,top:6.2,bot:24.3,r:0.4}, polaroidGo:{w:47,h:46,side:3.45,top:4.2,bot:16.4,r:0.3},
    instaxMini:{w:46,h:62,side:4,top:6.6,bot:17.4,r:1.6}, instaxSquare:{w:62,h:62,side:5,top:6.6,bot:17.4,r:1.6}, instaxWide:{w:99,h:62,side:4.5,top:6.6,bot:17.4,r:1.6} },
  // the rebate a format really has: 35mm sprockets, 120 roll edge, or a sheet-film holder
  FILMS:{ '35mm':{roll:1,across:24,reb:5.5,gap:1.3,acrossShort:true,film:35},
    '120:645':{roll:1,across:56,reb:2.9,gap:1.8,acrossShort:false,film:61.8}, '120:66':{roll:1,across:56,reb:2.9,gap:1.8,acrossShort:true,film:61.8},
    '120:67':{roll:1,across:56,reb:2.9,gap:2.0,acrossShort:true,film:61.8},
    'sheet:4x5':{sheet:1,short:96,reb:3.0,flap:7.5}, 'sheet:8x10':{sheet:1,short:194,reb:4.0,flap:10} },
  isFilm(style){ return style==='film'||style==='35mm'||style==='120'||style==='4x5'||!!this.FILMS[style]; },
  forFormat(fmt){ return {'35mm':'35mm','645':'120:645','6x6':'120:66','6x7':'120:67','4x5':'sheet:4x5','8x10':'sheet:8x10'}[fmt]||'35mm'; },
  // library frames used by Develop borders
  imgs:{},
  frameImg(style,stock){ if(style==='wetplate') return this.plateImg&&this.plateImg.complete&&this.plateImg.naturalWidth?this.plateImg:null;
    if(style!=='peel') return null; const id=stock&&stock.id||'';
    const want = /665|polaroid_55/.test(id) ? 'peel_neg' : /fp3000b/.test(id) ? 'peel_bw' : 'peel_color';
    const im=this.imgs[want]||this.imgs.peel_color; return im&&im.complete&&im.naturalWidth?im:null; },
  // no see-through at the outer edge: fill transparent pixels in a thin outer ring with the border's own colour
  sealEdges(x,W,H,frac){ const r=Math.max(2,Math.round(Math.min(W,H)*frac)), band=r*3;
    let R=0,G=0,B=0,n=0; const take=(sx,sy,sw,sh)=>{ const d=x.getImageData(sx,sy,sw,sh).data; for(let i=0;i<d.length;i+=16) if(d[i+3]>200){ R+=d[i];G+=d[i+1];B+=d[i+2];n++; } };
    take(0,0,W,band); take(0,H-band,W,band); take(0,0,band,H); take(W-band,0,band,H);
    const col=n?`rgb(${R/n|0},${G/n|0},${B/n|0})`:'#0b0b0b';
    x.save(); x.globalCompositeOperation='destination-over'; x.fillStyle=col; x.beginPath(); x.rect(0,0,W,H); x.rect(r,r,W-2*r,H-2*r); x.fill('evenodd'); x.restore(); },
  isInstant(style){ return !!(this.INSTANT[style]||style==='peel'); },
  margins(style,w,h){
    const land=w>=h, s=Math.min(w,h);
    const f=(px)=>({l:px.l*s/w,r:px.r*s/w,t:px.t*s/h,b:px.b*s/h});   // margins given in units of short side
    switch(style){
      case '35mm': case '120:645': case '120:66': case '120:67': { const F=this.FILMS[style];
        const vert = F.acrossShort ? h<=w : h>w;   // is the film's width running up the picture?
        if(vert){ const k=h/F.across; return {t:F.reb*k/h,b:F.reb*k/h,l:F.gap*k/w,r:F.gap*k/w}; }
        const k=w/F.across; return {l:F.reb*k/w,r:F.reb*k/w,t:F.gap*k/h,b:F.gap*k/h}; }
      case 'sheet:4x5': case 'sheet:8x10': { const F=this.FILMS[style], m=s/F.short;
        return land ? {l:F.flap*m/w,r:F.reb*m/w,t:F.reb*m/h,b:F.reb*m/h} : {t:F.flap*m/h,b:F.reb*m/h,l:F.reb*m/w,r:F.reb*m/w}; }
      case 'print':return f({l:.07,r:.07,t:.07,b:.07});
      case 'peel': return this.imgs&&Object.keys(this.imgs).some(k=>k.startsWith('peel')) ? f({l:.04,r:.04,t:.04,b:.04}) : f({l:.075,r:.075,t:.075,b:.12});
      case 'wetplate': return this.plateImg ? f({l:.015,r:.015,t:.015,b:.015}) : f({l:.06,r:.06,t:.06,b:.06});
      default: { const I=this.INSTANT[style]; if(I) return {l:I.side/I.w,r:I.side/I.w,t:I.top/I.h,b:I.bot/I.h}; return {l:0,r:0,t:0,b:0}; }
    }
  },
  cache:{key:'',tex:null},
  edgeText(stock){
    const n=(stock.name||'').toUpperCase(), mk=(stock.maker||'').toUpperCase(), id=stock.id||'';
    const KNOWN={'tri-x':'KODAK 400TX','tmax100':'KODAK 100TMX','hp5':'ILFORD HP5 PLUS','delta3200':'ILFORD DELTA 3200','acros':'FUJI ACROS 100 II','portra160':'KODAK PORTRA 160','portra400':'KODAK PORTRA 400','portra800':'KODAK PORTRA 800','ektar100':'KODAK EKTAR 100','gold200':'KODAK GOLD 200','ultramax400':'KODAK UM 400'};
    if(KNOWN[id]) return KNOWN[id];
    if(stock.type==='bw') return mk+' '+n.replace(/ II$/,'');
    if(mk==='CINESTILL') return 'CINESTILL '+n;
    if(stock.group==='Motion Picture') return 'KODAK '+n.replace(/ /g,'')+'  5207';
    return mk+' '+n;
  },
  // ---------------------------------------------------------------- film rebates, drawn to scale in millimetres
  drawFilm(x,W,H,win,style,stock,edge,fno,film){
    const F=this.FILMS[style]; let sd=[...(stock.id||'x')].reduce((a,c)=>(a*31+c.charCodeAt(0))%2147483647,17)+fno; const rr=()=>{ sd=(sd*16807)%2147483647; return sd/2147483647; };
    const txtCol = stock.type==='bw' ? [232,230,224] : stock.type==='positive' ? [236,222,170] : (stock.maker==='Fujifilm' ? [150,215,125] : [246,168,64]);
    const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const font=(px,w=700)=>`${w} ${px}px "DIN Condensed","Arial Narrow","Helvetica Neue Condensed","Roboto Condensed","Helvetica Neue",Arial,sans-serif`;
    // base: the clear film base reads near-black once a negative is inverted; a little density noise and edge fog
    x.fillStyle=film; x.fillRect(0,0,W,H);
    { const img=x.getImageData(0,0,W,H), d=img.data; for(let i=0;i<d.length;i+=4){ const n=(rr()-.5)*6; d[i]+=n; d[i+1]+=n; d[i+2]+=n; } x.putImageData(img,0,0); }
    // a wobbly, slightly rounded window: the camera gate's shadow on the emulsion
    const winPath=(X,Y,Wd,Hd,rad,amp,keep)=>{ if(!keep) x.beginPath(); const N=420, P=2*(Wd+Hd); const ph=(sd%97)/15, ph2=(sd%89)/14;
      const pt=t=>{ let d=t*P; if(d<Wd) return [X+d,Y,0,-1]; d-=Wd; if(d<Hd) return [X+Wd,Y+d,1,0]; d-=Hd; if(d<Wd) return [X+Wd-d,Y+Hd,0,1]; d-=Wd; return [X,Y+Hd-d,-1,0]; };
      for(let k=0;k<=N;k++){ const t=k/N; let [px,py,nx,ny]=pt(t); const w=amp*(Math.sin(t*61+ph)*.6+Math.sin(t*233+ph2)*.4); px+=nx*w; py+=ny*w;
        // round the corners
        const cx=Math.min(Math.max(px,X+rad),X+Wd-rad), cy=Math.min(Math.max(py,Y+rad),Y+Hd-rad), dx=px-cx, dy=py-cy, dl=Math.hypot(dx,dy); if(dl>rad){ px=cx+dx/dl*rad; py=cy+dy/dl*rad; }
        k?x.lineTo(px,py):x.moveTo(px,py); } x.closePath(); };
    const cutWindow=(X,Y,Wd,Hd,mm,rad,amp,soft)=>{
      x.save(); winPath(X,Y,Wd,Hd,rad,amp); x.globalCompositeOperation='destination-out'; x.fill(); x.restore();
      // inner gate shadow: a soft darkening just inside the frame edge
      x.save(); winPath(X,Y,Wd,Hd,rad,amp); x.clip(); x.beginPath(); x.rect(-W,-H,W*3,H*3); winPath(X,Y,Wd,Hd,rad,amp,true);
      x.shadowColor='rgba(0,0,0,.8)'; x.shadowBlur=soft*mm; x.fillStyle='#000'; x.fill('evenodd'); x.restore(); };
    if(F.roll){
      // work in film coordinates: film runs left→right, LW along, LH across
      const across_is_h = F.acrossShort ? win.ih<=win.iw : win.ih>win.iw;
      x.save(); let LW=W, LH=H, X=win.ix, Y=win.iy, Wd=win.iw, Hd=win.ih;
      if(!across_is_h){ x.translate(W,0); x.rotate(Math.PI/2); LW=H; LH=W; X=win.iy; Y=W-win.ix-win.iw; Wd=win.ih; Hd=win.iw; }
      const mm=Hd/F.across;
      if(style==='35mm'){
        cutWindow(X,Y,Wd,Hd,mm,0.45*mm,0.04*mm,0.35);
        // KS perforations (ISO 491): 1.98 mm along × 2.79 mm across, 4.75 mm pitch, 2.01 mm from the edge; 8 per frame
        const pw=1.98*mm, ph=2.794*mm, pitch=4.75*mm, e=(LH-35*mm)/2+2.01*mm, rows=[e, LH-e-ph], off=X-1.0*mm-((fno*1.3)%1)*pitch;
        for(let px=off-Math.ceil(off/pitch)*pitch; px<LW; px+=pitch) for(const py of rows){
          const g=x.createLinearGradient(px,py,px+pw,py+ph); g.addColorStop(0,'#efebe2'); g.addColorStop(1,'#d9d4c9');
          x.save(); x.shadowColor='rgba(255,250,235,.35)'; x.shadowBlur=0.25*mm; x.fillStyle=g; x.beginPath(); x.roundRect?x.roundRect(px,py,pw,ph,0.52*mm):x.rect(px,py,pw,ph); x.fill(); x.restore(); }
        // edge print: name on the top margin, frame numbers + arrow + DX bars on the bottom (between perforations and edge)
        const zTop=(LH-35*mm)/2+1.0*mm, zBot=LH-zTop, fs=1.2*mm; x.textBaseline='middle'; x.font=font(Math.round(fs)); x.fillStyle=rgba(txtCol,.88);
        if(edge){ const tw=x.measureText(edge).width; for(let tx=X+Wd*0.08-38*mm; tx<LW; tx+=38*mm) { x.fillText(edge,tx,zTop); x.font=font(Math.round(fs*.8),500); x.fillText(String(5000+(sd%999)),tx+tw+3*mm,zTop); x.font=font(Math.round(fs)); } }
        const fr=38*mm; for(let k=-1;k<=1;k++){ const bx=X+k*fr;
          x.font=font(Math.round(fs*1.05)); x.fillText(String(fno+k),bx+Wd*0.12,zBot); x.fillText('▶ '+(fno+k)+'A',bx+Wd*0.6,zBot);
          // DX barcode: clock + data tracks
          x.fillStyle=rgba(txtCol,.55); const by=zBot-0.55*mm, bw=0.32*mm; let bits=(sd*(k+3))>>>3;
          for(let q=0;q<14;q++){ const qx=bx+Wd*0.25+q*bw*2.0; x.fillRect(qx,by,bw,0.42*mm); if((bits>>(q%28))&1) x.fillRect(qx,by+0.62*mm,bw,0.42*mm); }
          x.fillStyle=rgba(txtCol,.88); }
      } else {
        // 120 roll: no perforations — a 2.9 mm rebate with the maker's edge print, soft rounded gate corners
        cutWindow(X,Y,Wd,Hd,mm,0.9*mm,0.07*mm,0.5);
        const zTop=Y-1.45*mm, zBot=Y+Hd+1.45*mm, fs=1.55*mm; x.textBaseline='middle'; x.font=font(Math.round(fs)); x.fillStyle=rgba(txtCol,.85);
        if(edge){ x.fillText(edge, X+Wd*0.06, zTop); const tw=x.measureText(edge).width; x.font=font(Math.round(fs*.8),500); x.fillText(String(6000+(sd%999)), X+Wd*0.06+tw+2.5*mm, zTop);
          x.font=font(Math.round(fs)); if(Wd>60*mm) x.fillText(edge, X+Wd*0.62, zTop); }
        // bottom rebate: frame index and a short exposure code
        x.font=font(Math.round(fs*1.1)); x.fillText(String(Math.max(1,(fno%12)||12)), X+Wd*0.08, zBot);
        x.fillStyle=rgba(txtCol,.5); for(let q=0;q<9;q++) x.fillRect(X+Wd*0.7+q*0.9*mm, zBot-0.3*mm, 0.5*mm, 0.6*mm);
        // the next and previous frames' edges peeking in at the ends of the strip
        x.fillStyle='rgba(0,0,0,.0)';
      }
      x.restore();
    } else {
      // sheet film in a holder: wider flap band on one short edge, notch code cut into the film's edge
      const s=Math.min(win.iw,win.ih), mm=s/F.short; cutWindow(win.ix,win.iy,win.iw,win.ih,mm,1.3*mm,0.12*mm,0.8);
      const land=W>=H; x.fillStyle='#ece8df';
      // notches sit on the short edge near a corner (top-right when the emulsion faces you)
      const n=(cx,cy,ang)=>{ x.save(); x.translate(cx,cy); x.rotate(ang);
        x.beginPath(); x.moveTo(0,0); x.lineTo(1.2*mm,2.2*mm); x.lineTo(2.4*mm,0); x.closePath(); x.fill();          // V
        x.beginPath(); x.arc(4.2*mm,0,1.0*mm,0,Math.PI); x.fill();                                                        // U
        x.fillRect(6.4*mm,0,1.6*mm,1.6*mm); x.restore(); };                                                               // square
      if(land) n(W,H*0.09,Math.PI/2); else n(W*0.91,0,0);
      // faint holder number scratched into the rebate
      x.fillStyle=rgba(txtCol,.35); x.font=font(Math.round(2.2*mm),600); x.textBaseline='middle';
      if(land) { x.save(); x.translate(win.ix*0.5, H*0.5); x.rotate(-Math.PI/2); x.textAlign='center'; x.fillText(String(1+(fno%24)),0,0); x.restore(); }
      else { x.textAlign='center'; x.fillText(String(1+(fno%24)),W*0.5,win.iy*0.5); }
    }
  },
  texture(style, fw, fh, b, stock, p){
    p=p||{}; const edgeMode=p.edgeText||'stock', fno=Math.max(1,Math.min(38,p.frameNo||12));
    const edge = edgeMode==='none' ? '' : edgeMode==='custom' ? String(p.edgeCustom||'').toUpperCase().slice(0,40) : this.edgeText(stock);
    const gl=GLU.gl; const W=Math.min(4096,Math.round(fw)), H=Math.round(fh*W/fw);
    const tone=p.frameTone&&p.frameTone!=='auto'?p.frameTone:((stock.defaults&&stock.defaults.frameTone)||'white');
    const key=[style,W,H,stock.id,edgeMode,p.edgeCustom||'',fno,tone].join('|');
    if(this.cache.key===key) return this.cache.tex;
    const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
    const ix=b.l/(1+b.l+b.r)*W, iw=W/(1+b.l+b.r), iy=b.t/(1+b.t+b.b)*H, ih=H/(1+b.t+b.b);
    let seed=7; const r=()=>{ seed=(seed*16807)%2147483647; return (seed-1)/2147483646; };
    const film = stock.type==='positive' ? '#0b0b0d' : stock.type==='bw' ? '#0e0e0e' : '#120d0a';
    const im0=this.frameImg(style,stock);
    if(im0){
      // scanned-quality edge from the asset library (wet plate, peel-apart), rotated for portrait photos
      const im=im0, port=H>W; x.save();
      if(port){ x.translate(W,0); x.rotate(Math.PI/2); x.drawImage(im,0,0,H,W); } else x.drawImage(im,0,0,W,H);
      x.restore();
    } else if(style==='wetplate'){
      // collodion plate: dark japanned edge, poured emulsion with an irregular, silvery boundary
      let sd=29; const rr=()=>{ sd=(sd*16807)%2147483647; return sd/2147483647; };
      x.fillStyle='#16130f'; x.fillRect(0,0,W,H);
      const walk=(n,amp)=>{ const a=[]; let v=0, dv=0; for(let k=0;k<=n;k++){ dv=dv*0.9+(rr()-.5)*0.18; v=Math.max(-1,Math.min(1,v+dv)); a.push(v*amp); } return a; };
      const m=Math.min(iw,ih)*0.03, T=walk(240,m), R=walk(160,m), B=walk(240,m*1.6), L=walk(160,m), rad=Math.min(iw,ih)*0.05;
      x.save(); x.beginPath();
      T.forEach((v,k)=>x.lineTo(ix+rad+(iw-2*rad)*k/240, iy+v)); R.forEach((v,k)=>x.lineTo(ix+iw+v, iy+rad+(ih-2*rad)*k/160));
      B.forEach((v,k)=>x.lineTo(ix+iw-rad-(iw-2*rad)*k/240, iy+ih+v)); L.forEach((v,k)=>x.lineTo(ix+v, iy+ih-rad-(ih-2*rad)*k/160)); x.closePath();
      x.globalCompositeOperation='destination-out'; x.fill(); x.restore();
      // silvery pour marks and a dark rim just inside the plate
      x.save(); x.globalCompositeOperation='source-over';
      for(let k=0;k<26;k++){ const side=rr(), t=rr(); const px= side<.25? ix+t*iw : side<.5? ix+iw-m*rr() : side<.75? ix+t*iw : ix+m*rr();
        const py= side<.25? iy+m*rr() : side<.5? iy+t*ih : side<.75? iy+ih-m*rr() : iy+t*ih;
        const R0=m*(0.6+rr()*1.4); const g=x.createRadialGradient(px,py,0,px,py,R0); g.addColorStop(0,'rgba(205,195,170,.22)'); g.addColorStop(1,'rgba(205,195,170,0)'); x.fillStyle=g; x.beginPath(); x.arc(px,py,R0,0,7); x.fill(); }
      x.restore();
    } else if(this.isInstant(style)){
      const I=this.INSTANT[style]||{w:95,h:73,r:0.2}, mm=iw/I.w;
      const base={white:'#f3f1ec',cream:'#efe6d3',black:'#151515'}[tone]||'#f3f1ec';
      x.fillStyle=base; x.fillRect(0,0,W,H);
      // paper / plastic texture
      const img=x.getImageData(0,0,W,H), d=img.data; let sd=11; const rr=()=>{ sd=(sd*16807)%2147483647; return sd/2147483647; };
      const amp=tone==='black'?5:7; for(let i=0;i<d.length;i+=4){ const n=(rr()-.5)*amp; d[i]+=n; d[i+1]+=n; d[i+2]+=n; } x.putImageData(img,0,0);
      // picture window (slightly rounded on Instax), with the faint shadow of the frame's edge
      const rad=I.r*mm;
      x.save(); x.shadowColor='rgba(0,0,0,.35)'; x.shadowBlur=mm*0.8; x.fillStyle='#000';
      x.beginPath(); if(x.roundRect) x.roundRect(ix,iy,iw,ih,rad); else x.rect(ix,iy,iw,ih); x.fill(); x.restore();
      x.save(); x.globalCompositeOperation='destination-out'; x.beginPath(); if(x.roundRect) x.roundRect(ix,iy,iw,ih,rad); else x.rect(ix,iy,iw,ih); x.fill(); x.restore();
      if(style==='peel'){
        // peel-apart: dark, uneven chemical edge around the picture and a goo-streaked trailing end
        x.save(); x.beginPath(); x.rect(0,0,W,H); x.rect(ix,iy,iw,ih); x.clip('evenodd');
        const band=Math.min(iw,ih)*0.028;
        // organic edge: a smoothed random walk of the chemistry's reach past each side
        const walk=(n,lo,hi)=>{ const a=[]; let v=(lo+hi)/2, dv=0; for(let k=0;k<=n;k++){ dv=dv*0.9+(rr()-.5)*0.08; v=Math.min(hi,Math.max(lo,v+dv)); a.push(v); } for(let k=1;k<a.length-1;k++) a[k]=(a[k-1]+a[k]*2+a[k+1])/4; return a; };
        const T=walk(260,0.25,0.9), Rt=walk(180,0.2,0.7), B=walk(260,0.6,1.8), Lf=walk(180,0.2,0.7);
        x.fillStyle='rgba(28,22,19,.94)'; x.beginPath();
        T.forEach((v,k)=>x.lineTo(ix+k/260*iw, iy-band*v)); Rt.forEach((v,k)=>x.lineTo(ix+iw+band*v, iy+k/180*ih));
        B.forEach((v,k)=>x.lineTo(ix+iw-k/260*iw, iy+ih+band*v)); Lf.forEach((v,k)=>x.lineTo(ix-band*v, iy+ih-k/180*ih)); x.closePath(); x.fill();
        // faint reagent streaks on the trailing border

        x.restore();
      }
    } else if(style==='print'){
      x.fillStyle='#f2efe8'; x.fillRect(0,0,W,H);
      x.clearRect(ix,iy,iw,ih);
    } else if(this.FILMS[style]){
      this.drawFilm(x,W,H,{ix,iy,iw,ih},style,stock,edge,fno,film);
    }
    if(style!=='none') this.sealEdges(x,W,H,0.006);
    if(this.cache.tex) gl.deleteTexture(this.cache.tex);
    const t=gl.createTexture(); gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.cache={key,tex:t};
    return t;
  },
};
