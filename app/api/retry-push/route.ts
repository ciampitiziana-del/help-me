import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { inviaNotificaAiuto } from "@/lib/sendHelpPush";

export const runtime = "nodejs";

function verificaAutorizzazione(request: Request): boolean {
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!webhookSecret) return false;

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) return false;

  const tokenAtteso = Buffer.from(webhookSecret);
  const tokenRicevuto = Buffer.from(authorization.slice(7));

  if (tokenAtteso.length !== tokenRicevuto.length) return false;

  return timingSafeEqual(tokenAtteso, tokenRicevuto);
}

export async function POST(request: Request) {
  if (!verificaAutorizzazione(request)) {
    return NextResponse.json(
      { error: "Accesso non autorizzato" },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    return NextResponse.json(
      { error: "Configurazione Supabase mancante" },
      { status: 500 },
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseSecretKey);

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

    if (!richieste || richieste.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nessuna notifica da recuperare",
        richiesteDaRecuperare: 0,
      });
    }

    const risultati = await Promise.allSettled(
      richieste.map((richiesta: { request_id: number }) =>
        inviaNotificaAiuto(richiesta.request_id),
      ),
    );

    const completate = risultati.filter(
      (risultato) => risultato.status === "fulfilled",
    ).length;

    const errori = risultati.flatMap((risultato, indice) => {
      if (risultato.status !== "rejected") return [];

      const errore = risultato.reason;

      return [
        {
          richiesta: richieste[indice].request_id,
          messaggio:
            errore instanceof Error ? errore.message : "Errore sconosciuto",
        },
      ];
    });

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
        success: completate === richieste.length,
        richiesteDaRecuperare: richieste.length,
        tentativiCompletati: completate,
        errori, 
      },
      {
        status: completate === richieste.length ? 200 : 503,
      },
    );
  } catch (error) {
    console.error("Errore API retry-push:", error);

    return NextResponse.json(
      { error: "Errore durante il recupero delle notifiche" },
      { status: 500 },
    );
  }
}
