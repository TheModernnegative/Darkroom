// Film borders: 35mm rebate with sprockets + edge print, 120 frame, 4x5 holder, gallery white.
const Borders = {
  styles:[['none','None'],['35mm','35mm scan'],['120','120 scan'],['4x5','4×5 holder'],['print','Print border']],
  margins(style,w,h){
    const land=w>=h, s=Math.min(w,h);
    const f=(px)=>({l:px.l*s/w,r:px.r*s/w,t:px.t*s/h,b:px.b*s/h});   // margins given in units of short side
    switch(style){
      case '35mm': return land? f({l:.05,r:.05,t:.26,b:.26}) : f({l:.26,r:.26,t:.05,b:.05});
      case '120':  return f({l:.075,r:.075,t:.075,b:.075});
      case '4x5':  return f({l:.06,r:.06,t:.06,b:.06});
      case 'print':return f({l:.07,r:.07,t:.07,b:.07});
      default: return {l:0,r:0,t:0,b:0};
    }
  },
  cache:{key:'',tex:null},
  edgeText(stock){
    const n=(stock.name||'').toUpperCase(), mk=(stock.maker||'').toUpperCase();
    if(stock.type==='bw') return mk+' '+n.replace(/ II$/,'');
    if(mk==='CINESTILL') return 'CINESTILL '+n;
    if(stock.group==='Motion Picture') return 'KODAK '+n.replace(/ /g,'')+'  5207';
    return mk+' '+n;
  },
  texture(style, fw, fh, b, stock, rng){
    const gl=GLU.gl; const W=Math.min(4096,Math.round(fw)), H=Math.round(fh*W/fw);
    const key=[style,W,H,stock.id].join('|');
    if(this.cache.key===key) return this.cache.tex;
    const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
    const ix=b.l/(1+b.l+b.r)*W, iw=W/(1+b.l+b.r), iy=b.t/(1+b.t+b.b)*H, ih=H/(1+b.t+b.b);
    let seed=7; const r=()=>{ seed=(seed*16807)%2147483647; return (seed-1)/2147483646; };
    const film = stock.type==='positive' ? '#0b0b0d' : stock.type==='bw' ? '#0e0e0e' : '#120d0a';
    if(style==='print'){
      x.fillStyle='#f2efe8'; x.fillRect(0,0,W,H);
      x.clearRect(ix,iy,iw,ih);
    } else {
      x.fillStyle=film; x.fillRect(0,0,W,H);
      // rough, slightly rounded emulsion edge
      x.save(); x.globalCompositeOperation='destination-out'; x.beginPath();
      const j=Math.max(1,Math.min(iw,ih)*0.0025), steps=160;
      const pt=(t)=>{ // walk the rectangle perimeter
        const P=2*(iw+ih); let d=t*P;
        if(d<iw) return [ix+d, iy]; d-=iw; if(d<ih) return [ix+iw, iy+d]; d-=ih; if(d<iw) return [ix+iw-d, iy+ih]; d-=iw; return [ix, iy+ih-d]; };
      for(let k=0;k<=steps*4;k++){ const [px,py]=pt(k/(steps*4)); const jx=(r()-.5)*j, jy=(r()-.5)*j; k?x.lineTo(px+jx,py+jy):x.moveTo(px+jx,py+jy); }
      x.closePath(); x.fill(); x.restore();
      // faint light falloff at the gate
      const g=Math.min(iw,ih)*0.01; x.strokeStyle='rgba(0,0,0,.35)'; x.lineWidth=g; x.strokeRect(ix+g/2,iy+g/2,iw-g,ih-g);
      const s=Math.min(W,H);
      const txtCol = stock.type==='bw' ? 'rgba(235,235,230,.85)' : (stock.maker==='Fujifilm' ? 'rgba(140,215,120,.85)' : 'rgba(245,170,60,.9)');
      if(style==='35mm'){
        const land=W>=H;
        x.save(); if(!land){ x.translate(W,0); x.rotate(Math.PI/2); }
        const LW=land?W:H, LH=land?H:W, sh=LH*0.055, sw=sh*0.72, gap=sw*1.9;
        x.fillStyle='rgba(225,220,210,.92)';
        for(let px=gap*.3; px<LW; px+=gap){
          for(const py of [LH*0.045, LH-LH*0.045-sh]){ x.beginPath(); if(x.roundRect) x.roundRect(px,py,sw,sh,sw*.18); else x.rect(px,py,sw,sh); x.fill(); } }
        x.fillStyle=txtCol; x.font=`600 ${Math.round(LH*0.034)}px "SF Mono",Menlo,monospace`; x.textBaseline='middle';
        const t=this.edgeText(stock), y=LH*0.135;
        x.fillText(t, LW*0.08, y); x.fillText('▸ 12', LW*0.52, y); x.fillText('12A', LW*0.78, y);
        x.font=`600 ${Math.round(LH*0.03)}px "SF Mono",Menlo,monospace`; x.fillText('13', LW*0.3, LH-LH*0.12);
        x.restore();
      } else if(style==='120'){
        x.fillStyle=txtCol; x.font=`600 ${Math.round(s*0.026)}px "SF Mono",Menlo,monospace`; x.textBaseline='middle';
        x.fillText(this.edgeText(stock), ix+iw*0.04, iy*0.5); x.fillText('◀ 7', ix+iw*0.7, iy*0.5);
        // frame-edge notch
        x.save(); x.globalCompositeOperation='destination-out'; x.beginPath();
        const nx=ix+iw*0.28, nw=s*0.03; x.moveTo(nx,iy+1); x.lineTo(nx+nw/2,iy-s*0.012); x.lineTo(nx+nw,iy+1); x.closePath(); x.fill(); x.restore();
      } else if(style==='4x5'){
        // notch code at top-right of the outer edge
        x.fillStyle='rgba(120,118,112,1)';
        const nb=s*0.022; const ox=W-ix-nb*3.5;
        x.beginPath(); x.moveTo(ox,0); x.lineTo(ox+nb*.5,nb*.9); x.lineTo(ox+nb,0); x.fill();
        x.fillRect(ox+nb*1.5,0,nb*.5,nb*.6); x.fillRect(ox+nb*2.4,0,nb*.5,nb*.75);
        x.fillStyle=txtCol.replace(/[\d.]+\)$/,'.55)'); x.font=`600 ${Math.round(s*0.018)}px "SF Mono",Menlo,monospace`; x.textBaseline='middle';
        x.fillText(this.edgeText(stock), ix+iw*0.06, iy*0.5);
      }
    }
    if(this.cache.tex) gl.deleteTexture(this.cache.tex);
    const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.cache={key,tex:t};
    return t;
  },
};
