"use strict";

const SUPABASE_URL = 'https://twoj-projekt.supabase.co';
const SUPABASE_ANON_KEY = 'twoj-anon-key-tutaj';

let supabase = null;

async function initSupabase() {
  if (supabase) return supabase;
  
  try {
    if (!window.supabase) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.type = 'text/javascript';
      
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    
    if (SUPABASE_URL === 'https://twoj-projekt.supabase.co') {
      console.warn('⚠️ SUPABASE: Nie skonfigurowano. Aplikacja działa w trybie offline.');
      return null;
    }
    
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    
    console.log('✓ Klient Supabase zainicjalizowany');
    return supabase;
    
  } catch (error) {
    console.error('Błąd inicjalizacji Supabase:', error);
    return null;
  }
}

function isSupabaseConfigured() {
  return SUPABASE_URL !== 'https://twoj-projekt.supabase.co' && 
         SUPABASE_ANON_KEY !== 'twoj-anon-key-tutaj';
}

function getSupabase() {
  return supabase;
}

// NAPRAWIONE: Dodano eksport getSession
async function getSession() {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch (error) {
    console.error('Błąd pobierania sesji:', error);
    return null;
  }
}

async function getUser() {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  } catch (error) {
    console.error('Błąd pobierania użytkownika:', error);
    return null;
  }
}

export { initSupabase, isSupabaseConfigured, getSupabase, getSession, getUser };
export default { initSupabase, isSupabaseConfigured, getSupabase, getSession, getUser };
