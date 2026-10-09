"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          console.log("HELP ME: Service Worker registrato");
        })
        .catch((error) => {
          console.error("Errore Service Worker:", error);
        });
    }
  }, []);

  return null;
}
