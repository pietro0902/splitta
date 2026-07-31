"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";

// Every page here is `force-dynamic` and reads D1 on each request, so a failure
// is a real possibility rather than a formality: the binding can be missing,
// the query can throw, a server action can reject. Without this file all of
// those land on Next's default error page, which offers no way to retry.
//
// `reset()` re-renders the segment, which on a dynamic page means the query
// runs again -- so a transient failure costs a tap rather than a reload.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack, which is
    // deliberately not sent to the browser. It shows up in `wrangler tail`.
    console.error("Splitta:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm rounded-[22px] border border-border bg-raised p-6 text-center">
        <h1 className="text-lg font-medium">Qualcosa è andato storto</h1>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
          Non sono riuscito a caricare questa pagina. I dati sono al sicuro: riprova.
        </p>

        <button
          onClick={reset}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <RotateCw className="size-4" />
          Riprova
        </button>
        <Link
          href="/"
          className="mt-2 flex h-11 w-full items-center justify-center rounded-full text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Torna ai tuoi gruppi
        </Link>

        {error.digest && (
          <p className="mt-4 text-[11px] text-muted-foreground/70">
            codice: <span className="figure">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
