import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { inviaNotificaAiuto } from "@/lib/sendHelpPush";

export const runtime = "nodejs";

function verificaWebhook(request: Request): boolean {
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

    if (
      !["INSERT", "RETRY"].includes(payload.type) ||
      payload.table !== "help_requests" ||
      payload.schema !== "public" ||
      !Number.isSafeInteger(payload.record?.id) ||
      payload.record.id <= 0
    ) {
      return NextResponse.json(
        { error: "Evento non valido" },
        { status: 400 },
      );
    }

    const risultato = await inviaNotificaAiuto(payload.record.id);

    return NextResponse.json(risultato);
  } catch (error) {
    console.error("Errore invio push HELP ME:", error);

    return NextResponse.json(
      { error: "Invio della notifica non riuscito" },
      { status: 503 },
    );
  }
}