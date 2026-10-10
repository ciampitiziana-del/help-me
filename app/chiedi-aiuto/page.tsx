"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
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

  const [invioInCorso, setInvioInCorso] = useState(false);
  const [annullamentoInCorso, setAnnullamentoInCorso] = useState(false);

  // Calcola automaticamente la priorità in base ai clienti
  const getPriorita = () => {
    if (clienti >= 5) return "URGENTE";
    if (clienti >= 3) return "ALTA";
    return "NORMALE";
  };

  // Aggiorna lo stato locale quando la richiesta termina
  const terminaRichiesta = () => {
    setRichiestaAttiva(false);
    setAiutoInArrivo(false);
    setAcceptedBy("");
    setRequestId(null);
    setDettaglioAiuto("");
  };

  // Controlla in tempo reale lo stato della richiesta
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

          if (
            richiesta.status === "closed" ||
            richiesta.status === "cancelled"
          ) {
            setRichiestaAttiva(false);
            setAiutoInArrivo(false);
            setAcceptedBy("");
            setRequestId(null);
            setDettaglioAiuto("");
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [requestId]);

  // Invia una nuova richiesta di aiuto
  const chiediAiuto = async () => {
    if (invioInCorso || richiestaAttiva) return;

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

    setInvioInCorso(true);

    try {
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
            request_detail:
              tipoAiuto === "Altro" ? dettaglioAiuto.trim() : null,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Errore Supabase:", error);
        alert("Errore durante l'invio della richiesta.");
        return;
      }

      if (!data) {
        alert("Non è stato possibile creare la richiesta.");
        return;
      }

      console.log("Richiesta creata:", data);

      setRequestId(data.id);
      setAcceptedBy("");
      setAiutoInArrivo(false);
      setRichiestaAttiva(true);

      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (error) {
      console.error("Errore durante la creazione:", error);
      alert("Si è verificato un problema durante l'invio.");
    } finally {
      setInvioInCorso(false);
    }
  };

  // Annulla una richiesta soltanto se è ancora in attesa
  const annullaRichiesta = async () => {
    if (!requestId || annullamentoInCorso) return;

    setAnnullamentoInCorso(true);

    try {
      const { data, error } = await supabase
        .from("help_requests")
        .update({
          status: "cancelled",
        })
        .eq("id", requestId)
        .eq("status", "waiting")
        .select("id");

      if (error) {
        console.error("Errore annullamento richiesta:", error);
        alert("Non è stato possibile annullare la richiesta.");
        return;
      }

      // Nessuna riga aggiornata: la richiesta non è più in attesa
      if (!data || data.length === 0) {
        const { data: richiesta, error: erroreControllo } = await supabase
          .from("help_requests")
          .select("status, accepted_by")
          .eq("id", requestId)
          .single();

        if (erroreControllo) {
          console.error("Errore controllo stato richiesta:", erroreControllo);
          alert("Non è stato possibile verificare lo stato della richiesta.");
          return;
        }

        if (richiesta.status === "accepted") {
          setAcceptedBy(richiesta.accepted_by ?? "");
          setAiutoInArrivo(true);

          alert(
            "La richiesta è già stata presa in carico da un collega e non può essere annullata.",
          );

          return;
        }

        if (richiesta.status === "closed" || richiesta.status === "cancelled") {
          terminaRichiesta();
          return;
        }

        alert(
          "La richiesta non è stata annullata. Riprova tra qualche istante.",
        );

        return;
      }

      // Supabase conferma che la richiesta è stata annullata
      terminaRichiesta();
    } catch (error) {
      console.error("Errore durante l'annullamento:", error);
      alert("Si è verificato un problema durante l'annullamento.");
    } finally {
      setAnnullamentoInCorso(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* INTESTAZIONE */}
        <div className="bg-blue-950 text-white p-7 text-center">
          <h1 className="text-4xl font-bold tracking-tight">HELP ME</h1>

          <p className="text-blue-200 mt-2">Assistenza colleghi</p>
        </div>

        {/* NOME DEL COLLEGA */}
        <div className="px-5 pt-5 mb-5">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            IL TUO NOME
          </label>

          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Es. Tiziana"
            disabled={richiestaAttiva || invioInCorso}
            className="w-full h-14 border-2 border-slate-200 rounded-xl px-4 text-lg text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        <div className="p-6">
          {/* REPARTO */}
          <label className="block text-sm font-bold text-slate-700 mb-2">
            DOVE SERVE AIUTO?
          </label>

          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={richiestaAttiva || invioInCorso}
            className="w-full border-2 border-slate-200 rounded-xl p-4 text-lg bg-white mb-7 text-slate-900 disabled:bg-slate-50"
          >
            <option>Laboratorio</option>
            <option>Casse</option>
            <option>Accoglienza</option>
            <option>Magazzino</option>
            <option>Reparto</option>
          </select>

          {/* TIPO DI AIUTO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* CLIENTI IN ATTESA */}
            <div className="rounded-2xl border-2 border-slate-200 p-5">
              <p className="text-sm font-bold text-slate-700 text-center mb-4">
                CLIENTI IN ATTESA
              </p>

              <div className="flex items-center justify-center gap-8">
                <button
                  type="button"
                  onClick={() =>
                    setClienti((numero) => Math.max(1, numero - 1))
                  }
                  disabled={richiestaAttiva || invioInCorso}
                  className="w-14 h-14 rounded-full bg-slate-200 text-3xl font-bold hover:bg-slate-300 disabled:opacity-50"
                >
                  −
                </button>

                <span className="text-5xl font-bold text-slate-900">
                  {clienti}
                </span>

                <button
                  type="button"
                  onClick={() => setClienti((numero) => numero + 1)}
                  disabled={richiestaAttiva || invioInCorso}
                  className="w-14 h-14 rounded-full bg-slate-200 text-3xl font-bold hover:bg-slate-300 disabled:opacity-50"
                >
                  +
                </button>
              </div>

              <div className="text-center mt-5">
                <span
                  className={`inline-block px-5 py-2 rounded-full font-bold ${
                    getPriorita() === "URGENTE"
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

            {/* ALTRO TIPO DI AIUTO */}
            <div className="rounded-2xl border-2 border-slate-200 p-5">
              <p className="text-sm font-bold text-slate-700 text-center mb-4">
                ALTRO TIPO DI AIUTO
              </p>

              <select
                value={tipoAiuto}
                onChange={(e) => setTipoAiuto(e.target.value)}
                disabled={richiestaAttiva || invioInCorso}
                className="w-full border-2 border-slate-200 rounded-xl p-4 text-slate-900 disabled:bg-slate-50"
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
                    disabled={richiestaAttiva || invioInCorso}
                    placeholder="Descrivi brevemente di cosa hai bisogno..."
                    rows={3}
                    className="w-full border-2 border-slate-200 rounded-xl p-3 text-slate-900 resize-none disabled:bg-slate-50"
                  />
                </div>
              )}

              <p className="text-sm font-bold text-slate-700 text-center mt-5 mb-3">
                PRIORITÀ
              </p>

              <select
                value={prioritaManuale}
                onChange={(e) => setPrioritaManuale(e.target.value)}
                disabled={richiestaAttiva || invioInCorso}
                className="w-full border-2 border-slate-200 rounded-xl p-4 text-slate-900 disabled:bg-slate-50"
              >
                <option value="NORMAL">Normale</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
          </div>

          {/* PULSANTE INVIO RICHIESTA */}
          {!richiestaAttiva ? (
            <button
              type="button"
              onClick={chiediAiuto}
              disabled={invioInCorso}
              className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white text-xl font-bold py-5 rounded-2xl transition disabled:opacity-50"
            >
              {invioInCorso ? "INVIO IN CORSO..." : "CHIEDI AIUTO"}
            </button>
          ) : (
            <div className="mt-8">
              {/* CONFERMA RICHIESTA */}
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 text-center">
                <p className="text-green-700 font-bold text-lg">
                  RICHIESTA INVIATA
                </p>

                <p className="text-slate-700 mt-2">{area}</p>

                {tipoAiuto ? (
                  <>
                    <p className="text-slate-900 font-bold mt-2">{tipoAiuto}</p>

                    <p className="text-slate-500 mt-1">
                      Priorità {prioritaManuale.toLowerCase()}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-500">{clienti} clienti in attesa</p>
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

              {/* ANNULLAMENTO RICHIESTA */}
              {!aiutoInArrivo && (
                <button
                  type="button"
                  onClick={annullaRichiesta}
                  disabled={annullamentoInCorso}
                  className="w-full mt-4 border-2 border-red-200 text-red-600 font-bold py-4 rounded-xl hover:bg-red-50 disabled:opacity-50"
                >
                  {annullamentoInCorso
                    ? "ANNULLAMENTO IN CORSO..."
                    : "ANNULLA RICHIESTA"}
                </button>
              )}
            </div>
          )}

          {/* STATO INIZIALE */}
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
