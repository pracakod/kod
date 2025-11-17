/* ==========================================================================
   Lista — auth.js
   Odpowiada za: logowanie Google, logowanie/rejestrację e‑mail/hasło,
   weryfikację e‑mail (OTP/link), reset hasła kodem (OTP), zmianę e‑maila/hasła,
   wylogowanie, „pozostań zalogowany” (persist session) oraz nasłuch stanu.
   Integracja: supabase-client.js (połączenie), storage.js (migracja gościa).
   ========================================================================== */

"use strict";

import * as Supa from "./supabase-client.js";

/* Użyteczne narzędzia lokalne */
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

/* Główny moduł */
export const Auth = {
  _subs: [],

  /* Podłączenie nasłuchu zmian sesji. Zwraca funkcję unsubscribe. */
  onAuthStateChange(handler) {
    const sub = Supa.onAuthStateChange?.((evt) => {
      try { handler(evt); } catch {}
    });
    if (sub && typeof sub.unsubscribe === "function") {
      this._subs.push(sub);
      return () => sub.unsubscribe();
    }
    return () => {};
  },

  /* Pobierz bieżącą sesję (opcjonalnie) */
  async getSession() {
    try { return await Supa.getSession?.(); }
    catch { return null; }
  },

  /* Logowanie przez Google (OAuth) — używa przekierowania */
  async signInWithGoogle() {
    try {
      await Supa.signInWithGoogle?.({
        redirectTo: location.origin // można rozszerzyć o ścieżkę powrotu
      });
      // Dalsza logika po powrocie z przekierowania wykona się w onAuthStateChange
      return { ok: true, redirected: true };
    } catch (e) {
      console.warn("signInWithGoogle error:", e);
      throw e;
    }
  },

  /* Logowanie/Rejestracja e‑mail/hasło
     Zgodnie z wymaganiem: „Nowy użytkownik: konto zostanie utworzone automatycznie.” */
  async signInWithEmail(email, password) {
    if (!isEmail(email) || !password) throw new Error("Nieprawidłowe dane logowania.");
    try {
      const { data, error } = await Supa.signInWithEmailPassword?.(email, password);
      if (error) {
        // Jeśli nie udało się zalogować, spróbuj utworzyć konto (signUp)
        const { data: suData, error: suErr } = await Supa.signUpWithEmailPassword?.(email, password, {
          redirectTo: location.origin
        });
        if (suErr) throw suErr;
        // W większości konfiguracji wymagane jest potwierdzenie e‑maila
        return { ok: true, needsEmailConfirm: true, user: suData?.user ?? null };
      }
      return { ok: true, user: data?.user ?? null };
    } catch (e) {
      console.warn("signInWithEmail error:", e);
      throw e;
    }
  },

  /* Wysyłka kodu resetu hasła (na e‑mail) */
  async sendResetCode(email) {
    if (!isEmail(email)) throw new Error("Nieprawidłowy adres e‑mail.");
    try {
      const { error } = await Supa.resetPasswordForEmail?.(email, {
        redirectTo: `${location.origin}/#password-reset`
      });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn("sendResetCode error:", e);
      throw e;
    }
  },

  /* Potwierdzenie resetu hasła kodem OTP + ustawienie nowego hasła */
  async confirmPasswordReset(email, code, newPassword) {
    if (!isEmail(email) || !code || !newPassword) throw new Error("Brak wymaganych danych.");
    try {
      // 1) Weryfikacja kodu „recovery”
      const { data, error } = await Supa.verifyOtp?.({ email, token: code, type: "recovery" });
      if (error) throw error;
      // 2) Aktualizacja hasła po weryfikacji
      const { error: upErr } = await Supa.updateUser?.({ password: newPassword });
      if (upErr) throw upErr;
      return { ok: true };
    } catch (e) {
      console.warn("confirmPasswordReset error:", e);
      throw e;
    }
  },

  /* Weryfikacja adresu e‑mail kodem (np. po rejestracji) */
  async verifyEmailWithCode(email, code) {
    if (!isEmail(email) || !code) throw new Error("Brak wymaganych danych.");
    try {
      const { error } = await Supa.verifyOtp?.({ email, token: code, type: "signup" });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn("verifyEmailWithCode error:", e);
      throw e;
    }
  },

  /* Zmiana e‑maila (wymaga sesji); Supabase wyśle potwierdzenie na nowy adres */
  async changeEmail(newEmail) {
    if (!isEmail(newEmail)) throw new Error("Nieprawidłowy adres e‑mail.");
    try {
      const { error } = await Supa.updateUser?.({ email: newEmail });
      if (error) throw error;
      return { ok: true, verificationSent: true };
    } catch (e) {
      console.warn("changeEmail error:", e);
      throw e;
    }
  },

  /* Zmiana hasła (wymaga sesji) */
  async changePassword(newPassword) {
    if (!newPassword || newPassword.length < 6) throw new Error("Hasło musi mieć co najmniej 6 znaków.");
    try {
      const { error } = await Supa.updateUser?.({ password: newPassword });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn("changePassword error:", e);
      throw e;
    }
  },

  /* Wylogowanie */
  async signOut() {
    try {
      const { error } = await Supa.signOut?.();
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn("signOut error:", e);
      throw e;
    }
  },

  /* „Pozostań zalogowany” — zapis preferencji w kliencie Supabase */
  setPersistSession(on) {
    try {
      Supa.setPersistPreference?.(!!on);
      return { ok: true };
    } catch (e) {
      console.warn("setPersistSession error:", e);
      return { ok: false };
    }
  },

  /* Usunięcie konta — wymaga uprawnień serwisowych (niedostępne w kliencie anon). 
     Ta metoda celowo zgłasza błąd z informacją. */
  async deleteAccount() {
    const err = new Error("Usunięcie konta wymaga interwencji administratora. Skontaktuj się ze wsparciem.");
    err.code = "admin_required";
    throw err;
  }
};

export default Auth;