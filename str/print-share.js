// Funkcje drukowania i udostępniania
(()=>{
  'use strict';
  
  const {state, el, $$, listById, escapeHtml} = window.appState;

  // Print
  el('printBtn').addEventListener('click', ()=>{
    const cont = el('printChecks'); cont.innerHTML = '';
    state.lists.forEach(l=>{
      const label = document.createElement('label'); label.className='row'; label.style.gap='8px';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.value = l.id; if(state.currentListId === l.id) cb.checked = true;
      const dot = document.createElement('span'); dot.style.cssText='width:12px;height:12px;border-radius:50%;display:inline-block;background:'+l.color;
      const name = document.createElement('span'); name.textContent = (l.icon ? `${l.icon} ` : '') + l.name;
      label.appendChild(cb); label.appendChild(dot); label.appendChild(name); cont.appendChild(label);
    });
    const labelC = document.createElement('label'); labelC.className='row'; labelC.style.gap='8px';
    const cbC = document.createElement('input'); cbC.type='checkbox'; cbC.value='__completed__'; if(state.currentListId === '__completed__') cbC.checked = true;
    const dotC = document.createElement('span'); dotC.style.cssText='width:12px;height:12px;border-radius:50%;display:inline-block;background:#7a7f8c';
    const nameC = document.createElement('span'); nameC.textContent = 'Zakończone';
    labelC.appendChild(cbC); labelC.appendChild(dotC); labelC.appendChild(nameC); cont.appendChild(labelC);
    el('printDateToggle').checked = true; el('printDialog').showModal();
  });
  el('printClose').addEventListener('click', ()=> el('printDialog').close());
  el('printCancel').addEventListener('click', ()=> el('printDialog').close());
  el('printForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const ids = $$('#printChecks input[type="checkbox"]').filter(cb=>cb.checked).map(cb=>cb.value);
    if(ids.length===0){ alert('Zaznacz przynajmniej jedną listę.'); return; }
    const includeDate = el('printDateToggle').checked;
    const html = buildPrintHTML(ids, includeDate);
    el('printDialog').close();
    try{ printUsingFrame(html); }catch(e){ printUsingBlobWindow(html); }
  });

  window.appHandlers.buildPrintHTML = function(ids, includeDate){
    const css = `<style>
      @page { margin: 12mm; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif; color:#111; }
      .pa-date { font-size:12px; color:#555; margin-bottom:8px; }
      .pa-list { margin-bottom:16px; page-break-inside: avoid; }
      h2 { display:flex; align-items:center; gap:10px; margin: 12px 0 6px; font-size:18px; }
      .pa-dot{ width:12px; height:12px; border-radius:50%; display:inline-block; }
      .pa-icon{ font-size:18px; line-height:1; }
      ul{ margin: 0 0 8px 18px; padding:0; }
      li{ margin:4px 0; }
      .done{ text-decoration: line-through; color:#777; }
    </style>`;
    let body = '';
    if(includeDate){
      const d = new Date();
      const dateStr = d.toLocaleDateString('pl-PL', {year:'numeric', month:'2-digit', day:'2-digit'});
      body += `<div class="pa-date">Data: ${dateStr}</div>`;
    }
    ids.forEach(id=>{
      if(id === '__completed__'){
        const allDone = [];
        state.lists.forEach(l=> l.items.forEach(it=>{ if(it.done) allDone.push({text: it.text, from: l.name, completedAt: it.completedAt}); }));
        allDone.sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
        body += `<div class="pa-list"><h2><span class="pa-dot" style="background:#7a7f8c"></span>Zakończone</h2>`;
        if(allDone.length===0){ body += `<div>Brak pozycji.</div>`; }
        else{ body += `<ul>` + allDone.map(it=> `<li>${escapeHtml(it.text)} (z listy: ${escapeHtml(it.from)})</li>`).join('') + `</ul>`; }
        body += `</div>`;
      }else{
        const list = listById(id); if(!list) return;
        const iconSpan = list.icon ? `<span class="pa-icon">${list.icon}</span>` : '';
        body += `<div class="pa-list"><h2><span class="pa-dot" style="background:${list.color}"></span>${iconSpan}<span>${escapeHtml(list.name)}</span></h2>`;
        const undone = list.items.filter(i=>!i.done);
        const done = list.items.filter(i=>i.done);
        if(undone.length===0 && done.length===0){ body += `<div>Brak pozycji.</div>`; }
        else{
          if(undone.length>0){ body += `<ul>` + undone.map(it=> `<li>${escapeHtml(it.text)}</li>`).join('') + `</ul>`; }
          if(done.length>0){ body += `<div>Ukończone:</div><ul>` + done.map(it=> `<li class="done">${escapeHtml(it.text)}</li>`).join('') + `</ul>`; }
        }
        body += `</div>`;
      }
    });
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Drukuj</title>${css}</head><body>${body}</body></html>`;
  };

  window.appHandlers.printUsingFrame = function(html){
    const frame = document.createElement('iframe');
    frame.style.position='fixed'; frame.style.right='0'; frame.style.bottom='0';
    frame.style.width='0'; frame.style.height='0'; frame.style.border='0'; frame.style.opacity='0';
    document.body.appendChild(frame);
    const done = ()=>{
      try{
        frame.contentWindow.focus();
        frame.contentWindow.print();
      }finally{
        setTimeout(()=> frame.remove(), 1200);
      }
    };
    if('srcdoc' in frame){
      frame.onload = done;
      frame.srcdoc = html;
    }else{
      const doc = frame.contentWindow.document;
      doc.open(); doc.write(html); doc.close();
      setTimeout(done, 120);
    }
  };

  window.appHandlers.printUsingBlobWindow = function(html){
    try{
      const blob = new Blob([html], {type:'text/html'});
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener');
      if(!win){ alert('Zezwól przeglądarce na wyskakujące okna, aby wydrukować.'); URL.revokeObjectURL(url); return; }
      const trigger = ()=>{ try{ win.focus(); win.print(); }catch{} setTimeout(()=>{ try{ win.close(); }catch{} URL.revokeObjectURL(url); }, 1500); };
      if(win.document && win.document.readyState === 'complete') setTimeout(trigger, 120);
      else win.onload = trigger;
      setTimeout(()=>{ try{ win.focus(); win.print(); }catch{} }, 800);
    }catch(e){
      alert('Drukowanie nie powiodło się. Spróbuj ponownie lub w innej przeglądarce.');
    }
  };

  // Share
  el('shareBtn').addEventListener('click', ()=>{
    const cont = el('shareChecks'); cont.innerHTML = '';
    state.lists.forEach(l=>{
      const label = document.createElement('label'); label.className='row'; label.style.gap='8px';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.value=l.id; if(state.currentListId === l.id) cb.checked = true;
      const dot = document.createElement('span'); dot.style.cssText='width:12px;height:12px;border-radius:50%;display:inline-block;background:'+l.color;
      const name = document.createElement('span'); name.textContent = (l.icon ? `${l.icon} ` : '') + l.name;
      label.appendChild(cb); label.appendChild(dot); label.appendChild(name); cont.appendChild(label);
    });
    const labelC = document.createElement('label'); labelC.className='row'; labelC.style.gap='8px';
    const cbC = document.createElement('input'); cbC.type='checkbox'; cbC.value='__completed__'; if(state.currentListId === '__completed__') cbC.checked = true;
    const dotC = document.createElement('span'); dotC.style.cssText='width:12px;height:12px;border-radius:50%;display:inline-block;background:#7a7f8c';
    const nameC = document.createElement('span'); nameC.textContent='Zakończone';
    labelC.appendChild(cbC); labelC.appendChild(dotC); labelC.appendChild(nameC); cont.appendChild(labelC);
    el('shareDateToggle').checked = true;
    el('shareDialog').showModal();
  });
  el('shareClose').addEventListener('click', ()=> el('shareDialog').close());
  el('shareSystemBtn').addEventListener('click', async ()=>{
    const {ids, includeDate} = getShareSelection(); if(ids.length===0){ alert('Zaznacz przynajmniej jedną listę.'); return; }
    const text = buildShareText(ids, includeDate);
    try{
      if(navigator.share){ await navigator.share({ title: 'Lista', text }); }
      else { await copyToClipboard(text); alert('Skopiowano do schowka. Wklej w Messengerze.'); }
    }catch{}
    el('shareDialog').close();
  });
  el('shareWhatsAppBtn').addEventListener('click', ()=>{
    const {ids, includeDate} = getShareSelection(); if(ids.length===0){ alert('Zaznacz przynajmniej jedną listę.'); return; }
    const text = buildShareText(ids, includeDate);
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const base = mobile ? 'https://wa.me/?text=' : 'https://web.whatsapp.com/send?text=';
    window.open(base + encodeURIComponent(text), '_blank'); el('shareDialog').close();
  });
  el('shareCopyBtn').addEventListener('click', async ()=>{
    const {ids, includeDate} = getShareSelection(); if(ids.length===0){ alert('Zaznacz przynajmniej jedną listę.'); return; }
    const text = buildShareText(ids, includeDate);
    await copyToClipboard(text); alert('Skopiowano. Wklej w dowolnej rozmowie.');
  });

  window.appHandlers.getShareSelection = function(){
    const ids = $$('#shareChecks input[type="checkbox"]').filter(cb=>cb.checked).map(cb=>cb.value);
    const includeDate = el('shareDateToggle').checked;
    return {ids, includeDate};
  };

  window.appHandlers.buildShareText = function(ids, includeDate){
    const lines = [];
    if(includeDate){
      const d = new Date(); const dateStr = d.toLocaleDateString('pl-PL', {year:'numeric', month:'2-digit', day:'2-digit'});
      lines.push(`Data: ${dateStr}`);
    }
    ids.forEach(id=>{
      if(id === '__completed__'){
        const allDone = []; state.lists.forEach(l=> l.items.forEach(it=>{ if(it.done) allDone.push({text: it.text, from: l.name, completedAt: it.completedAt}); }));
        allDone.sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
        lines.push(`\nZakończone:`); if(allDone.length===0){ lines.push(`- (brak)`); } else allDone.forEach(it=> lines.push(`- ${it.text} (z listy: ${it.from})`));
      }else{
        const list = listById(id); if(!list) return;
        lines.push(`\n${list.icon ? list.icon + ' ' : ''}${list.name}:`);
        const undone = list.items.filter(i=>!i.done), done = list.items.filter(i=>i.done);
        if(undone.length===0 && done.length===0){ lines.push(`- (brak)`); }
        else{
          undone.forEach(it=> lines.push(`- ${it.text}`));
          if(done.length>0){ lines.push(`Ukończone:`); done.forEach(it=> lines.push(`- ${it.text}`)); }
        }
      }
    });
    return lines.join('\n');
  };

  window.appHandlers.copyToClipboard = async function(text){
    try{
      if(navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(text); }
      else{ const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); ta.remove(); }
    }catch(e){}
  };
})();
