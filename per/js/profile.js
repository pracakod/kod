"use strict";

import { checkAuth, signOut } from "./auth.js";
import { getSupabase } from "./supabase-client.js";
import { toast } from "./ui.js";

const qs = (s) => document.querySelector(s);

export async function initProfile() {
  const view = qs('#view-profile');
  if (!view) return;

  const user = await checkAuth();
  const supabase = getSupabase();

  if (!user || !supabase) {
    // Tryb gość
    view.innerHTML = `
      <div class="section-header">
        <h2><span class="icon icon-user"></span> Profil</h2>
      </div>
      <div class="profile-card">
        <div class="profile-row">
          <div class="avatar-css large">
            <span class="icon icon-user"></span>
          </div>
          <div>
            <div class="strong">Tryb gości</div>
            <div class="small muted">Dane zapisywane lokalnie</div>
          </div>
        </div>
        <div class="profile-actions">
          <button class="btn-primary" id="profile-login-btn">Zaloguj się</button>
          <button class="btn-secondary" id="profile-register-btn">Zarejestruj się</button>
        </div>
      </div>
      <div class="profile-card">
        <h3>O trybie gości</h3>
        <p class="small muted">
          Wszystkie dane są zapisywane lokalnie w przeglądarce. 
          Zaloguj się, aby synchronizować dane między urządzeniami.
        </p>
      </div>
    `;

    qs('#profile-login-btn')?.addEventListener('click', showLoginDialog);
    qs('#profile-register-btn')?.addEventListener('click', showRegisterDialog);
    return;
  }

  // Zalogowany użytkownik
  view.innerHTML = `
    <div class="section-header">
      <h2><span class="icon icon-user"></span> Profil</h2>
    </div>
    <div class="profile-card">
      <div class="profile-row">
        <div class="avatar-css large">
          <span class="icon icon-user"></span>
        </div>
        <div>
          <div class="strong">${user.email?.split('@')[0] || 'Użytkownik'}</div>
          <div class="small muted">${user.email || ''}</div>
        </div>
      </div>
      <div class="profile-actions">
        <button class="btn-secondary" id="profile-sync-btn">Synchronizuj dane</button>
        <button class="btn-danger-outline" id="profile-logout-btn">Wyloguj się</button>
      </div>
    </div>
    <div class="profile-card">
      <h3>Informacje o koncie</h3>
      <p class="small muted">ID: ${user.id}</p>
      <p class="small muted">Utworzono: ${new Date(user.created_at).toLocaleDateString('pl-PL')}</p>
    </div>
  `;

  qs('#profile-sync-btn')?.addEventListener('click', async () => {
    toast('Synchronizacja w trakcie implementacji');
  });

  qs('#profile-logout-btn')?.addEventListener('click', async () => {
    if (!confirm('Czy na pewno chcesz się wylogować?')) return;
    
    await signOut();
    toast('Wylogowano pomyślnie');
    setTimeout(() => location.reload(), 1000);
  });
}

function showLoginDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.innerHTML = `
    <div class="dialog-content">
      <h3>Logowanie</h3>
      <form id="login-form" style="display:grid;gap:12px;">
        <label>
          <span>Email</span>
          <input type="email" id="login-email" required />
        </label>
        <label>
          <span>Hasło</span>
          <input type="password" id="login-password" required />
        </label>
        <menu class="dialog-actions">
          <button type="button" class="btn-secondary" id="cancel-login-btn">Anuluj</button>
          <button type="submit" class="btn-primary">Zaloguj</button>
        </menu>
      </form>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  qs('#cancel-login-btn', dialog)?.addEventListener('click', () => {
    dialog.close();
    dialog.remove();
  });

  qs('#login-form', dialog)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = qs('#login-email', dialog).value;
    const password = qs('#login-password', dialog).value;

    const supabase = getSupabase();
    if (!supabase) {
      toast('Supabase nie jest skonfigurowany');
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      toast('Zalogowano pomyślnie');
      dialog.close();
      dialog.remove();
      setTimeout(() => location.reload(), 1000);

    } catch (error) {
      console.error('Błąd logowania:', error);
      toast('Błąd logowania: ' + error.message);
    }
  });
}

function showRegisterDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.innerHTML = `
    <div class="dialog-content">
      <h3>Rejestracja</h3>
      <form id="register-form" style="display:grid;gap:12px;">
        <label>
          <span>Email</span>
          <input type="email" id="register-email" required />
        </label>
        <label>
          <span>Hasło (min. 6 znaków)</span>
          <input type="password" id="register-password" minlength="6" required />
        </label>
        <label>
          <span>Powtórz hasło</span>
          <input type="password" id="register-password2" minlength="6" required />
        </label>
        <menu class="dialog-actions">
          <button type="button" class="btn-secondary" id="cancel-register-btn">Anuluj</button>
          <button type="submit" class="btn-primary">Zarejestruj</button>
        </menu>
      </form>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  qs('#cancel-register-btn', dialog)?.addEventListener('click', () => {
    dialog.close();
    dialog.remove();
  });

  qs('#register-form', dialog)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = qs('#register-email', dialog).value;
    const password = qs('#register-password', dialog).value;
    const password2 = qs('#register-password2', dialog).value;

    if (password !== password2) {
      toast('Hasła nie są identyczne');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      toast('Supabase nie jest skonfigurowany');
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      toast('Konto utworzone! Sprawdź email w celu weryfikacji.');
      dialog.close();
      dialog.remove();

    } catch (error) {
      console.error('Błąd rejestracji:', error);
      toast('Błąd rejestracji: ' + error.message);
    }
  });
}

export default { initProfile };
