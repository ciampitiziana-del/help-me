"use client";

import { useState } from "react";

export default function AttivaNotifiche() {
  const [messaggio, setMessaggio] = useState("");

  const attivaNotifiche = async () => {
    if (!("Notification" in window)) {
      setMessaggio("Questo dispositivo non supporta le notifiche.");
      return;
    }

    const permesso = await Notification.requestPermission();

    if (permesso === "granted") {
      try {
        if (!("serviceWorker" in navigator)) {
          setMessaggio("Questo dispositivo non supporta le notifiche push.");
          return;
        }

        const registration = await navigator.serviceWorker.ready;

        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

        if (!publicKey) {
          setMessaggio("Chiave pubblica VAPID non configurata.");
          return;
        }

        const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding)
          .replace(/-/g, "+")
          .replace(/_/g, "/");

        const rawData = atob(base64);
        const applicationServerKey = Uint8Array.from(rawData, (char) =>
          char.charCodeAt(0),
        );

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }

        const response = await fetch("/api/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(subscription),
        });

        if (!response.ok) {
          throw new Error("Registrazione sul server non riuscita");
        }

        setMessaggio("Notifiche push attivate correttamente!");
      } catch (error) {
        console.error("Errore notifiche push:", error);
        setMessaggio("Errore durante l'attivazione delle notifiche push.");
      }
    } else {
      setMessaggio("Autorizzazione alle notifiche non concessa.");
    }
  }; // Chiude la funzione attivaNotifiche

  return (
    <div className="text-center">
      <button
        onClick={attivaNotifiche}
        className="rounded-xl bg-blue-700 px-6 py-3 font-bold text-white"
      >
        ATTIVA NOTIFICHE
      </button>

      {messaggio && <p className="mt-3 text-sm text-slate-700">{messaggio}</p>}
    </div>
  );
}
