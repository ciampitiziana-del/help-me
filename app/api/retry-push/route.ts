import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

const webhookSecret = process.env.WEBHOOK_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const appUrl = process.env.APP_URL;

function verificaAutorizzazione(request: Request): boolean {
  if (!webhookSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const tokenRicevuto = authorization.slice(7);

  const tokenAtteso = Buffer.from(webhookSecret);
  const tokenFornito = Buffer.from(tokenRicevuto);

  if (tokenAtteso.length !== tokenFornito.length) {
    return false;
  }

  return timingSafeEqual(tokenAtteso, tokenFornito);
}

export async function POST(request: Request) {
  if (!verificaAutorizzazione(request)) {
    return NextResponse.json(
      { error: "Accesso non autorizzato" },
      { status: 401 },
    );
  }

  // Verifica che Supabase sia configurato
  if (!supabaseUrl || !supabaseSecretKey) {
    return NextResponse.json(
      { error: "Configurazione Supabase mancante" },
      { status: 500 },
    );
  }

  // Crea il collegamento sicuro a Supabase
  const supabase = createClient(supabaseUrl, supabaseSecretKey);

  // Recupera le richieste che necessitano di un nuovo tentativo
  const { data: richieste, error } = await supabase.rpc(
    "get_pending_help_pushes",
  );

  if (error) {
    console.error("Errore recupero notifiche:", error.message);

    return NextResponse.json(
      { error: "Impossibile recuperare le notifiche" },
      { status: 500 },
    );
  }

  console.log("Notifiche da recuperare:", richieste?.length ?? 0);

  // Verifica l'indirizzo dell'app prima di richiamare l'API
  if (!appUrl) {
    return NextResponse.json(
      { error: "APP_URL non configurato" },
      { status: 500 },
    );
  }

  let urlApplicazione: URL;

  try {
    urlApplicazione = new URL(appUrl);

    const ambienteLocale =
      urlApplicazione.hostname === "localhost" ||
      urlApplicazione.hostname === "127.0.0.1";

    if (
      urlApplicazione.protocol !== "https:" &&
      !(ambienteLocale && urlApplicazione.protocol === "http:")
    ) {
      throw new Error("Protocollo non sicuro");
    }

    if (urlApplicazione.username || urlApplicazione.password) {
      throw new Error("Credenziali nell'URL non consentite");
    }
  } catch {
    return NextResponse.json({ error: "APP_URL non valido" }, { status: 500 });
  }

  if (!richieste || richieste.length === 0) {
    return NextResponse.json({
      success: true,
      message: "Nessuna notifica da recuperare",
      richiesteDaRecuperare: 0,
    });
  }

  // Richiama l'API di invio per ogni richiesta da recuperare
  const risultati = await Promise.allSettled(
    richieste.map(async (richiesta: { request_id: number }) => {
      const risposta = await fetch(new URL("/api/send-push", appUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webhookSecret}`,
        },
        body: JSON.stringify({
          type: "RETRY",
          table: "help_requests",
          schema: "public",
          record: {
            id: richiesta.request_id,
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });

      if (!risposta.ok) {
        throw new Error(
          `Recupero richiesta ${richiesta.request_id} fallito: HTTP ${risposta.status}`,
        );
      }

      return richiesta.request_id;
    }),
  );

  const recuperate = risultati.filter(
    (risultato) => risultato.status === "fulfilled",
  ).length;

  console.log(
    `Tentativi di recupero completati: ${recuperate} su ${richieste.length}`,
  );

  // Registra gli eventuali errori durante il recupero
  risultati.forEach((risultato, indice) => {
    if (risultato.status === "rejected") {
      console.error(
        `Errore recupero richiesta ${richieste[indice].request_id}:`,
        risultato.reason,
      );
    }
  });

  return NextResponse.json(
    {
      success: recuperate === richieste.length,
      richiesteDaRecuperare: richieste.length,
      tentativiCompletati: recuperate,
      tentativiFalliti: richieste.length - recuperate,
    },
    {
      status: recuperate === richieste.length ? 200 : 503,
    },
  );
}
