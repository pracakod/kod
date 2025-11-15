(()=>{'use strict';
  const LS_KEY = 'todoAppData_v8';

  const el = (id) => document.getElementById(id);
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const PALETTE10 = ['#4a90e2','#E86B27','#2ecc71','#9b59b6','#e74c3c','#f39c12','#16a085','#d35400','#27ae60','#8e44ad'];
  const ICONS = ['🛒','🍎','🥦','📦','🏠','🎁','🧹','💡','📚','💼','⚽️','🎵','🍽️','🧪','🎯'];
  const NAME_MAX = 40;

  const APPEAR_DEFAULT = {
    itemOutline: 'neon',
    ringPad: 1,
    ringBlur: 8,
    itemRadius: 18,
    shadowOpacity: 0.06,
    buttonsNeon: true
  };

  const state = {
    lists: [],
    settings: { dark:false, hideCompleted:false, vibrate:true, appearance: {...APPEAR_DEFAULT} },
    currentListId: null,
    lastActiveListId: null,
    editMode: false,
  };

  function uid(prefix='id'){ return `${prefix}_${Math.random().toString(36).slice(2,7)}_${Date.now().toString(36)}`; }
  
  function defaultData(){
    const list1 = { id: uid('list'), name: 'Moja lista 1', color: '#4a90e2', icon: '', items: [] };
    const list2 = { id: uid('list'), name: 'Moja lista 2', color: '#E86B27', icon: '', items: [] };
    return {
      lists: [list1, list2],
      settings: { dark:false, hideCompleted:false, vibrate:true, appearance: {...APPEAR_DEFAULT} },
      currentListId: list1.id,
      lastActiveListId: list1.id,
      editMode: false
    };
  }
  
  function migrateData(){
    state.lists.forEach(l=>{
      if(typeof l.icon !== 'string') l.icon = '';
      if(!Array.isArray(l.items)) l.items = [];
      l.items.forEach(it=>{
        if(typeof it.completedAt === 'undefined') it.completedAt = it.done ? Date.now() : null;
      });
    });
    if(!state.settings) state.settings = {};
    if(!state.settings.appearance) state.settings.appearance = {...APPEAR_DEFAULT};
    for(const k in APPEAR_DEFAULT){
      if(typeof state.settings.appearance[k] === 'undefined'){
        state.settings.appearance[k] = APPEAR_DEFAULT[k];
      }
    }
  }
  
  function save(){
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        lists:state.lists,
        settings:state.settings,
        currentListId:state.currentListId,
        lastActiveListId:state.lastActiveListId
      }));
    } catch(e) {
      if(e.name === 'QuotaExceededError') {
        alert('Brak miejsca w pamięci przeglądarki. Usuń stare listy lub dane.');
      } else {
        console.error('Błąd podczas zapisywania:', e);
      }
    }
  }
  
  function load(){
    const raw = localStorage.getItem(LS_KEY);
    if(!raw){ Object.assign(state, defaultData()); return; }
    try{
      const data = JSON.parse(raw);
      Object.assign(state, defaultData(), data);
      if(!Array.isArray(state.lists) || state.lists.length === 0){
        const d = defaultData();
        state.lists = d.lists; state.currentListId = d.currentListId; state.lastActiveListId = d.lastActiveListId;
      }
    }catch{ Object.assign(state, defaultData()); }
  }

  function setTheme(dark){
    state.settings.dark = !!dark;
    document.documentElement.setAttribute('data-theme', state.settings.dark ? 'dark' : 'light');
  }
  
  function setAccent(color){
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-soft', hexToRgba(color, 0.14));
    const {neo1, neo2} = deriveNeoGradient(color);
    document.documentElement.style.setProperty('--neo1', neo1);
    document.documentElement.style.setProperty('--neo2', neo2);
  }

  function applyAppearance(){
    const ap = state.settings.appearance || APPEAR_DEFAULT;
    document.documentElement.dataset.itemOutline = ap.itemOutline;
    document.documentElement.setAttribute('data-neon-buttons', ap.buttonsNeon ? 'on' : 'off');
    document.documentElement.style.setProperty('--ring-pad', (ap.ringPad||0) + 'px');
    document.documentElement.style.setProperty('--ring-blur', (ap.ringBlur||0) + 'px');
    document.documentElement.style.setProperty('--item-radius', (ap.itemRadius||18) + 'px');
    document.documentElement.style.setProperty('--item-shadow-opa', String(ap.shadowOpacity ?? 0.06));
  }

  function hexToRgba(hex, a=1){
    let h = hex.replace('#',''); if(h.length===3){ h = h.split('').map(c=>c+c).join(''); }
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  
  function hexToRgb(hex){
    let h = hex.replace('#',''); if(h.length===3){ h = h.split('').map(c=>c+c).join(''); }
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    return {r,g,b};
  }
  
  function rgbToHsl(r,g,b){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    let h,s,l=(max+min)/2;
    if(max===min){ h=s=0; }
    else{
      const d=max-min;
      s=l>0.5? d/(2-max-min) : d/(max+min);
      switch(max){
        case r: h=(g-b)/d + (g<b?6:0); break;
        case g: h=(b-r)/d + 2; break;
        case b: h=(r-g)/d + 4; break;
      }
      h*=60;
    }
    return {h, s:s*100, l:l*100};
  }
  
  function hslToHexSafe(h,s,l){
    s/=100; l/=100;
    const c=(1-Math.abs(2*l-1))*s;
    const hh=h/60;
    const x=c*(1-Math.abs(hh%2-1));
    let r=0,g=0,b=0;
    if(hh>=0 && hh<1){ r=c; g=x; b=0; }
    else if(hh>=1 && hh<2){ r=x; g=c; b=0; }
    else if(hh>=2 && hh<3){ r=0; g=c; b=x; }
    else if(hh>=3 && hh<4){ r=0; g=x; b=c; }
    else if(hh>=4 && hh<5){ r=x; g=0; b=c; }
    else { r=c; g=0; b=x; }
    const m=l-c/2;
    r=Math.round((r+m)*255); g=Math.round((g+m)*255); b=Math.round((b+m)*255);
    return '#'+[r,g,b].map(v=> v.toString(16).padStart(2,'0')).join('');
  }
  
  function clamp(v,min,max){ return Math.min(max, Math.max(min, v)); }
  
  function deriveNeoGradient(accent){
    const {r,g,b} = hexToRgb(accent);
    const {h,s,l} = rgbToHsl(r,g,b);
    const neo1 = hslToHexSafe((h+10)%360, clamp(s+10,0,100), clamp(l+6,0,100));
    const neo2 = hslToHexSafe((h-14+360)%360, clamp(s+22,0,100), clamp(l-8,0,100));
    return {neo1, neo2};
  }

  function vibrate(ms=20){ if(!state.settings.vibrate) return; if('vibrate' in navigator){ try{ navigator.vibrate(ms); }catch{} } }
  function currentList(){ if(state.currentListId === '__completed__') return null; return state.lists.find(l => l.id === state.currentListId) || state.lists[0]; }
  function listById(id){ return state.lists.find(l => l.id === id); }
  function escapeHtml(str=''){ return str.replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }

  const quick = el('quickAdd');
  const quickInput = el('quickAddInput');
  function openQuick(){ if(state.currentListId === '__completed__') return; quick.classList.add('open'); setTimeout(()=> quickInput?.focus(), 0); }
  function closeQuick(){ quick.classList.remove('open'); if(quickInput) quickInput.value = ''; }

  function render(){
    document.body.classList.toggle('edit-on', !!state.editMode);
    const isCompletedView = state.currentListId === '__completed__';
    const cl = currentList();
    const accent = isCompletedView ? '#7a7f8c' : (cl?.color || '#4a90e2');
    setAccent(accent);
    el('currentListName').textContent = isCompletedView ? 'Zakończone' : (cl?.name || 'Lista');
    el('listDot').style.background = accent;
    el('listDot').style.boxShadow = `0 0 0 3px ${hexToRgba(accent, .18)}`;

    const iconEl = el('currentListIcon');
    if(!isCompletedView && cl?.icon){
      iconEl.textContent = cl.icon;
      iconEl.hidden = false;
    }else{
      iconEl.hidden = true;
      iconEl.textContent = '';
    }

    el('addBtn').classList.toggle('disabled', isCompletedView);
    el('quickAddBtn').classList.toggle('disabled', isCompletedView);
    if(isCompletedView) closeQuick();

    renderListMenu();
    renderItems();

    el('darkModeToggle').checked = !!state.settings.dark;
    el('hideCompletedToggle').checked = !!state.settings.hideCompleted;
    el('vibrateToggle').checked = !!state.settings.vibrate;

    el('editModeBtn').classList.toggle('active', !!state.editMode);
    el('editModeBtn').setAttribute('aria-pressed', state.editMode ? 'true' : 'false');
  }

  function renderListMenu(){
    const cont = el('listMenuItems'); cont.innerHTML = '';
    let draggingId = null;

    state.lists.forEach((l)=>{
      const btn = document.createElement('div');
      btn.className = 'menu-item'; btn.setAttribute('role', 'button');
      btn.dataset.id = l.id; btn.draggable = true;
      btn.innerHTML = `
        <span class="grip" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M9 6h6M9 12h6M9 18h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span>
        <span class="color-dot" style="background:${l.color}"></span>
        ${l.icon ? `<span class="list-icon" aria-hidden="true">${l.icon}</span>` : ''}
        <span class="name">${escapeHtml(l.name)}</span>
        <span class="pill">${l.items.filter(i=>!i.done).length}</span>
        <span class="tick" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      `;
      const isActive = state.currentListId === l.id;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');

      btn.addEventListener('click', ()=>{
        state.editMode = false;
        state.currentListId = l.id;
        state.lastActiveListId = l.id;
        closeMenu(); save(); render();
      });

      btn.addEventListener('dragstart', (e)=>{
        draggingId = l.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id);
      });
      btn.addEventListener('dragover', (e)=>{ e.preventDefault(); btn.classList.add('drag-over'); });
      btn.addEventListener('dragleave', ()=> btn.classList.remove('drag-over'));
      btn.addEventListener('drop', (e)=>{
        e.preventDefault(); btn.classList.remove('drag-over');
        const fromId = draggingId || e.dataTransfer.getData('text/plain');
        const toId = l.id; if(!fromId || fromId===toId) return;
        const fromIdx = state.lists.findIndex(x=>x.id===fromId);
        const toIdx = state.lists.findIndex(x=>x.id===toId);
        if(fromIdx<0 || toIdx<0) return; moveList(fromIdx, toIdx);
      });

      cont.appendChild(btn);
    });

    const compl = el('completedViewBtn');
    compl.classList.toggle('is-active', state.currentListId === '__completed__');
    compl.setAttribute('aria-selected', state.currentListId === '__completed__' ? 'true' : 'false');
  }
  
  function moveList(fromIdx, toIdx){ if(fromIdx===toIdx) return; const [m] = state.lists.splice(fromIdx,1); state.lists.splice(toIdx,0,m); save(); renderListMenu(); }

  function renderItems(){
    const container = el('listContainer'); container.innerHTML = '';
    const isCompletedView = state.currentListId === '__completed__';
    let items = [], lref = null;

    if(isCompletedView){
      state.lists.forEach(l=> l.items.forEach(it=> { if(it.done) items.push({...it, __fromList: l.id}); }));
      items.sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
    }else{
      lref = currentList(); if(!lref) return;
      const undone = lref.items.filter(i=>!i.done);
      const done = lref.items.filter(i=>i.done);
      items = state.settings.hideCompleted ? undone : [...undone, ...done];
    }

    if(items.length === 0){
      el('emptyState').hidden = false;
      el('emptyState').textContent = isCompletedView ? 'Brak pozycji.' : 'Brak pozycji. Dodaj coś przyciskiem +';
      return;
    } else {
      el('emptyState').hidden = true;
    }

    const visibleIds = items.map(i=>i.id);
    const frag = document.createDocumentFragment();

    items.forEach(it=>{
      const li = document.createElement('div');
      li.className = 'item' + (it.done ? ' done' : '') + ' new';
      li.dataset.id = it.id;

      const handle = document.createElement('div');
      handle.className = 'handle';
      handle.setAttribute('aria-label', 'Przeciągnij aby zmienić kolejność');
      handle.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24"><path d="M9 6h6M9 12h6M9 18h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!it.done;
      checkbox.setAttribute('aria-label', it.text);

      const texts = document.createElement('div');
      texts.className = 'texts';
      const title = document.createElement('div');
      title.className = 'text';
      title.textContent = it.text;
      texts.appendChild(title);

      if(state.currentListId === '__completed__'){
        const small = document.createElement('div');
        small.className = 'sub';
        const lName = listById(findItemListId(it.id) || it.__fromList)?.name || '—';
        small.textContent = `z listy: ${lName}`;
        texts.appendChild(small);
      }

      const actions = document.createElement('div');
      actions.className = 'actions';
      if(!(state.currentListId === '__completed__')){
        actions.innerHTML = `
          <button class="i-btn" data-act="up" title="Góra" aria-label="Przenieś w górę">
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="i-btn" data-act="down" title="Dół" aria-label="Przenieś w dół">
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="i-btn danger" data-act="del" title="Usuń" aria-label="Usuń pozycję">
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 7h12M9 7V5h6v2m-8 0l1 12h8l1-12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        `;
      }

      checkbox.addEventListener('change', ()=>{
        const toggledDone = checkbox.checked;
        const containerEl = el('listContainer');
        const isCompletedViewLocal = (state.currentListId === '__completed__');

        if(isCompletedViewLocal){
          const listId = findItemListId(it.id) || it.__fromList;
          const l = listById(listId);
          const item = l?.items.find(x=>x.id === it.id);
          if(item){
            item.done = toggledDone;
            item.completedAt = toggledDone ? Date.now() : null;
          }
          if(!toggledDone){
            animateCollapseRemove(li, ()=> updateEmptyStateOnContainer(containerEl, true));
          }
          vibrate(22); save(); renderListMenu();
          return;
        }

        const lrefLocal = currentList();
        const itemRef = lrefLocal.items.find(x=>x.id === it.id);
        if(itemRef){
          itemRef.done = toggledDone;
          itemRef.completedAt = toggledDone ? Date.now() : null;
        }
        li.classList.toggle('done', toggledDone);

        if(state.settings.hideCompleted && toggledDone){
          animateCollapseRemove(li, ()=> updateEmptyStateOnContainer(containerEl, false));
        }else{
          const itemsEls = Array.from(containerEl.querySelectorAll('.item'));
          const firstDoneIdx = itemsEls.findIndex(n => n.classList.contains('done'));
          const lastUndoneIdx = itemsEls.reduce((acc, n, i)=> n.classList.contains('done') ? acc : i, -1);

          if(toggledDone){
            const targetIdx = (lastUndoneIdx >= 0 ? lastUndoneIdx + 1 : 0);
            if(containerEl.children[targetIdx] !== li){
              flipMove(li, ()=> containerEl.insertBefore(li, containerEl.children[targetIdx] || null));
            }
          }else{
            const targetIdx = (firstDoneIdx === -1 ? itemsEls.length : firstDoneIdx);
            if(containerEl.children[targetIdx] !== li){
              flipMove(li, ()=> containerEl.insertBefore(li, containerEl.children[targetIdx] || null));
            }
          }
        }

        vibrate(22); save(); renderListMenu();
      });

      if(!(state.currentListId === '__completed__')){
        actions.querySelector('[data-act="up"]').addEventListener('click', ()=>{
          const lrefLocal = currentList();
          const idx = visibleIds.indexOf(it.id);
          if(idx>0){ const visNew = moveInArray(visibleIds.slice(), idx, idx-1); applyVisibleOrder(lrefLocal, visNew); }
        });
        actions.querySelector('[data-act="down"]').addEventListener('click', ()=>{
          const lrefLocal = currentList();
          const idx = visibleIds.indexOf(it.id);
          if(idx>=0 && idx<visibleIds.length-1){ const visNew = moveInArray(visibleIds.slice(), idx, idx+1); applyVisibleOrder(lrefLocal, visNew); }
        });
        actions.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          const lrefLocal = currentList();
          const idx = lrefLocal.items.findIndex(x=>x.id===it.id);
          if(idx>=0){
            animateCollapseRemove(li, ()=>{
              lrefLocal.items.splice(idx,1); vibrate(10); save(); renderListMenu(); updateEmptyStateOnContainer(el('listContainer'), false);
            });
          }
        });
      }

      li.appendChild(handle);
      li.appendChild(checkbox);
      li.appendChild(texts);
      li.appendChild(actions);

      if(state.editMode && !(state.currentListId === '__completed__')){
        title.contentEditable = 'true';
        title.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); title.blur(); } });
        title.addEventListener('blur', ()=>{
          const newVal = (title.textContent || '').trim();
          const lrefLocal = currentList();
          const idx = lrefLocal.items.findIndex(x=>x.id===it.id);
          if(idx>=0){
            if(newVal.length===0){ title.textContent = lrefLocal.items[idx].text; return; }
            if(lrefLocal.items[idx].text !== newVal){ lrefLocal.items[idx].text = newVal; save(); }
          }
        });

        enableItemDrag(li, handle, visibleIds, (visNew)=> applyVisibleOrder(currentList(), visNew));
      }

      frag.appendChild(li);
    });
    container.appendChild(frag);
  }

  function moveInArray(arr, from, to){ if(from===to) return arr; const [m] = arr.splice(from,1); arr.splice(to,0,m); return arr; }
  
  function applyVisibleOrder(list, newVisOrder){
    const visQueue = newVisOrder.map(id => list.items.find(i=>i.id===id)).filter(Boolean);
    const isVisible = (it)=> state.settings.hideCompleted ? !it.done : true;
    const out = [];
    for(const it of list.items){ out.push(isVisible(it) ? (visQueue.shift() || it) : it); }
    list.items = out; vibrate(8); save(); render();
  }

  function flipMove(el, mutateDom){
    const start = el.getBoundingClientRect();
    mutateDom?.();
    requestAnimationFrame(() => {
      const end = el.getBoundingClientRect();
      const dx = start.left - end.left;
      const dy = start.top - end.top;
      if (dx || dy){
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        requestAnimationFrame(() => {
          el.style.transition = 'transform 550ms cubic-bezier(.22,.61,.36,1), opacity 0ms';
          el.style.transform = '';
        });
        setTimeout(()=>{ el.style.transition = ''; el.style.visibility = ''; el.style.opacity = ''; }, 570);
      }
    });
  }
  
  function animateCollapseRemove(elNode, after){
    elNode.classList.add('anim-hide');
    elNode.style.height = elNode.offsetHeight + 'px';
    elNode.style.marginTop = getComputedStyle(elNode).marginTop;
    elNode.style.marginBottom = getComputedStyle(elNode).marginBottom;
    elNode.style.opacity = '1';
    requestAnimationFrame(()=>{
      elNode.style.height = '0px';
      elNode.style.marginTop = '0px';
      elNode.style.marginBottom = '0px';
      elNode.style.opacity = '0';
    });
    setTimeout(()=>{ try{ elNode.remove(); }catch{} after?.(); }, 400);
  }
  
  function updateEmptyStateOnContainer(container, isCompletedView){
    const anyItem = container.querySelector('.item');
    const empty = el('emptyState');
    empty.hidden = !!anyItem;
    if (!anyItem){
      empty.textContent = isCompletedView ? 'Brak pozycji.' : 'Brak pozycji. Dodaj coś przyciskiem +';
    }
  }

  function enableItemDrag(li, handle, visibleIds, onDropOrder){
    let offsetY=0, ph=null, container=null, dragging=false, pointerId=null;
    const onPointerDown = (e)=>{
      if(!state.editMode || state.currentListId === '__completed__') return;
      if(e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); 
      handle.setPointerCapture?.(e.pointerId);
      pointerId = e.pointerId;
      
      container = el('listContainer'); const rect = li.getBoundingClientRect();
      offsetY = (e.clientY||0) - rect.top;
      ph = document.createElement('div'); ph.className = 'item placeholder'; ph.style.height = rect.height + 'px';
      container.insertBefore(ph, li.nextSibling);
      li.classList.add('dragging'); li.style.width = rect.width+'px'; li.style.position='fixed'; li.style.left = rect.left+'px'; li.style.top = rect.top+'px'; li.style.zIndex='1000'; li.style.pointerEvents='none';
      document.body.style.userSelect='none'; document.body.style.touchAction='none';
      document.addEventListener('pointermove', onPointerMove, {passive:false});
      document.addEventListener('pointerup', onPointerUp, {passive:false});
      dragging = true;
    };
    const onPointerMove = (e)=>{
      if(!dragging) return; e.preventDefault();
      const y = (e.clientY||0) - offsetY; li.style.top = y + 'px';
      const centerY = y + li.offsetHeight/2;
      const children = Array.from(container.children).filter(c=>c!==li);
      let newIndex=0; for(let i=0;i<children.length;i++){ const r = children[i].getBoundingClientRect(); if(centerY > r.top + r.height/2) newIndex = i+1; }
      if(container.children[newIndex] !== ph){ container.insertBefore(ph, container.children[newIndex]); }
    };
    const onPointerUp = (e)=>{
      if(!dragging) return; 
      e.preventDefault(); 
      dragging = false;
      
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      if(pointerId !== null) {
        handle.releasePointerCapture?.(pointerId);
        pointerId = null;
      }
      
      document.body.style.userSelect=''; 
      document.body.style.touchAction='';
      
      const targetIndex = Array.from(container.children).indexOf(ph); 
      ph.replaceWith(li);
      li.classList.remove('dragging'); 
      li.style.position=''; 
      li.style.left=''; 
      li.style.top=''; 
      li.style.width=''; 
      li.style.zIndex=''; 
      li.style.pointerEvents='';
      
      const id = li.dataset.id; 
      const from = visibleIds.indexOf(id);
      const to = Math.max(0, Math.min(visibleIds.length-1, targetIndex));
      if(from>=0 && to>=0 && from!==to){ 
        const visNew = moveInArray(visibleIds.slice(), from, to); 
        onDropOrder?.(visNew); 
      }
    };
    handle.addEventListener('pointerdown', onPointerDown);
  }
  
  function findItemListId(itemId){ for(const l of state.lists){ if(l.items.some(i => i.id === itemId)) return l.id; } return null; }

  const menuBtn = el('openMenuBtn');
  const menu = el('listMenu');
  function openMenu(){ menu.classList.add('open'); menuBtn.setAttribute('aria-expanded','true'); }
  function closeMenu(){ menu.classList.remove('open'); menuBtn.setAttribute('aria-expanded','false'); }
  menuBtn.addEventListener('click', ()=> menu.classList.contains('open') ? closeMenu() : openMenu());
  document.addEventListener('click', (e)=>{ if(!menu.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) closeMenu(); });

  el('completedViewBtn').addEventListener('click', ()=>{
    state.editMode = false;
    state.currentListId='__completed__';
    closeQuick(); closeMenu(); save(); render();
  });
  el('manageListBtn').addEventListener('click', ()=>{ closeMenu(); openManage(); });
  el('addListBtn').addEventListener('click', ()=>{ closeMenu(); openNewList(); });

  // Import pozostałych funkcji z handlers.js
  window.appHandlers = {
    openManage, openNewList, renderPalette, getSelectedPaletteColor,
    renderIconGrid, getSelectedIcon, openAddDialog, addItem,
    openAppearance, fillAppearanceForm, ensureAppearancePreview,
    buildPrintHTML, printUsingFrame, printUsingBlobWindow,
    getShareSelection, buildShareText, copyToClipboard
  };

  load(); migrateData(); setTheme(state.settings.dark); applyAppearance();
  if(state.currentListId !== '__completed__' && !listById(state.currentListId)){
    state.currentListId = state.lists[0].id; state.lastActiveListId = state.currentListId;
  }
  render();

  // Export dla handlers
  window.appState = { state, el, $, $$, PALETTE10, ICONS, NAME_MAX, APPEAR_DEFAULT, save, render, currentList, listById, escapeHtml, setTheme, applyAppearance };
})();
