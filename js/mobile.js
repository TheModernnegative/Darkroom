// Splat Darkroom — iPhone web app (film + adjustments).
const $=s=>document.querySelector(s);
const M = {
  file:null, name:'', tab:'film', hist:[], fut:[], presets:[], editing:false, thumbs:{}, exportBlob:null,
  async start(){
    try{ Engine.init($('#view')); }catch(e){ $('#empty').innerHTML='<div class="big">This needs a newer iPhone browser (WebGL 2).</div>'; return; }
    Engine.pad=6;
    await Engine.loadManifest();
    try{ this.presets=JSON.parse(localStorage.getItem('dr.presets')||'[]'); const last=JSON.parse(localStorage.getItem('dr.last')||'null'); if(last) Engine.p=Object.assign({},DEFAULTS,last); }catch(e){}
    await Engine.ensureLuts(Engine.p);
    this.bind(); this.showTab('film'); this.title();
    if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
    const loop=()=>{ if(Engine.dirty&&Engine.src){ Engine.dirty=false; Engine.render({params:Engine.hoverParams||Engine.p,borderTex:this.borderTex()}); this.histo(); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  },
  // ----------------------------------------------------------------- photo
  async open(f){
    if(!f) return; this.file=f; this.name=(f.name||'photo').replace(/\.[^.]+$/,'');
    this.busy('Opening…');
    try{
      const src=await this.decode(f, 2048);
      if(Engine.src) Engine.gl.deleteTexture(Engine.src.tex);
      Engine.setSource(src); $('#empty').classList.add('off'); $('#btnSave').disabled=false;
      this.hist=[JSON.stringify(Engine.p)]; this.fut=[];
      this.thumbs={}; this.busy(); this.showTab(this.tab);
      setTimeout(()=>this.makeThumbs(),60);
    }catch(e){ this.busy(); this.toast('Could not open: '+e.message); }
  },
  async decode(f,max){
    const gl=Engine.gl; let bmp=await createImageBitmap(f,{imageOrientation:'from-image'});
    let w=bmp.width,h=bmp.height;
    const lim=Math.min(max, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    // iOS caps canvases at ~16.7 MP; keep exports inside it
    let s=Math.min(1, lim/Math.max(w,h), Math.sqrt(16.0e6/(w*h)));
    if(s<1){ const b2=await createImageBitmap(bmp,{resizeWidth:Math.round(w*s),resizeHeight:Math.round(h*s),resizeQuality:'high'}); bmp.close&&bmp.close(); bmp=b2; w=bmp.width; h=bmp.height; }
    const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,bmp);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
    const sw=96, sh=Math.max(1,Math.round(96*h/w)); const c=document.createElement('canvas'); c.width=sw; c.height=sh; const x=c.getContext('2d'); x.drawImage(bmp,0,0,sw,sh);
    const d=x.getImageData(0,0,sw,sh).data, lum=new Float32Array(sw*sh), lin=v=>{ v/=255; return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4); };
    for(let i=0;i<sw*sh;i++) lum[i]=0.2126*lin(d[i*4])+0.7152*lin(d[i*4+1])+0.0722*lin(d[i*4+2]);
    bmp.close&&bmp.close();
    return {tex,w,h,dispRef:true,encoded:false,flipY:false,key:Engine.keyFromSamples(lum,sw,sh)};
  },
  borderTex(){ const p=Engine.hoverParams||Engine.p; if(!Engine.src||p.border==='none') return null; const L=Engine.layout(); return Borders.texture(p.border,L.fw,L.fh,L.b,Engine.stock(p.stock)); },
  // small offscreen render of the current photo with params → dataURL
  thumb(params,W,H){
    const s=Engine.src; if(!s) return '';
    const sc=Math.max(W/s.w,H/s.h), w=Math.round(s.w*sc), h=Math.round(s.h*sc);
    this._tt=GLU.ensure(this._tt,W,H,'rgba8');
    const L={W,H,dpr:1,scale:sc,fx:(W-w)/2,fy:(H-h)/2,fw:w,fh:h,ix:(W-w)/2,iy:(H-h)/2,iw:w,ih:h,win:[0,0,1,1],b:{l:0,r:0,t:0,b:0}};
    Engine.render({layout:L,target:this._tt,RT:this._tRT||(this._tRT={}),params:Object.assign({},params,{border:'none'}),forceAfter:true});
    const gl=Engine.gl, px=new Uint8Array(W*H*4); gl.bindFramebuffer(gl.FRAMEBUFFER,this._tt.f); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const c=this._tc||(this._tc=document.createElement('canvas')); c.width=W; c.height=H; const x=c.getContext('2d'); const id=x.createImageData(W,H);
    for(let y=0;y<H;y++) id.data.set(px.subarray((H-1-y)*W*4,(H-y)*W*4),y*W*4); x.putImageData(id,0,0);
    Engine.dirty=true; return c.toDataURL('image/jpeg',0.82);
  },
  async makeThumbs(){
    // one live thumbnail per stock, rendered from your photo with your current edit
    for(const s of Engine.manifest.stocks){
      if(!Engine.src) return;
      const p=Object.assign({},Engine.p,{stock:s.id,paper:null}); await Engine.ensureLuts(p);
      this.thumbs[s.id]=this.thumb(p,156,192);
      const el=document.querySelector(`.card[data-id="${s.id}"] .th`); if(el) el.style.backgroundImage=`url(${this.thumbs[s.id]})`;
      await new Promise(r=>setTimeout(r,0));
    }
  },
  // ----------------------------------------------------------------- edits
  changed(){ Engine.dirty=true; this.title(); clearTimeout(this._sv); this._sv=setTimeout(()=>{ try{ localStorage.setItem('dr.last',JSON.stringify(Engine.p)); }catch(e){} },400); },
  commit(){ const s=JSON.stringify(Engine.p); if(this.hist[this.hist.length-1]!==s){ this.hist.push(s); this.fut=[]; if(this.hist.length>100) this.hist.shift(); } },
  async undo(){ if(this.hist.length<2){ this.toast('Nothing to undo'); return; } this.fut.push(this.hist.pop()); Engine.p=Object.assign({},DEFAULTS,JSON.parse(this.hist[this.hist.length-1])); await Engine.ensureLuts(Engine.p); this.changed(); this.showTab(this.tab); },
  async setStock(id){ Engine.p.stock=id; Engine.p.paper=null; await Engine.ensureLuts(Engine.p); this.changed(); this.commit(); this.showTab('film',true); },
  title(){ const s=Engine.stock(); $('#title').innerHTML=`<b>${s.maker==='CineStill'?'CineStill ':''}${s.name}</b> · ${Engine.paperFor(Engine.p).name}`; },
  // ----------------------------------------------------------------- panes
  slider(parent,key,label,o){
    const d=document.createElement('div'); d.className='sl';
    d.innerHTML=`<div class="top"><span>${label}</span><span></span></div><input type="range" min="${o.min}" max="${o.max}" step="${o.step}">`;
    const r=d.querySelector('input'), v=d.querySelector('.top span:last-child'); if(o.track) r.style.setProperty('--trk',o.track);
    const fmt=o.fmt||(x=>(x>0?'+':'')+Math.round(x)), def=DEFAULTS[key];
    const show=()=>{ const x=Engine.p[key]; r.value=x; v.textContent=fmt(x); d.classList.toggle('changed',Math.abs(x-def)>1e-6); };
    r.oninput=()=>{ Engine.p[key]=+r.value; show(); this.changed(); };
    r.onchange=()=>this.commit();
    let lt=0; d.querySelector('.top').onclick=()=>{ const n=Date.now(); if(n-lt<350){ Engine.p[key]=def; show(); this.changed(); this.commit(); } lt=n; };
    parent.appendChild(d); show();
  },
  seg(parent,label,opts,get,set){
    const d=document.createElement('div'); d.className='row'; d.innerHTML=(label?`<label>${label}</label>`:'')+'<div class="seg"></div>';
    const b=d.querySelector('.seg'); opts.forEach(([v,t])=>{ const x=document.createElement('button'); x.textContent=t; x.classList.toggle('on',String(get())===String(v)); x.onclick=()=>{ set(v); b.querySelectorAll('button').forEach(y=>y.classList.toggle('on',y===x)); }; b.appendChild(x); });
    parent.appendChild(d);
  },
  toggle(parent,label,get,set){ const d=document.createElement('div'); d.className='tog'; d.innerHTML=`<span>${label}</span><div class="sw"></div>`; const sw=d.querySelector('.sw'); sw.classList.toggle('on',!!get());
    d.onclick=()=>{ set(!get()); sw.classList.toggle('on',!!get()); }; parent.appendChild(d); },
  head(parent,title,resetKeys){ const h=document.createElement('div'); h.className='paneHead'; h.innerHTML=`<span>${title}</span>`+(resetKeys?'<button>Reset</button>':'');
    if(resetKeys) h.querySelector('button').onclick=()=>{ resetKeys.forEach(k=>Engine.p[k]=DEFAULTS[k]); this.changed(); this.commit(); this.showTab(this.tab); }; parent.appendChild(h); },
  showTab(t,keepScroll){
    this.tab=t; document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
    const pane=$('#pane'), sx=(pane.querySelector('.stocks')||{}).scrollLeft, sy=pane.scrollTop; pane.innerHTML='';
    const p=Engine.p, S=(k,l,o)=>this.slider(pane,k,l,o);
    if(t==='film'){
      const s=Engine.stock();
      const desc=document.createElement('div'); desc.className='desc'; desc.innerHTML=`<b>${s.maker} ${s.name}</b> · ISO ${s.iso} — ${s.desc}`; pane.appendChild(desc);
      const row=document.createElement('div'); row.className='stocks'; let g='';
      Engine.manifest.stocks.forEach(st=>{
        if(st.group!==g){ g=st.group; const gl=document.createElement('div'); gl.className='grp'; gl.textContent=g.replace('Kodak ','').replace('Professional','Kodak Pro').replace('Consumer','Kodak'); row.appendChild(gl); }
        const c=document.createElement('div'); c.className='card'+(st.id===p.stock?' on':''); c.dataset.id=st.id;
        c.innerHTML=`<div class="th" style="${this.thumbs[st.id]?`background-image:url(${this.thumbs[st.id]})`:''}"></div><div class="nm">${st.maker==='CineStill'?'CineStill ':''}${st.name}</div><div class="iso">${st.iso}</div>`;
        c.onclick=()=>this.setStock(st.id); row.appendChild(c);
      });
      pane.appendChild(row); if(keepScroll&&sx!=null) row.scrollLeft=sx; else { const on=row.querySelector('.card.on'); if(on) row.scrollLeft=on.offsetLeft-40; }
      this.seg(pane,'Print',s.papers.map(x=>[x.id,x.name.replace('Kodak Professional ','').replace('Fujifilm ','Fuji ').replace('Kodak ','')]),()=>Engine.paperFor(p).id,async v=>{ p.paper=v; await Engine.ensureLuts(p); this.changed(); this.commit(); });
      this.seg(pane,'Format',Object.entries(FORMATS).map(([k,f])=>[k,f.label]),()=>p.format,v=>{ p.format=v; this.changed(); this.commit(); });
      this.toggle(pane,'Auto exposure (lab metering)',()=>p.autoExp,v=>{ p.autoExp=v; this.changed(); this.commit(); });
    } else if(t==='light'){
      this.head(pane,'Light',['ev','contrast','highlights','shadows','whites','blacks']);
      S('ev','Exposure',{min:-4,max:4,step:0.01,fmt:x=>(x>0?'+':'')+x.toFixed(2)});
      S('contrast','Contrast',{min:-100,max:100,step:1}); S('highlights','Highlights',{min:-100,max:100,step:1}); S('shadows','Shadows',{min:-100,max:100,step:1});
      S('whites','Whites',{min:-100,max:100,step:1}); S('blacks','Blacks',{min:-100,max:100,step:1});
      this.head(pane,'Source',['hlExpand']);
      S('hlExpand','Highlight room',{min:0,max:1,step:0.01,fmt:x=>Math.round(x*100)});
      const n=document.createElement('div'); n.className='note'; n.textContent='Re-opens highlights the iPhone compressed, so the film shoulder can roll them off.'; pane.appendChild(n);
    } else if(t==='color'){
      this.head(pane,'White balance',['temp','tint']);
      S('temp','Temp',{min:-100,max:100,step:1,track:'linear-gradient(90deg,#3c6bd6,#777 50%,#e4c03a)'});
      S('tint','Tint',{min:-100,max:100,step:1,track:'linear-gradient(90deg,#3fae4a,#777 50%,#c446c0)'});
      this.head(pane,'Presence',['vibrance','saturation']);
      S('vibrance','Vibrance',{min:-100,max:100,step:1}); S('saturation','Saturation',{min:-100,max:100,step:1});
    } else if(t==='effects'){
      this.head(pane,'Grain',['grain','grainSize','grainRough']);
      S('grain','Amount',{min:0,max:3,step:0.01,fmt:x=>Math.round(x*100)}); S('grainSize','Size',{min:0.4,max:3,step:0.01,fmt:x=>Math.round(x*100)}); S('grainRough','Softness',{min:0.05,max:0.8,step:0.01,fmt:x=>Math.round(x*100)});
      this.head(pane,'Light & lens',['halation','glow','falloff']);
      S('halation','Halation',{min:0,max:4,step:0.01,fmt:x=>Math.round(x*100)}); S('glow','Diffusion',{min:0,max:1,step:0.01,fmt:x=>Math.round(x*100)}); S('falloff','Lens falloff',{min:0,max:1.5,step:0.01,fmt:x=>Math.round(x*100)});
      this.head(pane,'Frame');
      this.seg(pane,'',Borders.styles.map(([k,t])=>[k,t.replace(' scan','').replace(' holder','').replace('Print border','Print')]),()=>p.border,v=>{ p.border=v; this.changed(); this.commit(); });
    } else if(t==='presets'){
      const h=document.createElement('div'); h.className='paneHead'; h.innerHTML=`<span>Your presets</span><button>${this.editing?'Done':'Edit'}</button>`;
      h.querySelector('button').onclick=()=>{ this.editing=!this.editing; this.showTab('presets'); }; pane.appendChild(h);
      const nw=document.createElement('div'); nw.className='pnew'; nw.innerHTML=`<input placeholder="Name this look" value=""><button>Save</button>`;
      const inp=nw.querySelector('input'); nw.querySelector('button').onclick=()=>{ const n=inp.value.trim(); if(!n){ inp.focus(); return; }
        const settings={}; Object.keys(DEFAULTS).filter(k=>!['ev','temp','tint'].includes(k)).forEach(k=>settings[k]=Engine.p[k]);
        const ex=this.presets.find(x=>x.name.toLowerCase()===n.toLowerCase()); if(ex) ex.settings=settings; else this.presets.unshift({id:'p'+Date.now(),name:n,settings});
        this.savePresets(); inp.blur(); this.toast('Saved “'+n+'”'); this.showTab('presets'); };
      pane.appendChild(nw);
      const list=document.createElement('div'); list.className='plist'+(this.editing?' editing':'');
      if(!this.presets.length){ const n=document.createElement('div'); n.className='note'; n.textContent='Dial in a look, name it above and save. Exposure and white balance stay with each photo.'; pane.appendChild(n); }
      this.presets.forEach(ps=>{
        const c=document.createElement('div'); c.className='pc';
        const tp=Object.assign({},Engine.p,ps.settings);
        c.innerHTML=`<div class="th" style="${Engine.src?`background-image:url(${this.thumb(tp,192,220)})`:''}"></div><div class="nm">${ps.name.replace(/</g,'&lt;')}</div><button class="del">×</button>`;
        c.querySelector('.del').onclick=e=>{ e.stopPropagation(); this.presets=this.presets.filter(x=>x!==ps); this.savePresets(); this.showTab('presets'); };
        c.onclick=async()=>{ if(this.editing) return; Engine.p=Object.assign({},Engine.p,ps.settings); await Engine.ensureLuts(Engine.p); this.changed(); this.commit(); this.toast('Applied “'+ps.name+'”'); };
        list.appendChild(c);
      });
      pane.appendChild(list);
    }
    if(keepScroll) pane.scrollTop=sy;
  },
  savePresets(){ try{ localStorage.setItem('dr.presets',JSON.stringify(this.presets)); }catch(e){} },
  histo(){ const h=Engine.histogram(Engine.hoverParams||Engine.p); UI.drawHisto($('#histo'),h); },
  // ----------------------------------------------------------------- save
  async save(){
    if(!this.file) return;
    this.busy('Developing full resolution…'); await new Promise(r=>setTimeout(r,40));
    try{
      const gl=Engine.gl, view=Engine.src;
      const src=await this.decode(this.file, 8192); src.key=view.key;
      const w=src.w,h=src.h, b=Borders.margins(Engine.p.border,w,h);
      let fw=Math.round(w*(1+b.l+b.r)), fh=Math.round(h*(1+b.t+b.b));
      const L={W:fw,H:fh,dpr:1,scale:1,fx:0,fy:0,fw,fh,ix:Math.round(b.l*w),iy:Math.round(b.b*h),iw:w,ih:h,win:[0,0,1,1],b};
      Engine.src=src;
      const bt=Engine.p.border!=='none'?Borders.texture(Engine.p.border,fw,fh,b,Engine.stock()):null;
      const out=GLU.target(fw,fh,'rgba8'), RT={};
      Engine.render({layout:L,target:out,RT,borderTex:bt,forceAfter:true});
      const px=new Uint8Array(fw*fh*4); gl.bindFramebuffer(gl.FRAMEBUFFER,out.f); gl.readPixels(0,0,fw,fh,gl.RGBA,gl.UNSIGNED_BYTE,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      GLU.free(out); for(const k in RT) GLU.free(RT[k]); gl.deleteTexture(src.tex); Engine.src=view; Borders.cache.key=''; Engine.dirty=true;
      const c=document.createElement('canvas'); c.width=fw; c.height=fh; const x=c.getContext('2d'); const id=x.createImageData(fw,fh);
      for(let y=0;y<fh;y++) id.data.set(px.subarray((fh-1-y)*fw*4,(fh-y)*fw*4),y*fw*4); x.putImageData(id,0,0);
      const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.93)); c.width=c.height=1;
      this.exportBlob=blob; const url=URL.createObjectURL(blob); $('#saveImg').src=url;
      const s=Engine.stock(); $('#saveInfo').textContent=`${s.maker==='CineStill'?'CineStill ':''}${s.name} · ${fw}×${fh}`;
      this.busy(); $('#saveSheet').classList.add('on');
    }catch(e){ this.busy(); console.error(e); this.toast('Save failed: '+e.message); }
  },
  async share(){
    const s=Engine.stock(), f=new File([this.exportBlob], `${this.name} - ${s.name}.jpg`, {type:'image/jpeg'});
    if(navigator.canShare && navigator.canShare({files:[f]})){ try{ await navigator.share({files:[f]}); }catch(e){ if(e.name!=='AbortError') this.toast(e.message); } }
    else { const a=document.createElement('a'); a.href=$('#saveImg').src; a.download=f.name; a.click(); }
  },
  // ----------------------------------------------------------------- events
  bind(){
    const fi=$('#fileIn'); const pick=()=>fi.click();
    $('#btnOpen').onclick=pick; $('#emptyOpen').onclick=pick;
    fi.onchange=e=>{ const f=e.target.files[0]; e.target.value=''; this.open(f); };
    $('#btnSave').onclick=()=>this.save(); $('#saveShare').onclick=()=>this.share(); $('#saveClose').onclick=()=>$('#saveSheet').classList.remove('on');
    $('#btnUndo').onclick=()=>this.undo();
    document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>this.showTab(b.dataset.t));
    // press & hold to see the original (on the image or the ◐ button)
    const hold=(el)=>{ const on=e=>{ if(!Engine.src) return; e.preventDefault(); Engine.before=true; $('#tag').classList.add('on'); Engine.dirty=true; };
      const off=()=>{ if(!Engine.before) return; Engine.before=false; $('#tag').classList.remove('on'); Engine.dirty=true; };
      el.addEventListener('pointerdown',on); ['pointerup','pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,off)); };
    hold($('#stage')); hold($('#btnCompare'));
    window.addEventListener('resize',()=>{ Engine.dirty=true; });
    document.addEventListener('gesturestart',e=>e.preventDefault());
  },
  busy(m){ $('#busy').classList.toggle('on',!!m); $('#busyMsg').textContent=m||''; },
  toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(this._to); this._to=setTimeout(()=>t.classList.remove('on'),2200); },
};
window.addEventListener('DOMContentLoaded',()=>M.start());
