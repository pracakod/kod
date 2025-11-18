"use strict";

const qs = (s) => document.querySelector(s);

export function toast(message, actionLabel = null, actionFn = null, timeout = 3000) {
  const snackbar = qs('#snackbar');
  if (!snackbar) return;
  
  const textEl = qs('#snackbar-text');
  const actionBtn = qs('#snackbar-action');
  
  if (textEl) textEl.textContent = message;
  
  if (actionLabel && typeof actionFn === 'function' && actionBtn) {
    actionBtn.textContent = actionLabel;
    actionBtn.removeAttribute('hidden');
    
    const handler = () => {
      actionFn();
      actionBtn.removeEventListener('click', handler);
      actionBtn.setAttribute('hidden', '');
      snackbar.setAttribute('hidden', '');
    };
    
    actionBtn.addEventListener('click', handler);
  } else if (actionBtn) {
    actionBtn.setAttribute('hidden', '');
  }
  
  snackbar.removeAttribute('hidden');
  
  if (timeout > 0) {
    setTimeout(() => {
      snackbar.setAttribute('hidden', '');
      if (actionBtn) actionBtn.setAttribute('hidden', '');
    }, timeout);
  }
}

export function initUI() {
  console.log('UI helpers załadowane');
}
