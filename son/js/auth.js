"use strict";
import * as Supa from "./supabase-client.js";
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
export const Auth = {
  _subs: [],
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
  async getSession() {
    try { return await Supa.getSession?.(); }
    catch { return null; }
  },
  async signInWithGoogle() {
    try {
      await Supa.signInWithGoogle?.({
        redirectTo: location.origin
      });
      return { ok: true, redirected: true };
    } catch (e) {
      console.warn("signInWithGoogle error:", e);
      throw e;
    }
  },
  async signInWithEmail(email, password) {
    if (!isEmail(email) || !password) throw new Error("Nieprawidłowe dane logowania.");
    try {
      const { data, error } = await Supa.signInWithEmailPassword?.(email, password);
      if (error) {
        const { data: suData, error: suErr } = await Supa.signUpWithEmailPassword?.(email, password, {
          redirectTo: location.origin
        });
        if (suErr) throw suErr;
        return { ok: true, needsEmailConfirm: true, user: suData?.user ?? null };
      }
      return { ok: true, user: data?.user ?? null };
    } catch (e) {
      console.warn("signInWithEmail error:", e);
      throw e;
    }
  },
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
  async confirmPasswordReset(email, code, newPassword) {
    if (!isEmail(email) || !code || !newPassword) throw new Error("Brak wymaganych danych.");
    try {
      const { data, error } = await Supa.verifyOtp?.({ email, token: code, type: "recovery" });
      if (error) throw error;
      const { error: upErr } = await Supa.updateUser?.({ password: newPassword });
      if (upErr) throw upErr;
      return { ok: true };
    } catch (e) {
      console.warn("confirmPasswordReset error:", e);
      throw e;
    }
  },
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
  setPersistSession(on) {
    try {
      Supa.setPersistPreference?.(!!on);
      return { ok: true };
    } catch (e) {
      console.warn("setPersistSession error:", e);
      return { ok: false };
    }
  },
  async deleteAccount() {
    const err = new Error("Usunięcie konta wymaga interwencji administratora. Skontaktuj się ze wsparciem.");
    err.code = "admin_required";
    throw err;
  }
};
export default Auth;