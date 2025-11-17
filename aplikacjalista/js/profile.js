/* ==========================================================================
   Lista — profile.js
   Odpowiada za: sekcję „Profil”
   - Podgląd konta (e‑mail, metoda logowania)
   - Zmiana e‑maila i hasła (dla kont e‑mail/hasło)
   - Reset hasła (kod OTP wysyłany na e‑mail)
   - „Pozostań zalogowany” — odczyt stanu i synchronizacja preferencji
   - Wylogowanie i usuwanie konta są obsługiwane w app.js (zachowujemy spójność)
   Integracja: auth.js, supabase-client.js
   ========================================================================== */

"use strict";

import { Auth } from "./auth.js";
import * as Supa from "./supabase-client.js";

/* Pomocnicze */
const qs = (s, r = document) => r.querySelector(s);

function toast(text, timeout = 3000) {
  const sb = qs("#snackbar");
  if (!sb) return;
  qs("#snackbar-text").textContent = text;
  const act = qs("#snackbar-action"); if (act) act.hidden = true;
  sb.hidden = false; sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}

/* Główny moduł */
export const Profile = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _unsubAuth: null,

  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;

    // Wczytaj bieżącą sesję i odtwórz profil
    await this._hydrateFromSession();

    // Nasłuch zmian stanu sesji
    try {
      this._unsubAuth = Auth.onAuthStateChange?.(({ user }) => this._renderUser(user));
    } catch {}

    // Preferencja „Pozostań zalogowany” — odczyt i wyrównanie z UI
    this._initPersistToggle();

    // Zmiana e‑maila
    qs("#btn-change-email")?.addEventListener("click", async () => {
      const cur = qs("#profile-email")?.textContent?.trim() || "";
      const email = prompt("Podaj nowy adres e‑mail:", cur);
      if (!email) return;
      try {
        const res = await Auth.changeEmail?.(email.trim());
        if (res?.verificationSent) {
          toast("Wysłano wiadomość weryfikacyjną na nowy adres e‑mail.");
        } else {
          toast("Zaktualizowano adres e‑mail.");
        }
      } catch (e) {
        toast("Nie udało się zmienić adresu e‑mail.");
      }
    });

    // Zmiana hasła
    qs("#btn-change-password")?.addEventListener("click", async () => {
      const pass1 = prompt("Wprowadź nowe hasło (min. 6 znaków):");
      if (!pass1) return;
      const pass2 = prompt("Powtórz nowe hasło:");
      if (pass1 !== pass2) { toast("Hasła nie są zgodne."); return; }
      try {
        await Auth.changePassword?.(pass1);
        toast("Hasło zostało zmienione.");
      } catch {
        toast("Zmiana hasła nie powiodła się.");
      }
    });

    // Reset hasła (OTP na e‑mail)
    qs("#btn-reset-password")?.addEventListener("click", async () => {
      const email = prompt("Podaj adres e‑mail do resetu hasła:");
      if (!email) return;
      try {
        await Auth.sendResetCode?.(email.trim());
        toast("Wysłano kod resetu na e‑mail.");

        const code = prompt("Wprowadź kod otrzymany e‑mailem:");
        if (!code) return;
        const newPass = prompt("Wprowadź nowe hasło:");
        if (!newPass) return;

        await Auth.confirmPasswordReset?.(email.trim(), code.trim(), newPass);
        toast("Hasło zostało zresetowane.");
      } catch {
        toast("Reset hasła nie powiódł się.");
      }
    });
  },

  async _hydrateFromSession() {
    try {
      const session = await Supa.getSession?.();
      const user = session?.user || null;
      this._renderUser(user);
    } catch {
      this._renderUser(null);
    }
  },

  _renderUser(user) {
    const emailEl = qs("#profile-email");
    const methodEl = qs("#profile-method");
    const actionsEmail = qs("#email-auth-actions");

    if (user) {
      const provider = user.app_metadata?.provider || "email";
      const label = provider === "google" ? "Google" : (provider === "email" ? "e‑mail" : provider);

      if (emailEl) emailEl.textContent = user.email || "—";
      if (methodEl) methodEl.textContent = `Metoda logowania: ${label}`;
      if (actionsEmail) actionsEmail.hidden = provider !== "email";
    } else {
      if (emailEl) emailEl.textContent = "—";
      if (methodEl) methodEl.textContent = "Metoda logowania: —";
      if (actionsEmail) actionsEmail.hidden = true;
    }
  },

  _initPersistToggle() {
    const toggle = qs("#persist-session");
    if (!toggle) return;

    // Ustaw stan początkowy na podstawie localStorage
    const pref = localStorage.getItem("lista:persistSession") === "1";
    toggle.checked = pref;

    // Zmiany preferencji sesji są już obsługiwane w app.js.
    // Aby uniknąć podwójnego wiązania, nie dodajemy tu obsługi „change”.
  }
};

/* Inicjalizacja samoczynna */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Profile.init(window.Bus));
} else {
  Profile.init(window.Bus);
}

export default Profile;