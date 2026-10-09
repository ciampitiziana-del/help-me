import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

export async function inviaNotificaAiuto(requestId: number) {
  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    throw new Error("ID richiesta non valido");
  }

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Configurazione Supabase mancante");
  }

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    throw new Error("Configurazione VAPID incompleta");
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey);

  const { data: richiesta, error: erroreRichiesta } = await supabase
    .from("help_requests")
    .select("id, status, requested_by, area, priority, push_sent_at")
    .eq("id", requestId)
    .single();

  if (erroreRichiesta || !richiesta) {
    throw new Error(`Richiesta ${requestId} non trovata`);
  }

  if (richiesta.status !== "waiting" || richiesta.push_sent_at) {
    return { success: true, message: "Richiesta già gestita" };
  }

  const { data: dispositivi, error: erroreDispositivi } = await supabase
    .from("push_subscriptions")
    .select("id, subscription");

  if (erroreDispositivi) {
    throw new Error(erroreDispositivi.message);
  }

  const { data: prenotata, error: errorePrenotazione } = await supabase.rpc(
    "claim_help_request_push",
    { p_request_id: requestId },
  );

  if (errorePrenotazione) {
    throw new Error(errorePrenotazione.message);
  }

  if (!prenotata) {
    return { success: true, message: "Richiesta già in elaborazione" };
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const ripristinaRichiesta = async () => {
    const { error } = await supabase
      .from("help_requests")
      .update({
        push_status: "pending",
        push_processing_at: null,
      })
      .eq("id", requestId)
      .eq("push_status", "processing");

    if (error) {
      throw new Error(`Ripristino non riuscito: ${error.message}`);
    }
  };

  if (!dispositivi?.length) {
    await ripristinaRichiesta();
    throw new Error("Nessun dispositivo registrato");
  }

  const messaggio = JSON.stringify({
    title: "HELP ME - Nuova richiesta",
    body: `${richiesta.requested_by || "Un collega"} chiede aiuto in ${richiesta.area}. Priorità: ${richiesta.priority}.`,
    url: "/requests",
  });

  const risultati = await Promise.allSettled(
    dispositivi.map((dispositivo) =>
      webpush.sendNotification(
        dispositivo.subscription as webpush.PushSubscription,
        messaggio,
      ),
    ),
  );

  const notificheInviate = risultati.filter(
    (risultato) => risultato.status === "fulfilled",
  ).length;

  const dispositiviScaduti = risultati.flatMap((risultato, indice) => {
    if (risultato.status !== "rejected") return [];

    const errore = risultato.reason as { statusCode?: number };

    if (errore.statusCode === 404 || errore.statusCode === 410) {
      return [dispositivi[indice].id];
    }

    console.error(
      `Errore push dispositivo ${dispositivi[indice].id}:`,
      errore.statusCode ?? "sconosciuto",
    );

    return [];
  });

  if (dispositiviScaduti.length > 0) {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", dispositiviScaduti);

    if (error) {
      console.error("Errore eliminazione dispositivi:", error.message);
    }
  }

  if (notificheInviate === 0) {
    await ripristinaRichiesta();
    throw new Error("Invio fallito su tutti i dispositivi");
  }

  const { error: erroreAggiornamento } = await supabase
    .from("help_requests")
    .update({
      push_status: "sent",
      push_sent_at: new Date().toISOString(),
      push_processing_at: null,
    })
    .eq("id", requestId)
    .eq("push_status", "processing");

  if (erroreAggiornamento) {
    throw new Error(erroreAggiornamento.message);
  }

  return {
    success: true,
    message: "Notifica inviata",
    notificheInviate,
  };
}
