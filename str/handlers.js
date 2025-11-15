// Event handlers dla dialogów i akcji użytkownika
(()=>{
  'use strict';
  
  const {state, el, $, $$, PALETTE10, ICONS, NAME_MAX, APPEAR_DEFAULT, save, render, currentList, listById, escapeHtml, setTheme, applyAppearance} = window.appState;
  const {openManage, openNewList, renderPalette, getSelectedPaletteColor, renderIconGrid, getSelectedIcon, openAddDialog, addItem, openAppearance, fillAppearanceForm, ensureAppearancePreview, buildPrintHTML, printUsingFrame, printUsingBlobWindow, getShareSelection, buildShareText, copyToClipboard} = window.appHandlers;

  // Manage list
  window.appHandlers.openManage = function(){
    let cl = currentList();
    if(!cl){ const l = listById(state.lastActiveListId) || state.lists[0]; state.currentListId = l.id; cl = l; }
    el('manageListName').value = (cl.name || '').slice(0, NAME_MAX);
    renderPalette(el('managePalette'), cl.color);
    renderIconGrid(el('manageIconGrid'), cl.icon || '');
    el('manageClearIcon').onclick = ()=> { $$('.icon-chip', el('manageIconGrid')).forEach(x=>x.classList.remove('selected')); };
    el('manageDialog').showModal();
    setTimeout(()=> el('manageListName').focus(), 0);
  };

  window.appHandlers.openNewList = function(){
    el('newListName').value = '';
    renderPalette(el('newListPalette'), PALETTE10[0]);
    renderIconGrid(el('newListIconGrid'), '');
    $$('.icon-chip', el('newListIconGrid')).forEach(x=>x.classList.remove('selected'));
    el('newListClearIcon').onclick = ()=> { $$('.icon-chip', el('newListIconGrid')).forEach(x=>x.classList.remove('selected')); };
    el('newListDialog').showModal();
    setTimeout(()=> el('newListName').focus(), 0);
  };

  window.appHandlers.renderPalette = function(container, currentColor){
    container.innerHTML = '';
    PALETTE10.forEach(c=>{
      const sw = document.createElement('button'); sw.type='button';
      sw.className = 'swatch' + (c.toLowerCase() === (currentColor||'').toLowerCase() ? ' selected' : '');
      sw.style.background = c; sw.dataset.color = c;
      sw.setAttribute('aria-label', 'Kolor ' + c);
      sw.addEventListener('click', ()=>{ $$('.swatch', container).forEach(x=>x.classList.remove('selected')); sw.classList.add('selected'); });
      container.appendChild(sw);
    });
  };

  window.appHandlers.getSelectedPaletteColor = function(container){ 
    const s = $('.swatch.selected', container); 
    return s ? s.dataset.color : PALETTE10[0]; 
  };

  window.appHandlers.renderIconGrid = function(container, current=''){
    container.innerHTML = '';
    ICONS.forEach(ico=>{
      const b = document.createElement('button');
      b.type='button'; b.className='icon-chip' + (ico===current ? ' selected':'');
      b.textContent = ico;
      b.setAttribute('aria-label', 'Ikona ' + ico);
      b.addEventListener('click', ()=>{
        $$('.icon-chip', container).forEach(x=>x.classList.remove('selected'));
        b.classList.add('selected');
      });
      container.appendChild(b);
    });
  };

  window.appHandlers.getSelectedIcon = function(container){
    const sel = $('.icon-chip.selected', container);
    return sel ? sel.textContent : '';
  };

  el('manageForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const cl = currentList(); if(!cl) return;
    const newName = el('manageListName').value.trim().slice(0, NAME_MAX);
    if(newName) cl.name = newName;
    cl.color = getSelectedPaletteColor(el('managePalette')) || cl.color;
    cl.icon = getSelectedIcon(el('manageIconGrid')) || '';
    el('manageDialog').close(); save(); render();
  });
  el('manageClose').addEventListener('click', ()=> el('manageDialog').close());
  el('manageCancel').addEventListener('click', ()=> el('manageDialog').close());
  el('deleteListBtn').addEventListener('click', ()=>{
    const cl = currentList(); if(!cl) return;
    if(state.lists.length <= 1){ alert('Musi pozostać przynajmniej jedna lista.'); return; }
    if(confirm(`Usunąć listę "${cl.name}"?`)){
      const idx = state.lists.findIndex(l=>l.id===cl.id);
      if(idx>=0){ state.lists.splice(idx,1); }
      state.currentListId = state.lists[0].id; state.lastActiveListId = state.currentListId;
      el('manageDialog').close(); save(); render();
    }
  });

  // Quick add
  el('quickAddBtn').addEventListener('click', ()=>{
    if(state.currentListId === '__completed__') return;
    el('quickAdd').classList.add('open');
    setTimeout(()=> el('quickAddInput')?.focus(), 0);
  });
  el('quickAddClose').addEventListener('click', ()=>{
    el('quickAdd').classList.remove('open');
    el('quickAddInput').value = '';
  });
  el('quickAddSubmit').addEventListener('click', ()=>{
    const txt = el('quickAddInput').value.trim(); if(!txt) return;
    const toId = (state.currentListId === '__completed__' ? (state.lastActiveListId || state.lists[0].id) : state.currentListId);
    addItem(txt, toId); el('quickAddInput').value = '';
    if('vibrate' in navigator && state.settings.vibrate){ try{ navigator.vibrate(12); }catch{} }
  });
  el('quickAddInput').addEventListener('keydown', (e)=>{ 
    if(e.key==='Enter'){ e.preventDefault(); el('quickAddSubmit').click(); } 
    else if(e.key==='Escape'){ el('quickAddClose').click(); } 
  });

  // Add item dialog
  el('addBtn').addEventListener('click', ()=>{
    if(state.currentListId === '__completed__') return;
    if(state.editMode){ alert('Wyłącz tryb edycji, aby dodać pozycję.'); return; }
    openAddDialog();
  });

  window.appHandlers.openAddDialog = function(){
    const addListSel = el('addListSelect'); addListSel.innerHTML = '';
    state.lists.forEach(l=>{ const opt = document.createElement('option'); opt.value = l.id; opt.textContent = l.name; addListSel.appendChild(opt); });
    const defaultId = state.currentListId === '__completed__' ? (state.lastActiveListId || state.lists[0].id) : state.currentListId;
    addListSel.value = defaultId; el('addText').value = '';
    el('addDialog').showModal(); setTimeout(()=>el('addText').focus(), 0);
  };

  el('addForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const txt = el('addText').value.trim(); if(!txt) return;
    const listId = el('addListSelect').value;
    addItem(txt, listId); el('addDialog').close();
    if('vibrate' in navigator && state.settings.vibrate){ try{ navigator.vibrate(16); }catch{} }
  });
  el('addDlgClose').addEventListener('click', ()=> el('addDialog').close());
  el('addDlgCancel').addEventListener('click', ()=> el('addDialog').close());

  window.appHandlers.addItem = function(text, toListId){
    const l = listById(toListId); if(!l) return;
    l.items.push({ id: `it_${Math.random().toString(36).slice(2,7)}_${Date.now().toString(36)}`, text: text.trim(), done:false, createdAt:Date.now(), completedAt:null });
    save(); render();
  };

  // New list create
  el('newListForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = el('newListName').value.trim().slice(0, NAME_MAX);
    if(!name) return;
    const color = getSelectedPaletteColor(el('newListPalette'));
    const icon = getSelectedIcon(el('newListIconGrid')) || '';
    const list = { id: `list_${Math.random().toString(36).slice(2,7)}_${Date.now().toString(36)}`, name, color, icon, items: [] };
    state.lists.push(list);
    state.currentListId = list.id; state.lastActiveListId = list.id;
    el('newListDialog').close(); save(); render();
  });
  el('newListClose').addEventListener('click', ()=> el('newListDialog').close());
  el('newListCancel').addEventListener('click', ()=> el('newListDialog').close());

  // Settings
  el('settingsBtn').addEventListener('click', ()=> el('settingsDialog').showModal());
  el('closeSettings').addEventListener('click', ()=> el('settingsDialog').close());
  el('darkModeToggle').addEventListener('change', (e)=>{ setTheme(e.target.checked); save(); });
  el('hideCompletedToggle').addEventListener('change', (e)=>{ state.settings.hideCompleted = !!e.target.checked; save(); render(); });
  el('vibrateToggle').addEventListener('change', (e)=>{ state.settings.vibrate = !!e.target.checked; save(); });

  // Appearance
  el('appearanceBtn').addEventListener('click', ()=>{
    ensureAppearancePreview();
    fillAppearanceForm();
    el('appearanceDialog').showModal();
  });
  el('appearanceClose').addEventListener('click', ()=> el('appearanceDialog').close());
  el('appearanceDone').addEventListener('click', ()=> el('appearanceDialog').close());
  el('appearanceDefaults').addEventListener('click', ()=>{
    state.settings.appearance = {...APPEAR_DEFAULT};
    fillAppearanceForm();
    applyAppearance(); save();
  });

  window.appHandlers.fillAppearanceForm = function(){
    const ap = state.settings.appearance || APPEAR_DEFAULT;
    el('outlineNeon').checked = ap.itemOutline === 'neon';
    el('outlineBorder').checked = ap.itemOutline === 'border';
    el('outlineNone').checked = ap.itemOutline === 'none';
    const pad = ap.ringPad ?? 1;
    const blur = ap.ringBlur ?? 8;
    const rad = ap.itemRadius ?? 18;
    const opa = ap.shadowOpacity ?? 0.06;
    el('ringPadRange').value = String(pad);
    el('ringPadVal').textContent = pad + ' px';
    el('ringBlurRange').value = String(blur);
    el('ringBlurVal').textContent = blur + ' px';
    el('itemRadiusRange').value = String(rad);
    el('itemRadiusVal').textContent = rad + ' px';
    el('shadowOpacityRange').value = String(opa);
    el('shadowOpacityVal').textContent = opa.toFixed(2);
    el('buttonsNeonToggle').checked = !!ap.buttonsNeon;
  };

  $$('#appearanceForm input[name="itemOutline"]').forEach(r=>{
    r.addEventListener('change', ()=>{
      const val = $('input[name="itemOutline"]:checked', el('appearanceForm')).value;
      state.settings.appearance.itemOutline = val;
      applyAppearance(); save();
    });
  });
  el('ringPadRange').addEventListener('input', (e)=>{
    const v = parseFloat(e.target.value||'0') || 0;
    state.settings.appearance.ringPad = v;
    el('ringPadVal').textContent = v + ' px';
    applyAppearance(); save();
  });
  el('ringBlurRange').addEventListener('input', (e)=>{
    const v = parseFloat(e.target.value||'0') || 0;
    state.settings.appearance.ringBlur = v;
    el('ringBlurVal').textContent = v + ' px';
    applyAppearance(); save();
  });
  el('itemRadiusRange').addEventListener('input', (e)=>{
    const v = parseInt(e.target.value||'18', 10) || 18;
    state.settings.appearance.itemRadius = v;
    el('itemRadiusVal').textContent = v + ' px';
    applyAppearance(); save();
  });
  el('shadowOpacityRange').addEventListener('input', (e)=>{
    const v = parseFloat(e.target.value||'0.06') || 0;
    state.settings.appearance.shadowOpacity = v;
    el('shadowOpacityVal').textContent = v.toFixed(2);
    applyAppearance(); save();
  });
  el('buttonsNeonToggle').addEventListener('change', (e)=>{
    state.settings.appearance.buttonsNeon = !!e.target.checked;
    applyAppearance(); save();
  });

  window.appHandlers.ensureAppearancePreview = function(){
    const cont = el('appearancePreview');
    if(!cont || cont.dataset.ready) return;
    cont.dataset.ready = '1';
    cont.innerHTML = '';
    const makeItem = (done, text, sub='')=>{
      const li = document.createElement('div');
      li.className = 'item' + (done ? ' done' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!done;
      cb.disabled = true;
      const texts = document.createElement('div');
      texts.className = 'texts';
      const t = document.createElement('div');
      t.className = 'text';
      t.textContent = text;
      texts.appendChild(t);
      if(sub){
        const s = document.createElement('div');
        s.className = 'sub';
        s.textContent = sub;
        texts.appendChild(s);
      }
      li.appendChild(cb);
      li.appendChild(texts);
      return li;
    };
    cont.appendChild(makeItem(false, 'mleko', 'przykład'));
    cont.appendChild(makeItem(true, 'chleb (ukończone)'));
  };

  // Print & Share handlers będą w osobnym pliku print-share.js
  // Edit mode toggle
  el('editModeBtn').addEventListener('click', (e)=>{
    if(state.currentListId === '__completed__'){ alert('Tryb edycji jest dostępny w konkretnej liście.'); return; }
    state.editMode = !state.editMode; render();
    if(!state.editMode){ e.currentTarget.blur(); }
  });

  // Close dialogs on backdrop click
  $$('dialog').forEach(d=>{
    d.addEventListener('click', (e)=>{
      const rect = d.getBoundingClientRect();
      const inDialog = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if(!inDialog){ d.close(); }
    });
  });
})();
