import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushRateLimit } from "../../../lib/ratelimit";

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    const { success } = await pushRateLimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Troppe richieste. Riprova tra un minuto." },
        { status: 429 },
      );
    }
    const body = await request.text();

    if (body.length > 10000) {
      return NextResponse.json(
        { error: "Richiesta troppo grande" },
        { status: 413 },
      );
    }

    const subscription = JSON.parse(body);

    if (subscription && typeof subscription.endpoint === "string") {
      try {
        const endpointUrl = new URL(subscription.endpoint);

        if (endpointUrl.protocol !== "https:") {
          return NextResponse.json(
            { error: "Endpoint non valido" },
            { status: 400 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Endpoint non valido" },
          { status: 400 },
        );
      }
    }

    if (
      !subscription ||
      typeof subscription.endpoint !== "string" ||
      !subscription.endpoint.startsWith("https://") ||
      !subscription.keys ||
      typeof subscription.keys.p256dh !== "string" ||
      typeof subscription.keys.auth !== "string"
    ) {
      return NextResponse.json(
        { error: "Registrazione non valida" },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !secretKey) {
      return NextResponse.json(
        { error: "Configurazione server incompleta" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, secretKey);

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        endpoint: subscription.endpoint,
        subscription,
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      console.error("Errore registrazione push:", error.message);

      return NextResponse.json(
        { error: "Impossibile registrare il dispositivo" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Dispositivo registrato",
    });
  } catch {
    return NextResponse.json(
      { error: "Richiesta non valida" },
      { status: 400 },
    );
  }
}
