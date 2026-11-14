// UI building blocks: Lightroom-style panels, sliders, presets, histogram.
const UI = {
  sliders:{},
  panel(parent, id, title, open=true, resetFn){
    const s=document.createElement('section'); s.className='panel'+(open?' open':''); s.id=id;
    s.innerHTML=`<h3><i></i>${title}${resetFn?'<span class="reset">RESET</span>':''}</h3><div class="body"></div>`;
    s.querySelector('h3').addEventListener('click',e=>{ if(e.target.classList.contains('reset')){ resetFn(); return; } s.classList.toggle('open'); });
    parent.appendChild(s); return s.querySelector('.body');
  },
  // opts: {min,max,step,def,fmt,track,get,set,commit}
  slider(parent,key,label,o){
    const d=document.createElement('div'); d.className='sl';
    d.innerHTML=`<label>${label}</label><input type="range" min="${o.min}" max="${o.max}" step="${o.step}"><input class="val" spellcheck="false">`;
    const r=d.querySelector('input[type=range]'), v=d.querySelector('.val'), lab=d.querySelector('label');
    if(o.track) r.style.setProperty('--trk',o.track);
    const fmt=o.fmt||(x=>(x>0?'+':'')+Math.round(x));
    const show=()=>{ const x=o.get(); r.value=x; if(document.activeElement!==v) v.value=fmt(x); d.classList.toggle('changed', Math.abs(x-o.def)>1e-6); };
    r.addEventListener('input',()=>{ o.set(+r.value); show(); });
    r.addEventListener('change',()=>o.commit&&o.commit());
    r.addEventListener('dblclick',()=>{ o.set(o.def); show(); o.commit&&o.commit(); });
    lab.addEventListener('dblclick',()=>{ o.set(o.def); show(); o.commit&&o.commit(); });
    v.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const x=parseFloat(v.value.replace(/[^\d.+-]/g,'')); if(!isNaN(x)){ o.set(Math.max(o.min,Math.min(o.max, o.parse?o.parse(x):x))); } v.blur(); show(); o.commit&&o.commit(); } e.stopPropagation(); });
    v.addEventListener('blur',show);
    // fine adjust with arrow keys while hovering (Lightroom: hover + up/down)
    d.addEventListener('wheel',e=>{ if(!e.altKey) return; e.preventDefault(); o.set(Math.max(o.min,Math.min(o.max,o.get()-Math.sign(e.deltaY)*o.step))); show(); });
    parent.appendChild(d); this.sliders[key]=show; show(); return d;
  },
  seg(parent,key,label,options,get,set){
    const d=document.createElement('div'); d.className='row'; d.innerHTML=(label?`<label>${label}</label>`:'')+'<div class="seg"></div>';
    const box=d.querySelector('.seg');
    options.forEach(([val,txt])=>{ const b=document.createElement('button'); b.textContent=txt; b.dataset.v=val; b.onclick=()=>{ set(val); show(); }; box.appendChild(b); });
    const show=()=>box.querySelectorAll('button').forEach(b=>b.classList.toggle('on',String(get())===b.dataset.v));
    parent.appendChild(d); this.sliders[key]=show; show(); return d;
  },
  select(parent,key,label,optionsFn,get,set){
    const d=document.createElement('div'); d.className='row'; d.innerHTML=`<label>${label}</label><select></select>`;
    const sel=d.querySelector('select');
    const show=()=>{ const opts=optionsFn(); sel.innerHTML='';
      opts.forEach(o=>{ if(o.group){ const g=document.createElement('optgroup'); g.label=o.group; o.items.forEach(([v,t])=>{ const op=document.createElement('option'); op.value=v; op.textContent=t; g.appendChild(op); }); sel.appendChild(g); }
        else { const op=document.createElement('option'); op.value=o[0]; op.textContent=o[1]; sel.appendChild(op); } });
      sel.value=get(); };
    sel.onchange=()=>set(sel.value);
    parent.appendChild(d); this.sliders[key]=show; show(); return d;
  },
  check(parent,key,label,get,set){
    const d=document.createElement('label'); d.className='chk'; d.innerHTML=`<input type="checkbox"><span>${label}</span>`;
    const c=d.querySelector('input'); c.onchange=()=>set(c.checked);
    const show=()=>{ c.checked=!!get(); }; parent.appendChild(d); this.sliders[key]=show; show(); return d;
  },
  note(parent,html,id){ const d=document.createElement('div'); d.className='note'; if(id) d.id=id; d.innerHTML=html; parent.appendChild(d); return d; },
  button(parent,label,fn,cls='tbtn'){ const b=document.createElement('button'); b.className=cls; b.textContent=label; b.onclick=fn; parent.appendChild(b); return b; },
  refresh(){ for(const k in this.sliders) this.sliders[k](); },

  // ---------------------------------------------------------------- presets
  buildPresets(el, stocks, onPick, onHover){
    const groups={}; const order=[];
    stocks.forEach(s=>{ if(!groups[s.group]){ groups[s.group]=[]; order.push(s.group); } groups[s.group].push(s); });
    el.innerHTML='';
    order.forEach((g,gi)=>{
      const G=document.createElement('div'); G.className='pgroup open'; G.innerHTML=`<div class="gh"><i></i>${g}</div><div class="items"></div>`;
      G.querySelector('.gh').onclick=()=>G.classList.toggle('open');
      const items=G.querySelector('.items');
      groups[g].forEach(s=>{
        const it=document.createElement('div'); it.className='preset'; it.dataset.id=s.id; it.title=s.desc;
        const nm = s.maker==='CineStill' ? 'CineStill '+s.name : s.name; const mk = (s.maker==='Kodak'||s.maker==='CineStill'||(s.maker==='Fujifilm'&&g==='Fujifilm')) ? '' : s.maker;
        it.innerHTML=`<span>${nm}</span><span class="mk">${mk}</span><span class="iso">${s.iso||""}</span>`;
        it.onclick=()=>onPick(s.id); it.onmouseenter=()=>onHover(s.id); it.onmouseleave=()=>onHover(null);
        items.appendChild(it); });
      el.appendChild(G);
    });
  },
  markPreset(id){ document.querySelectorAll('.preset').forEach(p=>p.classList.toggle('on',p.dataset.id===id)); },
  filterPresets(q){ q=q.toLowerCase(); document.querySelectorAll('.preset').forEach(p=>{ p.style.display=!q||p.textContent.toLowerCase().includes(q)?'':'none'; }); },

  // ---------------------------------------------------------------- histogram (Lightroom style)
  drawHisto(canvas,h){
    const dpr=window.devicePixelRatio||1, W=Math.round(canvas.clientWidth*dpr), H=Math.round(canvas.clientHeight*dpr);
    if(canvas.width!==W||canvas.height!==H){ canvas.width=W; canvas.height=H; }
    const x=canvas.getContext('2d'); x.clearRect(0,0,W,H);
    // zones
    x.fillStyle='#1d1d1d'; x.fillRect(0,0,W,H);
    x.strokeStyle='#2a2a2a'; x.lineWidth=1; for(let i=1;i<4;i++){ const px=Math.round(W*i/4)+.5; x.beginPath(); x.moveTo(px,0); x.lineTo(px,H); x.stroke(); }
    if(!h){ return; }
    const sm=a=>{ const o=new Float32Array(256); for(let i=0;i<256;i++){ let s=0,w=0; for(let k=-2;k<=2;k++){ const j=i+k; if(j<0||j>255) continue; const wt=3-Math.abs(k); s+=a[j]*wt; w+=wt; } o[i]=s/w; } return o; };
    const R=sm(h.r),G=sm(h.g),B=sm(h.b);
    let mx=1; for(let i=2;i<254;i++) mx=Math.max(mx,R[i],G[i],B[i]);
    const top=H*0.94, f=v=>top*Math.pow(Math.min(1,v/mx),0.62);
    const path=(a)=>{ x.beginPath(); x.moveTo(0,H); for(let i=0;i<256;i++) x.lineTo(i/255*W,H-f(a[i])); x.lineTo(W,H); x.closePath(); };
    x.globalCompositeOperation='lighter';
    [[R,'rgba(170,48,44,.62)'],[G,'rgba(48,140,56,.62)'],[B,'rgba(48,78,175,.68)']].forEach(([a,c])=>{ path(a); x.fillStyle=c; x.fill(); });
    x.globalCompositeOperation='source-over';
    const lo=(h.r[0]+h.g[0]+h.b[0])/h.n, hi=(h.r[255]+h.g[255]+h.b[255])/h.n;
    const cl=document.getElementById('clipLo'), ch=document.getElementById('clipHi');
    if(cl) cl.classList.toggle('hot',lo>0.003); if(ch) ch.classList.toggle('hot',hi>0.003);
  },
};
