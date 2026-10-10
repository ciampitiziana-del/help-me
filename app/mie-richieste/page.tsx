"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type Richiesta = {
  id: number;
  requested_by: string | null;
  area: string;
  request_type: string | null;
  request_detail: string | null;
  status: string;
  accepted_by: string | null;
  created_at: string;
};

const stati: Record<string, string> = {
  waiting: "IN ATTESA",
  accepted: "PRESA IN CARICO",
  closed: "COMPLETATA",
  cancelled: "ANNULLATA",
};

export default function MieRichieste() {
  const [richieste, setRichieste] = useState<Richiesta[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    async function caricaRichieste() {
      // Visualizza soltanto le richieste delle ultime 6 ore
      const seiOreFa = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("help_requests")
        .select(
          "id, requested_by, area, request_type, request_detail, status, accepted_by, created_at",
        )
        .gte("created_at", seiOreFa)
        .eq("hidden_from_history", false)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Errore caricamento richieste:", error);
        setErrore("Impossibile caricare le richieste.");
      } else {
        setRichieste(data ?? []);
      }

      setCaricamento(false);
    }

    void caricaRichieste();

    const channel = supabase
      .channel("storico-richieste")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "help_requests",
        },
        () => {
          void caricaRichieste();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function eliminaDallElenco(id: number) {
    const conferma = window.confirm(
      "Vuoi eliminare definitivamente questa richiesta dall'elenco?",
    );

    if (!conferma) return;

    const { data, error } = await supabase
      .from("help_requests")
      .update({ hidden_from_history: true })
      .eq("id", id)
      .select("id");

    if (error) {
      console.error("Errore eliminazione richiesta:", error);
      alert("Impossibile eliminare la richiesta.");
      return;
    }

    if (!data || data.length === 0) {
      alert(
        "La richiesta non è stata modificata. Verifica i permessi su Supabase.",
      );
      return;
    }

    setRichieste((precedenti) =>
      precedenti.filter((richiesta) => richiesta.id !== id),
    );
  }

  async function annullaRichiesta(id: number) {
    const conferma = window.confirm(
      "Vuoi annullare questa richiesta di aiuto?",
    );

    if (!conferma) return;

    const { data, error } = await supabase
      .from("help_requests")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "waiting")
      .select("id");

    if (error) {
      alert("Errore durante l'annullamento.");
      return;
    }

    if (!data || data.length === 0) {
      alert("La richiesta non è più in attesa e non può essere annullata.");
      return;
    }

    setRichieste((precedenti) =>
      precedenti.map((richiesta) =>
        richiesta.id === id ? { ...richiesta, status: "cancelled" } : richiesta,
      ),
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl bg-blue-950 p-6 text-center text-white">
          <h1 className="text-3xl font-bold">LE MIE RICHIESTE</h1>
          <p className="mt-2 text-blue-200">Storico richieste di aiuto</p>
        </div>

        <Link
          href="/"
          className="my-5 inline-block rounded-xl bg-slate-700 px-5 py-3 font-bold text-white"
        >
          ← TORNA ALLA HOME
        </Link>

        {caricamento && (
          <p className="text-center text-slate-600">Caricamento richieste...</p>
        )}

        {errore && (
          <p className="rounded-xl bg-red-100 p-4 text-red-700">{errore}</p>
        )}

        {!caricamento && !errore && richieste.length === 0 && (
          <p className="text-center text-slate-600">
            Nessuna richiesta presente.
          </p>
        )}

        <div className="space-y-4">
          {richieste.map((richiesta) => (
            <div
              key={richiesta.id}
              className="rounded-2xl bg-white p-5 shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {richiesta.requested_by || "Collega"}
                </h2>

                <span className="rounded-full bg-blue-100 px-3 py-2 text-xs font-bold text-blue-800">
                  {stati[richiesta.status] ?? richiesta.status}
                </span>
              </div>

              <p className="mt-3 text-slate-700">
                <strong>Reparto:</strong> {richiesta.area}
              </p>

              <p className="mt-1 text-slate-700">
                <strong>Tipo di aiuto:</strong>{" "}
                {richiesta.request_type || "Assistenza"}
              </p>

              {richiesta.request_detail && (
                <p className="mt-1 text-slate-700">
                  <strong>Dettagli:</strong> {richiesta.request_detail}
                </p>
              )}

              <p className="mt-1 text-slate-700">
                <strong>Data:</strong>{" "}
                {new Date(richiesta.created_at).toLocaleString("it-IT")}
              </p>

              {richiesta.accepted_by && (
                <p className="mt-3 font-bold text-green-700">
                  Presa in carico da: {richiesta.accepted_by}
                </p>
              )}

              {richiesta.status === "waiting" && (
                <button
                  type="button"
                  onClick={() => void annullaRichiesta(richiesta.id)}
                  className="mt-4 w-full rounded-xl border-2 border-red-200 py-3 font-bold text-red-600 hover:bg-red-50"
                >
                  ANNULLA RICHIESTA
                </button>
              )}

              <button
                type="button"
                onClick={() => eliminaDallElenco(richiesta.id)}
                className="mt-3 w-full rounded-xl bg-slate-200 py-3 font-bold text-slate-700 hover:bg-slate-300"
              >
                ELIMINA DALL&apos;ELENCO
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
