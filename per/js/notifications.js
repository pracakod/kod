"use strict";

import { toast } from "./ui.js";

const LS_NOTIFICATIONS_ENABLED = "lista:notifications-enabled";
const LS_NOTIFICATIONS_PERMISSION = "lista:notifications-permission";

let notificationsEnabled = false;
let permissionGranted = false;

export async function initNotifications() {
  console.log('Inicjalizacja powiadomień...');

  // Sprawdź czy przeglądarka obsługuje powiadomienia
  if (!("Notification" in window)) {
    console.log("Przeglądarka nie obsługuje powiadomień");
    return;
  }

  // Załaduj ustawienia z localStorage
  notificationsEnabled = localStorage.getItem(LS_NOTIFICATIONS_ENABLED) === "true";
  permissionGranted = Notification.permission === "granted";

  console.log('Powiadomienia zainicjalizowane:', { notificationsEnabled, permissionGranted });
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    toast("Twoja przeglądarka nie obsługuje powiadomień");
    return false;
  }

  if (Notification.permission === "granted") {
    permissionGranted = true;
    localStorage.setItem(LS_NOTIFICATIONS_PERMISSION, "granted");
    return true;
  }

  if (Notification.permission === "denied") {
    toast("Powiadomienia zostały zablokowane. Zmień ustawienia w przeglądarce.");
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    permissionGranted = permission === "granted";
    localStorage.setItem(LS_NOTIFICATIONS_PERMISSION, permission);

    if (permissionGranted) {
      toast("Powiadomienia włączone");
      return true;
    } else {
      toast("Powiadomienia odrzucone");
      return false;
    }
  } catch (error) {
    console.error("Błąd żądania uprawnień do powiadomień:", error);
    return false;
  }
}

export function enableNotifications(enabled = true) {
  notificationsEnabled = enabled;
  localStorage.setItem(LS_NOTIFICATIONS_ENABLED, String(enabled));
  
  if (enabled && !permissionGranted) {
    requestNotificationPermission();
  }
}

export function areNotificationsEnabled() {
  return notificationsEnabled && permissionGranted;
}

export async function showNotification(title, options = {}) {
  if (!areNotificationsEnabled()) {
    console.log("Powiadomienia wyłączone lub brak uprawnień");
    return null;
  }

  try {
    const notification = new Notification(title, {
      icon: "/kod/per/favicon.ico",
      badge: "/kod/per/favicon.ico",
      vibrate: [200, 100, 200],
      requireInteraction: false,
      ...options
    });

    // Automatyczne zamknięcie po 5 sekundach
    setTimeout(() => notification.close(), 5000);

    return notification;
  } catch (error) {
    console.error("Błąd wyświetlania powiadomienia:", error);
    return null;
  }
}

export async function scheduleNotification(title, options = {}, delayMs = 0) {
  if (delayMs <= 0) {
    return showNotification(title, options);
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      const notification = showNotification(title, options);
      resolve(notification);
    }, delayMs);
  });
}

export function cancelAllNotifications() {
  // Web Notifications API nie ma metody do anulowania zaplanowanych powiadomień
  // To byłoby potrzebne tylko gdybyśmy używali Service Worker notifications
  console.log("Anulowanie powiadomień (nie zaimplementowane)");
}

// Funkcje pomocnicze dla konkretnych typów powiadomień

export async function notifyTaskDue(taskTitle) {
  return showNotification("Przypomnienie o zadaniu", {
    body: taskTitle,
    tag: "task-reminder",
    icon: "/kod/per/favicon.ico"
  });
}

export async function notifyShoppingReminder(listName) {
  return showNotification("Przypomnienie o zakupach", {
    body: listName,
    tag: "shopping-reminder",
    icon: "/kod/per/favicon.ico"
  });
}

export async function notifyVacationReminder(vacationName, daysLeft) {
  return showNotification("Zbliżające się wakacje", {
    body: `${vacationName} - pozostało ${daysLeft} dni`,
    tag: "vacation-reminder",
    icon: "/kod/per/favicon.ico"
  });
}

export async function notifySync(message) {
  return showNotification("Synchronizacja", {
    body: message,
    tag: "sync-notification",
    icon: "/kod/per/favicon.ico"
  });
}

export default {
  initNotifications,
  requestNotificationPermission,
  enableNotifications,
  areNotificationsEnabled,
  showNotification,
  scheduleNotification,
  cancelAllNotifications,
  notifyTaskDue,
  notifyShoppingReminder,
  notifyVacationReminder,
  notifySync
};
