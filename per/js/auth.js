"use strict";

import { initSupabase, isSupabaseConfigured } from "./supabase-client.js";

let supabase = null;

export async function initAuth() {
  if (!isSupabaseConfigured()) {
    console.log("Auth: Supabase nie skonfigurowany");
    return null;
  }

  try {
    supabase = await initSupabase();
    if (!supabase) return null;

    console.log("Auth: zainicjalizowany");
    return supabase;
  } catch (error) {
    console.error("Auth: błąd inicjalizacji:", error);
    return null;
  }
}

export async function checkAuth() {
  if (!supabase) {
    await initAuth();
  }

  if (!supabase) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error("Auth: błąd sprawdzania użytkownika:", error);
    return null;
  }
}

export async function signIn(email, password) {
  if (!supabase) await initAuth();
  if (!supabase) return { error: "Supabase niedostępny" };

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return { data };
  } catch (error) {
    console.error("Auth: błąd logowania:", error);
    return { error };
  }
}

export async function signUp(email, password) {
  if (!supabase) await initAuth();
  if (!supabase) return { error: "Supabase niedostępny" };

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });
    if (error) throw error;
    return { data };
  } catch (error) {
    console.error("Auth: błąd rejestracji:", error);
    return { error };
  }
}

export async function signOut() {
  if (!supabase) return;

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error("Auth: błąd wylogowania:", error);
  }
}

export default { initAuth, checkAuth, signIn, signUp, signOut };
