// Lightroom Classic catalog import (.lrcat is SQLite): ratings, flags, colour labels, keywords, collections and the basic Develop settings.
const LRImport = {
  async sql(){ if(this._SQL) return this._SQL;
    if(!window.initSqlJs) await new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='js/vendor/sql-wasm.js'; s.onload=res; s.onerror=()=>rej(new Error('could not load the SQLite reader')); document.head.appendChild(s); });
    const wasmBinary=await (await fetch('js/vendor/sql-wasm.wasm')).arrayBuffer(); this._SQL=await initSqlJs({wasmBinary}); return this._SQL; },
  rows(db,q){ try{ const r=db.exec(q)[0]; if(!r) return []; return r.values.map(v=>Object.fromEntries(r.columns.map((c,i)=>[c,v[i]]))); }catch(e){ console.warn('lrcat query',e.message); return []; } },
  // Develop settings are stored as a Lua table: s = { Exposure2012 = 0.35, ToneCurvePV2012 = { 0, 0, 255, 255 }, ... }
  parseDev(t){ const o={}; if(!t) return o; const re=/\b([A-Za-z0-9_]+)\s*=\s*(-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|true|false|\{[^{}]*\})/g; let m;
    while((m=re.exec(t))){ const v=m[2]; if(o[m[1]]!==undefined) continue; o[m[1]]=v[0]==='{'?v.slice(1,-1).split(',').map(x=>x.trim()).filter(x=>/^-?[\d.]+$/.test(x)).map(Number):v[0]==='"'?v.slice(1,-1):v==='true'?true:v==='false'?false:+v; }
    return o; },
  toParams(d){ const p={}, has=k=>typeof d[k]==='number', cl=(v,a,b)=>Math.max(a,Math.min(b,v));
    if(has('Exposure2012')) p.ev=cl(d.Exposure2012,-4,4); else if(has('Exposure')) p.ev=cl(d.Exposure,-4,4);
    [['Contrast2012','contrast'],['Highlights2012','highlights'],['Shadows2012','shadows'],['Whites2012','whites'],['Blacks2012','blacks'],['Vibrance','vibrance'],['Saturation','saturation']].forEach(([a,b])=>{ if(has(a)&&d[a]) p[b]=cl(Math.round(d[a]),-100,100); });
    if(has('IncrementalTemperature')&&d.IncrementalTemperature) p.temp=cl(Math.round(d.IncrementalTemperature),-100,100);
    if(has('IncrementalTint')&&d.IncrementalTint) p.tint=cl(Math.round(d.IncrementalTint),-100,100);
    const bands=['Red','Orange','Yellow','Green','Aqua','Blue','Purple','Magenta'];
    [['Hue','hslH'],['Saturation','hslS'],['Luminance','hslL']].forEach(([a,b])=>{ const arr=bands.map(n=>d[a+'Adjustment'+n]||0); if(arr.some(Boolean)) p[b]=arr.map(v=>cl(Math.round(v),-100,100)); });
    const tc=d.ToneCurvePV2012; if(Array.isArray(tc)&&tc.length>=4&&tc.length%2===0){ const pts=[]; for(let i=0;i<tc.length;i+=2) pts.push([tc[i]/255,tc[i+1]/255]); if(pts.some(([x,y])=>Math.abs(x-y)>0.004)) p.curve={m:pts,r:[[0,0],[1,1]],g:[[0,0],[1,1]],b:[[0,0],[1,1]]}; }
    if(has('SplitToningShadowSaturation')&&d.SplitToningShadowSaturation){ p.gShH=d.SplitToningShadowHue||0; p.gShS=d.SplitToningShadowSaturation; }
    if(has('SplitToningHighlightSaturation')&&d.SplitToningHighlightSaturation){ p.gHiH=d.SplitToningHighlightHue||0; p.gHiS=d.SplitToningHighlightSaturation; }
    if(has('ColorGradeMidtoneSat')&&d.ColorGradeMidtoneSat){ p.gMidH=d.ColorGradeMidtoneHue||0; p.gMidS=d.ColorGradeMidtoneSat; }
    if(has('SplitToningBalance')&&d.SplitToningBalance) p.gBalance=d.SplitToningBalance;
    if(has('GrainAmount')&&d.GrainAmount) p.grain=cl(Math.round(d.GrainAmount),0,100);
    if(d.ConvertToGrayscale===true) p.silver=true;
    if(d.HasCrop===true||(has('CropLeft')&&(d.CropLeft>0||d.CropTop>0||d.CropRight<1||d.CropBottom<1))){ const x=d.CropLeft||0,y=d.CropTop||0,r=has('CropRight')?d.CropRight:1,b=has('CropBottom')?d.CropBottom:1; if(r>x&&b>y) p.crop={x,y,w:r-x,h:b-y}; }
    if(has('CropAngle')&&d.CropAngle) p.angle=cl(d.CropAngle,-45,45);
    return p; },
  async run(app,testBytes){
    let path=null, bytes=testBytes||null;
    if(bytes){}
    else if(Native.available){ const r=await Native.call('open',{multiple:false,exts:['lrcat'],title:'Choose your Lightroom Classic catalog (.lrcat). It is read only — nothing in Lightroom changes.',dir:((app.info&&app.info.splatDir)||'').replace(/\/Documents\/Splat\/?$/,'')+'/Pictures/Lightroom'}); if(!r||!r[0]) return; path=r[0];
      app.busy('Reading '+path.split('/').pop()+'…'); try{ bytes=new Uint8Array(await (await fetch(Native.fileURL(path))).arrayBuffer()); }catch(e){ app.busy(); app.toast('Could not read the catalog: '+e.message); return; } }
    else { const f=await new Promise(res=>{ const i=document.createElement('input'); i.type='file'; i.accept='.lrcat'; i.onchange=()=>res(i.files[0]); i.click(); }); if(!f) return; app.busy('Reading '+f.name+'…'); bytes=new Uint8Array(await f.arrayBuffer()); }
    let db; try{ const SQL=await this.sql(); db=new SQL.Database(bytes); }catch(e){ app.busy(); app.toast('Not a readable Lightroom catalog: '+e.message); return; }
    const imgs=this.rows(db,`SELECT i.id_local id, i.rating, i.pick, i.colorLabels label, i.copyName, i.masterImage, i.captureTime,
        rf.absolutePath||fo.pathFromRoot||f.baseName||'.'||f.extension AS path, d.text dev
      FROM Adobe_images i JOIN AgLibraryFile f ON f.id_local=i.rootFile JOIN AgLibraryFolder fo ON fo.id_local=f.folder JOIN AgLibraryRootFolder rf ON rf.id_local=fo.rootFolder
      LEFT JOIN Adobe_imageDevelopSettings d ON d.image=i.id_local`);
    if(!imgs.length){ db.close(); app.busy(); app.toast('No photos found in that catalog'); return; }
    const cols=this.rows(db,`SELECT id_local id, name, creationId kind, parent FROM AgLibraryCollection`), colImg=this.rows(db,`SELECT collection, image FROM AgLibraryCollectionImage`);
    const kws=this.rows(db,`SELECT ki.image, k.name FROM AgLibraryKeywordImage ki JOIN AgLibraryKeyword k ON k.id_local=ki.tag WHERE k.name IS NOT NULL`);
    db.close();
    const byImg={}; imgs.forEach(r=>{ r.tags=[]; r.cols=[]; r.p=this.toParams(this.parseDev(r.dev)); r.edited=Object.keys(r.p).length>0; byImg[r.id]=r; });
    const colName={}; cols.forEach(c=>colName[c.id]=c.name); colImg.forEach(x=>{ const r=byImg[x.image], n=colName[x.collection]; if(r&&n) r.cols.push(n); });
    kws.forEach(x=>{ const r=byImg[x.image]; if(r) r.tags.push(x.name); });
    const stats={all:imgs.length,rated:imgs.filter(r=>r.rating>0||r.pick).length,edited:imgs.filter(r=>r.edited).length,inCol:imgs.filter(r=>r.cols.length).length,cols:cols.filter(c=>!/smart/i.test(c.kind||'')&&colImg.some(x=>x.collection===c.id)).length};
    app.busy();
    // options
    const opt={which:stats.rated?'rated':'all',edits:true,ratings:true,cols:true}; const body=$('#dlgBody'); body.innerHTML=''; const h=$('#dlg h2'), ok=$('#dlgOk'), kh=h.textContent, ko=ok.textContent; h.textContent='Import Lightroom catalog'; ok.textContent='Import';
    UI.note(body,`<b>${stats.all.toLocaleString()}</b> photos · ${stats.rated.toLocaleString()} rated or flagged · ${stats.edited.toLocaleString()} edited · ${stats.cols} collections`);
    UI.seg(body,'lrwhich','Bring in',[['rated','Rated / flagged ('+stats.rated+')'],['edited','Edited ('+stats.edited+')'],['cols','In a collection ('+stats.inCol+')'],['all','All ('+stats.all+')']],()=>opt.which,v=>opt.which=v);
    UI.check(body,'lrr','Star ratings, picks / rejects',()=>opt.ratings,v=>opt.ratings=v);
    UI.check(body,'lre','Basic edits: exposure, tone, curve, HSL, colour grading, grain, crop, B&W',()=>opt.edits,v=>opt.edits=v);
    UI.check(body,'lrc','Collections → smart collections; keywords become searchable',()=>opt.cols,v=>opt.cols=v);
    UI.note(body,'Your catalog is only read. Photos stay where they are; anything already in the library is updated instead of added twice. Not carried over: masks, healing, profiles and lens corrections, and custom white balance on raw files.');
    $('#dlg').classList.add('on'); const go=await new Promise(r=>{ ok.onclick=()=>r(true); $('#dlgCancel').onclick=()=>r(false); }); $('#dlg').classList.remove('on'); h.textContent=kh; ok.textContent=ko; if(!go) return;
    let pick=imgs.filter(r=>opt.which==='all'||(opt.which==='rated'&&(r.rating>0||r.pick))||(opt.which==='edited'&&r.edited)||(opt.which==='cols'&&r.cols.length));
    // skip files that are not on this Mac any more (moved, or on an unplugged drive)
    let missing=0; if(Native.available){ for(let i=0;i<pick.length;i+=400){ app.busy(`Checking files ${Math.min(i+400,pick.length)} / ${pick.length}…`); const st=await Native.call('stat',{paths:pick.slice(i,i+400).map(r=>r.path)}).catch(()=>[]); st.forEach(x=>{ if(x.size<0){ const r=pick.find(q=>q.path===x.path); if(r) r.missing=true; } }); } missing=pick.filter(r=>r.missing).length; pick=pick.filter(r=>!r.missing); }
    let added=0, updated=0; const ext=/\.(jpe?g|heic|heif|png|tiff?|dng|cr2|cr3|nef|arw|raf|orf|rw2)$/i;
    for(const r of pick){ if(!ext.test(r.path)) continue;
      let it=app.items.find(x=>x.path===r.path&&!x.lrId)||app.items.find(x=>x.lrId===r.id); const isNew=!it;
      if(isNew){ it=app.newItem({name:r.path.split('/').pop()+(r.copyName?' ('+r.copyName+')':''),path:r.path,kind:'photo'}); it.hist=[]; added++; } else updated++;
      it.lrId=r.id;
      if(opt.ratings){ if(r.rating>0) it.rating=Math.round(r.rating); if(r.pick==1) it.flag='pick'; else if(r.pick==-1) it.flag='reject'; }
      if(opt.cols){ it.tags=[...new Set([...(it.tags||[]),...r.tags,...r.cols])]; it.lrCols=[...new Set([...(it.lrCols||[]),...r.cols])]; }
      if(opt.edits&&r.edited){ const s=withDefaults(Object.assign(cloneParams(it.settings||withDefaults({})),cloneParams(r.p))); it.settings=s; it.hist=it.hist||[]; it.hist.push(JSON.stringify(s)); it.thumb=null; it.thumbStale=true; }
      else if(isNew) it.hist=[JSON.stringify(it.settings)]; }
    if(opt.cols){ app.smart=app.smart||[]; const used=new Set(pick.flatMap(r=>r.cols)); for(const n of used) if(!app.smart.some(c=>c.tag===n)) app.smart.push({id:'lr'+Math.random().toString(36).slice(2,8),name:n,filter:'all',q:'',tag:n}); app.renderLibFilter(); }
    if(app.cur&&app.cur.settings) { await app.applySettings(app.cur.settings); }
    app.busy(); app.renderStrip(); app.renderGrid&&app.renderGrid(); app.saveSoon();
    app.toast(`Lightroom: ${added} added, ${updated} updated`+(missing?` · ${missing} not found on this Mac`:'')+(opt.cols&&stats.cols?' · collections are in the filter menu':''));
    if(!app.cur&&app.items.length) app.select(app.items[0].id);
  }
};
