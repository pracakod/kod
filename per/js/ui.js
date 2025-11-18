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

// NAPRAWIONE: Dodano eksport UI jako obiekt
export const UI = {
  toast,
  showDialog(title, content) {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <div class="dialog-content">
        <h3>${title}</h3>
        <div>${content}</div>
        <menu class="dialog-actions">
          <button class="btn-secondary" id="close-dialog-btn">Zamknij</button>
        </menu>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();
    
    qs('#close-dialog-btn').addEventListener('click', () => {
      dialog.close();
      dialog.remove();
    });
    
    return dialog;
  },
  
  confirm(message, onConfirm) {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <div class="dialog-content">
        <h3>Potwierdzenie</h3>
        <p>${message}</p>
        <menu class="dialog-actions">
          <button class="btn-secondary" id="cancel-dialog-btn">Anuluj</button>
          <button class="btn-primary" id="confirm-dialog-btn">Potwierdź</button>
        </menu>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();
    
    qs('#cancel-dialog-btn').addEventListener('click', () => {
      dialog.close();
      dialog.remove();
    });
    
    qs('#confirm-dialog-btn').addEventListener('click', () => {
      onConfirm();
      dialog.close();
      dialog.remove();
    });
  }
};

export function initUI() {
  console.log('UI helpers załadowane');
}

export default UI;
