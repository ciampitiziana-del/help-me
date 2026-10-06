"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [area, setArea] = useState("Laboratorio");
  const [clienti, setClienti] = useState(1);
  const [tipoAiuto, setTipoAiuto] = useState("");
  const [dettaglioAiuto, setDettaglioAiuto] = useState("");
  const [prioritaManuale, setPrioritaManuale] = useState("NORMAL");
  const [nome, setNome] = useState("");
  const [richiestaAttiva, setRichiestaAttiva] = useState(false);

  const [requestId, setRequestId] = useState<number | null>(null);
  const [aiutoInArrivo, setAiutoInArrivo] = useState(false);
  const [acceptedBy, setAcceptedBy] = useState("");

  const getPriorita = () => {
    if (clienti >= 5) return "URGENTE";
    if (clienti >= 3) return "ALTA";
    return "NORMALE";
  };

  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`help-request-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "help_requests",
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          console.log("Aggiornamento richiesta:", payload);

          const richiesta = payload.new;

          if (richiesta.status === "accepted") {
            setAcceptedBy(richiesta.accepted_by ?? "");
            setAiutoInArrivo(true);
          }

          if (richiesta.status === "closed") {
            setRichiestaAttiva(false);
            setAiutoInArrivo(false);
            setAcceptedBy("");
            setRequestId(null);
            setDettaglioAiuto("");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  const chiediAiuto = async () => {
    const nomePulito = nome.trim();

    if (!nomePulito) {
      alert("Inserisci il tuo nome prima di chiedere aiuto.");
      return;
    }

    if (tipoAiuto === "Altro" && !dettaglioAiuto.trim()) {
  alert("Specifica il tipo di aiuto richiesto.");
  return;
}

    const isAltroAiuto = tipoAiuto !== "";

    const priorita = isAltroAiuto
      ? prioritaManuale
      : clienti >= 5
        ? "URGENT"
        : clienti >= 3
          ? "HIGH"
          : "NORMAL";

    const { data, error } = await supabase
      .from("help_requests")
      .insert([
        {
          area: area,
          customers: isAltroAiuto ? 0 : clienti,
          priority: priorita,
          status: "waiting",
          requested_by: nomePulito,
          request_type: isAltroAiuto ? tipoAiuto : "Clienti",
          request_detail: tipoAiuto === "Altro" ? dettaglioAiuto.trim() : null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Errore Supabase:", error);
      alert("Errore durante l'invio della richiesta.");
      return;
    }

    console.log("Richiesta creata:", data);

    setRequestId(data.id);
    setAiutoInArrivo(false);
    setRichiestaAttiva(true);
  };

  const annullaRichiesta = async () => {
    if (!requestId) return;

    const { error } = await supabase
      .from("help_requests")
      .update({
        status: "cancelled",
      })
      .eq("id", requestId)
      .eq("status", "waiting");

    if (error) {
      console.error("Errore annullamento richiesta:", error);
      alert("Non è stato possibile annullare la richiesta.");
      return;
    }

    setRichiestaAttiva(false);
    setRequestId(null);
    setAiutoInArrivo(false);
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl ...">
        <div className="bg-blue-950 text-white p-7 text-center rounded-t-3xl">
          <h1 className="text-4xl font-bold tracking-tight">
            HELP ME
          </h1>

          <p className="text-blue-200 mt-2">
            Assistenza colleghi
          </p>
        </div>

        <div className="px-5 pt-5 mb-5">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            IL TUO NOME
          </label>

          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Es. Tiziana"
            disabled={richiestaAttiva}
            className="w-full h-14 border-2 border-slate-200 rounded-xl px-4 text-lg text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        <div className="p-6">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            DOVE SERVE AIUTO?
          </label>

          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl p-4 text-lg bg-white mb-7"
          >
            <option>Laboratorio</option>
            <option>Casse</option>
            <option>Accoglienza</option>
            <option>Magazzino</option>
            <option>Reparto</option>
          </select>

          <div className="grid grid-cols-2 gap-6 mt-6">

            <div className="rounded-2xl border-2 border-slate-200 p-5">

              <p className="text-sm font-bold text-slate-700 text-center mb-4">
                CLIENTI IN ATTESA
              </p>

              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={() =>
                    setClienti((numero) => Math.max(1, numero - 1))
                  }
                  className="w-14 h-14 rounded-full bg-slate-200 text-3xl font-bold hover:bg-slate-300"
                >
                  −
                </button>

                <span className="text-5xl font-bold text-slate-900">
                  {clienti}
                </span>

                <button
                  onClick={() =>
                    setClienti((numero) => numero + 1)
                  }
                  className="w-14 h-14 rounded-full bg-slate-200 text-3xl font-bold hover:bg-slate-300"
                >
                  +
                </button>
              </div>

              <div className="text-center mt-5">
                <span
                  className={`inline-block px-5 py-2 rounded-full font-bold ${getPriorita() === "URGENTE"
                    ? "bg-red-100 text-red-700"
                    : getPriorita() === "ALTA"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-green-100 text-green-700"
                    }`}
                >
                  PRIORITÀ {getPriorita()}
                </span>
              </div>

            </div>

            <div className="rounded-2xl border-2 border-slate-200 p-5">
              <p className="text-sm font-bold text-slate-700 text-center mb-4">
                ALTRO TIPO DI AIUTO
              </p>

              <select
                value={tipoAiuto}
                onChange={(e) => setTipoAiuto(e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl p-4 text-slate-900"
              >
                <option value="">Seleziona...</option>
                <option value="Cambio cassa">Cambio cassa</option>
                <option value="Cambio cabine">Cambio cabine</option>
                <option value="Pausa">Pausa</option>
                <option value="Altro">Altro</option>
              </select>

              {tipoAiuto === "Altro" && (
                <div className="mt-4">
                  <p className="text-sm font-bold text-slate-700 text-center mb-2">
                    SPECIFICA LA RICHIESTA
                  </p>

                  <textarea
                    value={dettaglioAiuto}
                    onChange={(e) => setDettaglioAiuto(e.target.value)}
                    placeholder="Descrivi brevemente di cosa hai bisogno..."
                    rows={3}
                    className="w-full border-2 border-slate-200 rounded-xl p-3 text-slate-900 resize-none"
                  />
                </div>
              )}

              <p className="text-sm font-bold text-slate-700 text-center mt-5 mb-3">
                PRIORITÀ
              </p>

              <select
                value={prioritaManuale}
                onChange={(e) => setPrioritaManuale(e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl p-4 text-slate-900"
              >
                <option value="NORMAL">Normale</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>

          </div>

          {!richiestaAttiva ? (
            <button
              onClick={chiediAiuto}
              className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white text-xl font-bold py-5 rounded-2xl transition"
            >
              CHIEDI AIUTO
            </button>
          ) : (
            <div className="mt-8">
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 text-center">
                <p className="text-green-700 font-bold text-lg">
                  RICHIESTA INVIATA
                </p>

                <p className="text-slate-700 mt-2">
                  {area}
                </p>

                {tipoAiuto ? (
                  <>
                    <p className="text-slate-900 font-bold mt-2">
                      {tipoAiuto}
                    </p>

                    <p className="text-slate-500 mt-1">
                      Priorità {prioritaManuale.toLowerCase()}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-500">
                    {clienti} clienti in attesa
                  </p>
                )}

                {aiutoInArrivo ? (
                  <p className="text-green-700 font-bold mt-3">
                    {acceptedBy
                      ? `${acceptedBy} HA PRESO IN CARICO LA TUA RICHIESTA`
                      : "UN COLLEGA HA PRESO IN CARICO LA TUA RICHIESTA"}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500 mt-3">
                    In attesa che un collega prenda in carico la richiesta...
                  </p>
                )}
              </div>

              <button
                onClick={annullaRichiesta}
                className="w-full mt-4 border-2 border-red-200 text-red-600 font-bold py-4 rounded-xl hover:bg-red-50"
              >
                ANNULLA RICHIESTA
              </button>
            </div>
          )}

          {!richiestaAttiva && (
            <p className="text-center text-slate-400 text-sm mt-5">
              Nessuna richiesta attiva
            </p>
          )}
        </div>
      </div>
    </main>
  );
}