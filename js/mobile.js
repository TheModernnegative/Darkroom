// Splat Darkroom — iPhone web app (film + adjustments).
const $=s=>document.querySelector(s);
const M = {
  file:null, name:'', tab:'film', hist:[], fut:[], presets:[], editing:false, thumbs:{}, exportBlob:null,
  async start(){
    try{ Engine.init($('#view')); }catch(e){ $('#empty').innerHTML='<div class="big">This needs a newer iPhone browser (WebGL 2).</div>'; return; }
    Engine.pad=6;
    await Engine.loadManifest();
    try{ this.presets=JSON.parse(localStorage.getItem('dr.presets')||'[]'); const last=JSON.parse(localStorage.getItem('dr.last')||'null'); if(last){ Engine.p=withDefaults(last); PER_PHOTO_KEYS.forEach(k=>Engine.p[k]=cloneParams(DEFAULTS[k])); } }catch(e){}
    await Engine.ensureLuts(Engine.p);
    this.kit(); Tools.init(this); this.bind(); this.showTab('film'); this.title();
    if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
    const loop=()=>{ if(Engine.dirty&&Engine.src){ Engine.dirty=false; const p=Engine.hoverParams||Engine.p; this._lastL=Engine.layout(p); Engine.render({params:p,layout:this._lastL,borderTex:this.borderTex()}); Tools.overlay(); this.histo(); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  },
  // ----------------------------------------------------------------- photo
  async open(f){
    if(!f) return; this.file=f; this.name=(f.name||'photo').replace(/\.[^.]+$/,'');
    this.busy('Opening…');
    try{
      const src=await this.decode(f, 2048);
      if(Engine.src) Engine.gl.deleteTexture(Engine.src.tex);
      PER_PHOTO_KEYS.filter(k=>!['ev','temp','tint'].includes(k)).forEach(k=>Engine.p[k]=cloneParams(DEFAULTS[k])); delete Engine.p.cropPortrait;
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
  borderTex(){ const p=Engine.hoverParams||Engine.p; if(!Engine.src||p.border==='none'||Engine.cropMode) return null; const L=this._lastL||Engine.layout(); return Borders.texture(p.border,L.fw,L.fh,L.b,Engine.stock(p.stock)); },
  // small offscreen render of the current photo with params → dataURL
  thumb(params,W,H){
    const s=Engine.src; if(!s) return ''; const [sw,sh]=Engine.dims(params);
    const sc=Math.max(W/sw,H/sh), w=Math.round(sw*sc), h=Math.round(sh*sc);
    const keepCrop=Engine.cropMode; Engine.cropMode=false;
    this._tt=GLU.ensure(this._tt,W,H,'rgba8');
    const L={W,H,dpr:1,scale:sc,fx:(W-w)/2,fy:(H-h)/2,fw:w,fh:h,ix:(W-w)/2,iy:(H-h)/2,iw:w,ih:h,win:[0,0,1,1],b:{l:0,r:0,t:0,b:0}};
    Engine.render({layout:L,target:this._tt,RT:this._tRT||(this._tRT={}),params:Object.assign({},params,{border:'none'}),forceAfter:true}); Engine.cropMode=keepCrop;
    const gl=Engine.gl, px=new Uint8Array(W*H*4); gl.bindFramebuffer(gl.FRAMEBUFFER,this._tt.f); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const c=this._tc||(this._tc=document.createElement('canvas')); c.width=W; c.height=H; const x=c.getContext('2d'); const id=x.createImageData(W,H);
    for(let y=0;y<H;y++) id.data.set(px.subarray((H-1-y)*W*4,(H-y)*W*4),y*W*4); x.putImageData(id,0,0);
    Engine.dirty=true; return c.toDataURL('image/jpeg',0.82);
  },
  async makeThumbs(){
    // one live thumbnail per stock, rendered from your photo with your current edit
    for(const s of Engine.manifest.stocks){
      if(!Engine.src) return;
      const p=Object.assign(cloneParams(Engine.p),{stock:s.id,paper:null}); await Engine.ensureLuts(p);
      this.thumbs[s.id]=this.thumb(p,156,192);
      const el=document.querySelector(`.card[data-id="${s.id}"] .th`); if(el) el.style.backgroundImage=`url(${this.thumbs[s.id]})`;
      await new Promise(r=>setTimeout(r,0));
    }
  },
  // ----------------------------------------------------------------- edits
  thumbSoon(){},
  changed(){ Engine.dirty=true; this.title(); clearTimeout(this._sv); this._sv=setTimeout(()=>{ try{ localStorage.setItem('dr.last',JSON.stringify(Engine.p)); }catch(e){} },400); },
  commit(){ const s=JSON.stringify(Engine.p); if(this.hist[this.hist.length-1]!==s){ this.hist.push(s); this.fut=[]; if(this.hist.length>100) this.hist.shift(); } },
  async undo(){ if(this.hist.length<2){ this.toast('Nothing to undo'); return; } this.fut.push(this.hist.pop()); Engine.p=withDefaults(JSON.parse(this.hist[this.hist.length-1])); await Engine.ensureLuts(Engine.p); this.changed(); this.showTab(this.tab); },
  async setStock(id){ Engine.p.stock=id; Engine.p.paper=null; await Engine.ensureLuts(Engine.p); this.changed(); this.commit(); this.showTab('film',true); },
  title(){ const s=Engine.stock(); $('#title').innerHTML=`<b>${s.maker==='CineStill'?'CineStill ':''}${s.name}</b> · ${Engine.paperFor(Engine.p).name}`; },
  kit(){
    const M=this;
    UI.panel=(parent,id,title,open,reset)=>{ const h=document.createElement('div'); h.className='paneHead'; h.innerHTML=`<span>${title}</span>`+(reset?'<button>Reset</button>':'');
      if(reset) h.querySelector('button').onclick=()=>{ reset(); M.showTab(M.tab,true); }; parent.appendChild(h); const b=document.createElement('div'); parent.appendChild(b); return b; };
    UI.slider=(parent,key,label,o)=>M.slider(parent,key,label||'',o);
    UI.seg=(parent,key,label,opts,get,set)=>M.seg(parent,label,opts,get,set);
    UI.select=(parent,key,label,optsFn,get,set)=>M.seg(parent,label,optsFn(),get,set);
    UI.note=(parent,html)=>{ const n=document.createElement('div'); n.className='note'; n.innerHTML=html; parent.appendChild(n); return n; };
    UI.button=(parent,label,fn,cls)=>{ const b=document.createElement('button'); b.className='pbtn'; b.textContent=label; b.onclick=fn; parent.appendChild(b); return b; };
  },
  // ----------------------------------------------------------------- panes
  slider(parent,key,label,o){
    const d=document.createElement('div'); d.className='sl';
    d.innerHTML=`<div class="top"><span>${label}</span><span></span></div><input type="range" min="${o.min}" max="${o.max}" step="${o.step}">`;
    const r=d.querySelector('input'), v=d.querySelector('.top span:last-child'); if(o.track) r.style.setProperty('--trk',o.track);
    const fmt=o.fmt||(x=>(x>0?'+':'')+Math.round(x)), def=o.def!=null?o.def:DEFAULTS[key];
    const get=o.get||(()=>Engine.p[key]), set=o.set||(x=>{ Engine.p[key]=x; this.changed(); });
    const show=()=>{ const x=get(); r.value=x; v.textContent=fmt(x); d.classList.toggle('changed',Math.abs(x-def)>1e-6); };
    r.oninput=()=>{ set(+r.value); show(); };
    r.onchange=()=>(o.commit||(()=>this.commit()))();
    let lt=0; d.querySelector('.top').onclick=()=>{ const n=Date.now(); if(n-lt<350){ set(def); show(); this.commit(); } lt=n; };
    parent.appendChild(d); show(); UI.sliders[key]=show; return d;
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
    if(this.tab==='crop' && t!=='crop' && Engine.cropMode) Tools.setCropMode(false);
    this.tab=t; document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
    UI.sliders={};
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
      Tools.buildCurvePanel(pane,true);
    } else if(t==='color'){
      this.head(pane,'White balance',['temp','tint']);
      S('temp','Temp',{min:-100,max:100,step:1,track:'linear-gradient(90deg,#3c6bd6,#777 50%,#e4c03a)'});
      S('tint','Tint',{min:-100,max:100,step:1,track:'linear-gradient(90deg,#3fae4a,#777 50%,#c446c0)'});
      this.head(pane,'Presence',['vibrance','saturation']);
      S('vibrance','Vibrance',{min:-100,max:100,step:1}); S('saturation','Saturation',{min:-100,max:100,step:1});
      Tools.buildHSLPanel(pane,true); Tools.buildGradingPanel(pane,true);
    } else if(t==='crop'){
      if(Engine.src && !Engine.cropMode) Tools.setCropMode(true);
      Tools.buildCropPanel(pane,true);
      const tb=pane.querySelector('.pbtn'); if(tb){ tb.textContent='Done'; tb.onclick=()=>this.showTab('film'); }
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
        const settings={}; Object.keys(DEFAULTS).filter(k=>!PER_PHOTO_KEYS.includes(k)).forEach(k=>settings[k]=cloneParams(Engine.p[k]));
        const ex=this.presets.find(x=>x.name.toLowerCase()===n.toLowerCase()); if(ex) ex.settings=settings; else this.presets.unshift({id:'p'+Date.now(),name:n,settings});
        this.savePresets(); inp.blur(); this.toast('Saved “'+n+'”'); this.showTab('presets'); };
      pane.appendChild(nw);
      const io=document.createElement('div'); io.className='btnrow'; pane.appendChild(io);
      UI.button(io,'Import presets…',()=>this.importPresets()); UI.button(io,'Share presets…',()=>this.exportPresets());
      const list=document.createElement('div'); list.className='plist'+(this.editing?' editing':'');
      if(!this.presets.length){ const n=document.createElement('div'); n.className='note'; n.textContent='Dial in a look, name it above and save. Exposure and white balance stay with each photo.'; pane.appendChild(n); }
      this.presets.forEach(ps=>{
        const c=document.createElement('div'); c.className='pc';
        const tp=Object.assign(cloneParams(Engine.p),cloneParams(ps.settings));
        c.innerHTML=`<div class="th" style="${Engine.src?`background-image:url(${this.thumb(tp,192,220)})`:''}"></div><div class="nm">${ps.name.replace(/</g,'&lt;')}</div><button class="del">×</button>`;
        c.querySelector('.del').onclick=e=>{ e.stopPropagation(); this.presets=this.presets.filter(x=>x!==ps); this.savePresets(); this.showTab('presets'); };
        c.onclick=async()=>{ if(this.editing) return; Engine.p=Object.assign(cloneParams(Engine.p),cloneParams(ps.settings)); await Engine.ensureLuts(Engine.p); this.changed(); this.commit(); this.toast('Applied “'+ps.name+'”'); };
        list.appendChild(c);
      });
      pane.appendChild(list);
    }
    if(keepScroll) pane.scrollTop=sy;
  },
  exportPresets(){ if(!this.presets.length){ this.toast('Save a preset first'); return; }
    const f=new File([Tools.presetFile(this.presets)],'Darkroom Presets.darkroom.json',{type:'application/json'});
    if(navigator.canShare&&navigator.canShare({files:[f]})) navigator.share({files:[f]}).catch(()=>{}); else { const a=document.createElement('a'); a.href=URL.createObjectURL(f); a.download=f.name; a.click(); } },
  importPresets(){ const i=document.createElement('input'); i.type='file'; i.accept='.json,application/json,text/plain'; i.onchange=async()=>{ if(!i.files[0]) return;
      try{ const inc=Tools.parsePresetFile(await i.files[0].text()); Tools.mergePresets(this.presets,inc); this.savePresets(); this.toast(`Imported ${inc.length} preset${inc.length===1?'':'s'}`); this.showTab('presets'); }catch(e){ this.toast('Not a preset file'); } }; i.click(); },
  savePresets(){ try{ localStorage.setItem('dr.presets',JSON.stringify(this.presets)); }catch(e){} },
  histo(){ const h=Engine.histogram(Engine.hoverParams||Engine.p); UI.drawHisto($('#histo'),h); },
  // ----------------------------------------------------------------- save
  async save(){
    if(!this.file) return;
    this.busy('Developing full resolution…'); await new Promise(r=>setTimeout(r,40));
    try{
      const gl=Engine.gl, view=Engine.src;
      const src=await this.decode(this.file, 8192); src.key=view.key;
      const keepCrop=Engine.cropMode; Engine.cropMode=false;
      const [dw,dh]=Engine.dims(Engine.p,src); const w=Math.round(dw), h=Math.round(dh), b=Borders.margins(Engine.p.border,w,h);
      let fw=Math.round(w*(1+b.l+b.r)), fh=Math.round(h*(1+b.t+b.b));
      const L={W:fw,H:fh,dpr:1,scale:w/dw,fx:0,fy:0,fw,fh,ix:Math.round(b.l*w),iy:Math.round(b.b*h),iw:w,ih:h,win:[0,0,1,1],b};
      Engine.src=src;
      const bt=Engine.p.border!=='none'?Borders.texture(Engine.p.border,fw,fh,b,Engine.stock()):null;
      const c=document.createElement('canvas'); c.width=fw; c.height=fh;
      let x=null; try{ x=c.getContext('2d',{colorSpace:'display-p3'}); }catch(e){}
      if(!x) x=c.getContext('2d'); const p3=!!(x.getContextAttributes&&x.getContextAttributes().colorSpace==='display-p3');
      const out=GLU.target(fw,fh,'rgba8'), RT={};
      Engine.render({layout:L,target:out,RT,borderTex:bt,forceAfter:true,p3});
      Engine.cropMode=keepCrop;
      const px=new Uint8Array(fw*fh*4); gl.bindFramebuffer(gl.FRAMEBUFFER,out.f); gl.readPixels(0,0,fw,fh,gl.RGBA,gl.UNSIGNED_BYTE,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      GLU.free(out); for(const k in RT) GLU.free(RT[k]); gl.deleteTexture(src.tex); Engine.src=view; Borders.cache.key=''; Engine.dirty=true;
      const id=p3?x.createImageData(fw,fh,{colorSpace:'display-p3'}):x.createImageData(fw,fh);
      for(let y=0;y<fh;y++) id.data.set(px.subarray((fh-1-y)*fw*4,(fh-y)*fw*4),y*fw*4); x.putImageData(id,0,0);
      let blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.93)); c.width=c.height=1;
      try{ blob=await Exif.carry(this.file,blob); }catch(e){}
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
  // ----------------------------------------------------------------- crop gestures on the photo
  cropEvents(){ const st=$('#stage'), v=$('#view');
    st.addEventListener('pointerdown',e=>{ if(!Engine.cropMode) return; e.stopImmediatePropagation(); st.setPointerCapture(e.pointerId); Tools.cropPointer('down',e,v); },true);
    st.addEventListener('pointermove',e=>{ if(!Engine.cropMode) return; Tools.cropPointer('move',e,v); },true);
    ['pointerup','pointercancel'].forEach(t=>st.addEventListener(t,e=>{ if(!Engine.cropMode) return; e.stopImmediatePropagation(); Tools.cropPointer('up',e,v); },true));
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
    const hold=(el)=>{ const on=e=>{ if(!Engine.src||Engine.cropMode) return; e.preventDefault(); Engine.before=true; $('#tag').classList.add('on'); Engine.dirty=true; };
      const off=()=>{ if(!Engine.before) return; Engine.before=false; $('#tag').classList.remove('on'); Engine.dirty=true; };
      el.addEventListener('pointerdown',on); ['pointerup','pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,off)); };
    this.cropEvents(); hold($('#stage')); hold($('#btnCompare'));
    window.addEventListener('resize',()=>{ Engine.dirty=true; });
    document.addEventListener('gesturestart',e=>e.preventDefault());
  },
  busy(m){ $('#busy').classList.toggle('on',!!m); $('#busyMsg').textContent=m||''; },
  toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(this._to); this._to=setTimeout(()=>t.classList.remove('on'),2200); },
};
window.addEventListener('DOMContentLoaded',()=>M.start());

// Copy the camera EXIF from the original JPEG into the developed JPEG (orientation reset to 1,
// since the pixels are already upright). HEIC originals are usually handed over as JPEG by iOS.
const Exif = {
  async carry(orig,blob){
    const a=new Uint8Array(await orig.slice(0,256*1024).arrayBuffer());
    if(a[0]!==0xFF||a[1]!==0xD8) return blob;
    let i=2, app1=null;
    while(i+4<a.length && a[i]===0xFF){ const m=a[i+1], len=(a[i+2]<<8)|a[i+3];
      if(m===0xE1 && a[i+4]===0x45 && a[i+5]===0x78 && a[i+6]===0x69 && a[i+7]===0x66){ app1=a.slice(i,i+2+len); break; }
      if(m===0xDA) break; i+=2+len; }
    if(!app1) return blob;
    this.fixOrientation(app1);
    const b=new Uint8Array(await blob.arrayBuffer());
    // insert after SOI (and after a JFIF APP0 if present)
    let j=2; if(b[2]===0xFF&&b[3]===0xE0) j=4+((b[4]<<8)|b[5]);
    return new Blob([b.slice(0,j),app1,b.slice(j)],{type:'image/jpeg'});
  },
  fixOrientation(seg){ const t=10; const le=seg[t]===0x49; const r16=o=>le?seg[o]|(seg[o+1]<<8):(seg[o]<<8)|seg[o+1];
    const r32=o=>le?(seg[o]|(seg[o+1]<<8)|(seg[o+2]<<16)|(seg[o+3]<<24))>>>0:((seg[o]<<24)|(seg[o+1]<<16)|(seg[o+2]<<8)|seg[o+3])>>>0;
    const ifd=t+r32(t+4); const n=r16(ifd);
    for(let k=0;k<n;k++){ const e=ifd+2+k*12; if(r16(e)===0x0112){ if(le){ seg[e+8]=1; seg[e+9]=0; } else { seg[e+8]=0; seg[e+9]=1; } } } },
};
