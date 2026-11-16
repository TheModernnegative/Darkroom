// Bridge to the native macOS shell (falls back to browser behaviour when absent).
(function(){
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native;
  const pending = new Map(); let nextId = 1; const listeners = {};
  window.__native = {
    resolve(o){ const p = pending.get(o.id); if(!p) return; pending.delete(o.id); o.error ? p.reject(new Error(o.error)) : p.resolve(o.value); },
    event(o){ (listeners[o.event]||[]).forEach(f=>{ try{ f(o.data); }catch(e){ console.error(e); } }); }
  };
  window.Native = {
    available: !!handler,
    call(cmd, args={}){
      if(!handler) return Promise.reject(new Error('native unavailable'));
      const id = nextId++;
      return new Promise((resolve,reject)=>{ pending.set(id,{resolve,reject}); handler.postMessage(Object.assign({id,cmd},args)); });
    },
    on(ev, f){ (listeners[ev] = listeners[ev] || []).push(f); },
    fileURL(path){ return 'darkroom://file/?path=' + encodeURIComponent(path); },
    decodeURL(path, max, hdr){ return 'darkroom://decode/?path=' + encodeURIComponent(path) + '&max=' + (max||0) + '&hdr=' + (hdr?1:0); },
  };
})();
