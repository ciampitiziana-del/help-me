import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
        <h1 className="mb-3 text-5xl font-extrabold text-blue-700">HELP ME</h1>

        <p className="mb-10 text-lg text-slate-600">Assistenza tra colleghi</p>

        <div className="flex flex-col gap-5">
          <Link
            href="/chiedi-aiuto"
            className="rounded-2xl bg-blue-700 px-6 py-6 text-xl font-bold text-white shadow-md transition hover:bg-blue-800"
          >
            CHIEDI AIUTO
          </Link>

          <Link
            href="/requests"
            className="rounded-2xl bg-green-600 px-6 py-6 text-xl font-bold text-white shadow-md transition hover:bg-green-700"
          >
            AIUTA UN COLLEGA
          </Link>
        </div>

        <p className="mt-10 text-sm text-slate-400">
          HELP ME - Assistenza Negozio
        </p>
      </div>
    </main>
  );
}
