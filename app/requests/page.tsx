"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type HelpRequest = {
  id: number;
  area: string;
  customers: number;
  priority: "NORMAL" | "HIGH" | "URGENT";
  status: "waiting" | "accepted" | "closed" | "cancelled";
  requested_by: string | null;
  accepted_by: string | null;
  created_at: string;
  accepted_at: string | null;
  closed_at: string | null;
};

export default function RequestsPage() {
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [nomeCollega, setNomeCollega] = useState("");

  async function loadRequests() {
    const { data, error } = await supabase
      .from("help_requests")
      .select("*")
      .eq("status", "waiting")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Errore caricamento richieste:", error);
      setLoading(false);
      return;
    }

    setRequests(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests();

    const channel = supabase
      .channel("help-requests-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "help_requests",
        },
        () => {
          loadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function prendiRichiesta(id: number) {
    const nome = nomeCollega.trim();

    if (!nome) {
      alert("Inserisci il tuo nome prima di prendere una richiesta.");
      return;
    }

    const { error } = await supabase
      .from("help_requests")
      .update({
        status: "accepted",
        accepted_by: nome,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "waiting");

    if (error) {
      console.error("Errore presa in carico:", error);
      alert("Impossibile prendere in carico la richiesta.");
      return;
    }

    await loadRequests();
  }

  function priorityLabel(priority: HelpRequest["priority"]) {
    if (priority === "URGENT") return "URGENTE";
    if (priority === "HIGH") return "ALTA";
    return "NORMALE";
  }

  function priorityStyle(priority: HelpRequest["priority"]) {
    if (priority === "URGENT") {
      return "bg-red-100 text-red-700";
    }

    if (priority === "HIGH") {
      return "bg-orange-100 text-orange-700";
    }

    return "bg-green-100 text-green-700";
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-3xl">

        <div className="mb-6 rounded-2xl bg-[#192d66] p-6 text-white shadow">
          <h1 className="text-3xl font-bold">HELP ME</h1>
          <p className="mt-1 text-blue-100">
            Richieste di assistenza
          </p>
        </div>

        {loading && (
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            Caricamento richieste...
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div className="rounded-2xl bg-white p-10 text-center shadow">
            <div className="text-xl font-bold text-slate-700">
              Nessuna richiesta attiva
            </div>

            <p className="mt-2 text-slate-500">
              Le nuove richieste appariranno automaticamente.
            </p>
          </div>
        )}
        <div className="mb-6 bg-white rounded-2xl p-5 shadow">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            IL TUO NOME
          </label>

          <input
            type="text"
            value={nomeCollega}
            onChange={(e) => setNomeCollega(e.target.value)}
            placeholder="Es. Marco"
            className="w-full border-2 border-slate-200 rounded-xl p-4 text-lg outline-none focus:border-blue-500"
          />
        </div>
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="rounded-2xl bg-white p-6 shadow"
            >
              <div className="flex items-start justify-between gap-4">

                <div>
                  <div className="text-sm font-semibold text-slate-400">
                    RICHIESTA DI AIUTO
                  </div>

                  <h2 className="mt-1 text-2xl font-bold text-slate-900">
                    {request.area}
                  </h2>
                </div>

                <span
                  className={`rounded-full px-4 py-2 text-sm font-bold ${priorityStyle(
                    request.priority
                  )}`}
                >
                  {priorityLabel(request.priority)}
                </span>

              </div>

              <div className="mt-6 rounded-xl bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-500">
                  CLIENTI IN ATTESA
                </div>

                <div className="mt-1 text-4xl font-bold text-slate-900">
                  {request.customers}
                </div>
              </div>

              <button
                onClick={() => prendiRichiesta(request.id)}
                className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-700"
              >
                PRENDO IO
              </button>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}
