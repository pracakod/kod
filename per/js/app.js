"use strict";

import { Storage } from "./storage.js";
import { initSupabase, isSupabaseConfigured } from "./supabase-client.js";
import { initAuth, checkAuth } from "./auth.js";
import { toast } from "./ui.js";
import { initNotifications } from "./notifications.js";
import { initRecipes } from "./recipes.js";
import { initSettings } from "./settings.js";
import { initProfile } from "./profile.js";
import { initArchive } from "./archive.js";
import { initStatistics } from "./statistics.js";

const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

// Stan aplikacji
export const AppState = {
  currentView: 'checklist',
  currentUser: null,
  isOnline: navigator.onLine,
  storage: null,
  supabase: null
};

// Inicjalizacja aplikacji
async function initApp() {
  try {
    console.log('🚀 Inicjalizacja aplikacji...');
    
    // 1. Storage (zawsze pierwszy)
    AppState.storage = new Storage();
    await AppState.storage.init();
    console.log('✓ Storage zainicjalizowany');
    
    // 2. UI Event Listeners
    initUIListeners();
    console.log('✓ UI zainicjalizowane');
    
    // 3. Supabase (opcjonalnie)
    if (isSupabaseConfigured()) {
      AppState.supabase = await initSupabase();
      if (AppState.supabase) {
        console.log('✓ Supabase zainicjalizowany');
        
        // 4. Auth (tylko jeśli Supabase dostępny)
        await initAuth();
        const user = await checkAuth();
        if (user) {
          AppState.currentUser = user;
          updateUserDisplay(user);
        }
        console.log('✓ Auth zainicjalizowany');
      }
    } else {
      console.log('ℹ️ Aplikacja działa w trybie offline (Supabase nie skonfigurowany)');
      showGuestMode();
    }
    
    // 5. Powiadomienia
    await initNotifications();
    console.log('✓ Powiadomienia zainicjalizowane');
    
    // 6. Załaduj domyślny widok
    await loadView('checklist');
    
    // 7. Online/Offline listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // 8. Sprawdź stan połączenia
    if (!navigator.onLine) {
      handleOffline();
    }
    
    console.log('✅ Aplikacja gotowa');
    
  } catch (error) {
    console.error('❌ Błąd inicjalizacji aplikacji:', error);
    toast('Wystąpił problem podczas uruchamiania aplikacji');
  }
}

// UI Event Listeners
function initUIListeners() {
  // Drawer toggle
  const drawerToggle = qs('#drawer-toggle');
  const drawer = qs('#drawer');
  const drawerClose = qs('#drawer-close');
  
  if (drawerToggle && drawer) {
    drawerToggle.addEventListener('click', () => {
      drawer.setAttribute('aria-hidden', 'false');
    });
  }
  
  if (drawerClose && drawer) {
    drawerClose.addEventListener('click', () => {
      drawer.setAttribute('aria-hidden', 'true');
    });
  }
  
  // Kliknięcie poza drawer zamyka go
  if (drawer) {
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) {
        drawer.setAttribute('aria-hidden', 'true');
      }
    });
  }
  
  // Bottom nav tabs
  qsa('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) {
        loadView(view);
        // Zamknij drawer jeśli otwarty
        if (drawer) drawer.setAttribute('aria-hidden', 'true');
      }
    });
  });
  
  // Drawer nav items
  qsa('.drawer-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) {
        loadView(view);
        if (drawer) drawer.setAttribute('aria-hidden', 'true');
      }
    });
  });
  
  // Profile button
  const profileBtn = qs('#profile-btn');
  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      loadView('profile');
    });
  }
  
  // Sync button
  const syncBtn = qs('#sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      if (!navigator.onLine) {
        toast('Brak połączenia z internetem');
        return;
      }
      
      syncBtn.disabled = true;
      toast('Synchronizacja...');
      
      const result = await AppState.storage.syncWithSupabase();
      
      if (result.synced > 0) {
        toast(`Zsynchronizowano ${result.synced} elementów`);
      } else if (result.failed > 0) {
        toast(`Błąd synchronizacji: ${result.failed} elementów`);
      } else {
        toast('Wszystko aktualne');
      }
      
      syncBtn.disabled = false;
    });
  }
  
  // Global search
  const searchInput = qs('#global-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleGlobalSearch, 300));
  }
}

// Ładowanie widoków
export async function loadView(viewName) {
  console.log(`Ładowanie widoku: ${viewName}`);
  
  // Ukryj wszystkie widoki
  qsa('.view').forEach(v => v.setAttribute('hidden', ''));
  
  // Aktualizuj aktywne tapy
  qsa('.tab-btn').forEach(btn => {
    if (btn.dataset.view === viewName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Pokaż wybrany widok
  const view = qs(`#view-${viewName}`);
  if (view) {
    view.removeAttribute('hidden');
    AppState.currentView = viewName;
    
    // Inicjalizuj specyficzne funkcje widoku
    switch (viewName) {
      case 'checklist':
        await initChecklistView();
        break;
      case 'tasks':
        await initTasksView();
        break;
      case 'shopping':
        await initShoppingView();
        break;
      case 'recipes':
        initRecipes();
        break;
      case 'vacations':
        await initVacationsView();
        break;
      case 'statistics':
        initStatistics();
        break;
      case 'settings':
        initSettings();
        break;
      case 'profile':
        initProfile();
        break;
      case 'archive':
        initArchive();
        break;
    }
  }
}

// Placeholder funkcje dla widoków (do implementacji)
async function initChecklistView() {
  const view = qs('#view-checklist');
  if (!view.innerHTML.trim()) {
    view.innerHTML = `
      <div class="section-header">
        <h2><span class="icon icon-checklist"></span> Checklista</h2>
        <button class="btn-primary">+ Dodaj</button>
      </div>
      <p class="muted">Widok Checklista - w trakcie implementacji</p>
    `;
  }
}

async function initTasksView() {
  const view = qs('#view-tasks');
  if (!view.innerHTML.trim()) {
    view.innerHTML = `
      <div class="section-header">
        <h2><span class="icon icon-tasks"></span> Zadania</h2>
        <button class="btn-primary">+ Dodaj</button>
      </div>
      <p class="muted">Widok Zadania - w trakcie implementacji</p>
    `;
  }
}

async function initShoppingView() {
  const view = qs('#view-shopping');
  if (!view.innerHTML.trim()) {
    view.innerHTML = `
      <div class="section-header">
        <h2><span class="icon icon-cart"></span> Zakupy</h2>
        <button class="btn-primary">+ Dodaj</button>
      </div>
      <p class="muted">Widok Zakupy - w trakcie implementacji</p>
    `;
  }
}

async function initVacationsView() {
  const view = qs('#view-vacations');
  if (!view.innerHTML.trim()) {
    view.innerHTML = `
      <div class="section-header">
        <h2><span class="icon icon-vacation"></span> Wakacje</h2>
        <button class="btn-primary">+ Dodaj</button>
      </div>
      <p class="muted">Widok Wakacje - w trakcie implementacji</p>
    `;
  }
}

// Online/Offline handlers
function handleOnline() {
  AppState.isOnline = true;
  const banner = qs('#offline-banner');
  if (banner) banner.setAttribute('hidden', '');
  
  toast('Połączono z internetem');
  
  // Auto-sync
  if (AppState.storage && AppState.supabase) {
    setTimeout(() => {
      AppState.storage.syncWithSupabase();
    }, 1000);
  }
  
  // Pokaż przycisk sync
  const syncBtn = qs('#sync-btn');
  if (syncBtn) syncBtn.removeAttribute('hidden');
}

function handleOffline() {
  AppState.isOnline = false;
  const banner = qs('#offline-banner');
  if (banner) banner.removeAttribute('hidden');
  
  toast('Pracujesz offline');
  
  // Ukryj przycisk sync
  const syncBtn = qs('#sync-btn');
  if (syncBtn) syncBtn.setAttribute('hidden', '');
}

// User Display
function updateUserDisplay(user) {
  const userName = qs('#drawer-user-name');
  const userEmail = qs('#drawer-user-email');
  
  if (userName) userName.textContent = user.email?.split('@')[0] || 'Użytkownik';
  if (userEmail) userEmail.textContent = user.email || '';
}

function showGuestMode() {
  const userName = qs('#drawer-user-name');
  const userEmail = qs('#drawer-user-email');
  
  if (userName) userName.textContent = 'Gość';
  if (userEmail) userEmail.textContent = 'Tryb lokalny';
}

// Global Search
function handleGlobalSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  console.log('Wyszukiwanie:', query);
  // TODO: Implementacja wyszukiwania globalnego
}

// Utility: Debounce
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Uruchom aplikację
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

export { loadView };
