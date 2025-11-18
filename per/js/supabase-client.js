"use strict";

// KONFIGURACJA SUPABASE
// WAŻNE: Zamień poniższe wartości na swoje dane z Supabase Dashboard
const SUPABASE_URL = 'https://vzttszvasssweigpqwcc.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dHRzenZhc3Nzd2VpZ3Bxd2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTM2ODEsImV4cCI6MjA3ODgyOTY4MX0.lRhUUWmtJX5yf-VYrVAIP94OH3ScAL5t3Zo8HrxTvlc';

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
    
    if (SUPABASE_URL === 'https://vzttszvasssweigpqwcc.supabase.co') {
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
  return SUPABASE_URL !== 'https://vzttszvasssweigpqwcc.supabase.co' && 
         SUPABASE_ANON_KEY !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dHRzenZhc3Nzd2VpZ3Bxd2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTM2ODEsImV4cCI6MjA3ODgyOTY4MX0.lRhUUWmtJX5yf-VYrVAIP94OH3ScAL5t3Zo8HrxTvlc';
}

function getSupabase() {
  return supabase;
}

export { initSupabase, isSupabaseConfigured, getSupabase };
export default { initSupabase, isSupabaseConfigured, getSupabase };
