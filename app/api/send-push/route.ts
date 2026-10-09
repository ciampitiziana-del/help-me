import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { timingSafeEqual } from "node:crypto";

function verificaWebhook(request: Request): boolean {
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

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

const webhookSecret = process.env.WEBHOOK_SECRET;

function configuraWebPush() {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    throw new Error("Configurazione VAPID incompleta");
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export async function POST(request: Request) {
  // Verifica che la chiamata sia autorizzata
  if (!verificaWebhook(request)) {
    return NextResponse.json(
      { error: "Accesso non autorizzato" },
      { status: 401 },
    );
  }

  try {
    const body = await request.text();

    if (body.length > 10000) {
      return NextResponse.json(
        { error: "Richiesta troppo grande" },
        { status: 413 },
      );
    }

    const payload = JSON.parse(body);

    // Accettiamo soltanto eventi INSERT sulla tabella help_requests
    if (
      !["INSERT", "RETRY"].includes(payload.type) ||
      payload.table !== "help_requests" ||
      payload.schema !== "public" ||
      !Number.isSafeInteger(payload.record?.id) ||
      payload.record.id <= 0
    ) {
      return NextResponse.json({ error: "Evento non valido" }, { status: 400 });
    }

    // Verifica la configurazione di Supabase
    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json(
        { error: "Configurazione Supabase mancante" },
        { status: 500 },
      );
    }

    // Collegamento sicuro al database
    const supabase = createClient(supabaseUrl, supabaseSecretKey);

    // Recupera la richiesta direttamente da Supabase
    const { data: richiesta, error: erroreRichiesta } = await supabase
      .from("help_requests")
      .select("id, status, requested_by, area, priority, push_sent_at")
      .eq("id", payload.record.id)
      .single();

    if (erroreRichiesta || !richiesta) {
      return NextResponse.json(
        { error: "Richiesta di aiuto non trovata" },
        { status: 404 },
      );
    }

    // Non elaborare richieste già chiuse o già notificate
    if (richiesta.status !== "waiting" || richiesta.push_sent_at) {
      return NextResponse.json({
        success: true,
        message: "Richiesta già gestita o non più in attesa",
      });
    }

    // Recupera i dispositivi registrati per le notifiche push
    const { data: dispositivi, error: erroreDispositivi } = await supabase
      .from("push_subscriptions")
      .select("id, subscription");

    if (erroreDispositivi) {
      console.error("Errore recupero dispositivi:", erroreDispositivi.message);

      return NextResponse.json(
        { error: "Impossibile recuperare i dispositivi" },
        { status: 500 },
      );
    }

    console.log("Dispositivi registrati:", dispositivi?.length ?? 0);

    // Prepara il messaggio da inviare agli smartphone
    const messaggioPush = JSON.stringify({
      title: "HELP ME - Nuova richiesta",
      body: `${richiesta.requested_by || "Un collega"} chiede aiuto in ${richiesta.area}. Priorità: ${richiesta.priority}.`,
      url: "/requests",
    });

    // Riserva la richiesta per evitare elaborazioni contemporanee
    const { data: richiestaPrenotata, error: errorePrenotazione } =
      await supabase.rpc("claim_help_request_push", {
        p_request_id: richiesta.id,
      });

    if (errorePrenotazione) {
      console.error("Errore prenotazione push:", errorePrenotazione.message);

      return NextResponse.json(
        { error: "Impossibile preparare l'invio della notifica" },
        { status: 500 },
      );
    }

    if (!richiestaPrenotata) {
      return NextResponse.json({
        success: true,
        message: "Richiesta già elaborata",
      });
    }

    // Configura il servizio per inviare notifiche push
    configuraWebPush();

    // Controlla che ci siano dispositivi registrati
    if (!dispositivi || dispositivi.length === 0) {
      console.log("Nessun dispositivo registrato per le notifiche");

      const { error: erroreRipristino } = await supabase
        .from("help_requests")
        .update({
          push_status: "pending",
          push_processing_at: null,
        })
        .eq("id", richiesta.id)
        .eq("push_status", "processing");

      if (erroreRipristino) {
        console.error("Errore ripristino richiesta:", erroreRipristino.message);

        return NextResponse.json(
          { error: "Impossibile ripristinare la richiesta" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        message: "Nessun dispositivo registrato",
      });
    }

    // Invia la notifica a tutti i dispositivi registrati
    const risultatiInvio = await Promise.allSettled(
      dispositivi.map((dispositivo) =>
        webpush.sendNotification(
          dispositivo.subscription as webpush.PushSubscription,
          messaggioPush,
        ),
      ),
    );

    // Conta le notifiche inviate correttamente
    const notificheInviate = risultatiInvio.filter(
      (risultato) => risultato.status === "fulfilled",
    ).length;

    console.log(
      `Notifiche inviate: ${notificheInviate} su ${dispositivi.length}`,
    );

    // Individua le registrazioni push non più valide
    const dispositiviScaduti = risultatiInvio.flatMap((risultato, indice) => {
      if (risultato.status !== "rejected") {
        return [];
      }

      const errore = risultato.reason as { statusCode?: number };

      if (errore.statusCode === 404 || errore.statusCode === 410) {
        return [dispositivi[indice].id];
      }

      console.error(
        "Errore invio push al dispositivo:",
        dispositivi[indice].id,
        "Codice:",
        errore.statusCode ?? "sconosciuto",
      );

      return [];
    });

    console.log("Registrazioni push scadute:", dispositiviScaduti.length);

    // Elimina dal database le registrazioni push scadute
    if (dispositiviScaduti.length > 0) {
      const { error: erroreEliminazione } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", dispositiviScaduti);

      if (erroreEliminazione) {
        console.error(
          "Errore eliminazione dispositivi scaduti:",
          erroreEliminazione.message,
        );
      } else {
        console.log(
          "Registrazioni push scadute eliminate:",
          dispositiviScaduti.length,
        );
      }
    }

    // Registra l'invio se almeno un servizio push ha accettato la notifica
    if (notificheInviate > 0) {
      const { error: erroreAggiornamento } = await supabase
        .from("help_requests")
        .update({
          push_status: "sent",
          push_sent_at: new Date().toISOString(),
          push_processing_at: null,
        })

        .eq("id", richiesta.id)
        .eq("push_status", "processing");

      if (erroreAggiornamento) {
        console.error(
          "Errore aggiornamento stato push:",
          erroreAggiornamento.message,
        );

        return NextResponse.json(
          { error: "Impossibile registrare l'invio delle notifiche" },
          { status: 500 },
        );
      }

      console.log("Notifica registrata come inviata");
    }

    // Se tutte le notifiche falliscono, consenti un nuovo tentativo
    if (notificheInviate === 0) {
      console.error("Invio fallito su tutti i dispositivi");

      const { error: erroreRipristino } = await supabase
        .from("help_requests")
        .update({
          push_status: "pending",
          push_processing_at: null,
        })

        .eq("id", richiesta.id)
        .eq("push_status", "processing");

      if (erroreRipristino) {
        console.error(
          "Errore ripristino stato push:",
          erroreRipristino.message,
        );

        return NextResponse.json(
          { error: "Impossibile ripristinare lo stato della notifica" },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { error: "Invio delle notifiche non riuscito" },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Webhook ricevuto correttamente",
    });
  } catch (error) {
    console.error("Errore webhook HELP ME:", error);

    return NextResponse.json(
      { error: "Errore durante la gestione del webhook" },
      { status: 500 },
    );
  }
}
