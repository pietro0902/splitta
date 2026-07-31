"use client";

import "./globals.css";

// The last resort: an error thrown by the root layout itself replaces the whole
// document, so this file has to ship its own <html> and <body> and cannot rely
// on anything the layout sets up -- including the theme class, which is why it
// commits to the dark ground rather than reading a token that may not resolve.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.25rem",
          background: "#0B0E14",
          color: "#DCE3EE",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: "22rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 500, margin: 0 }}>
            Splitta non è riuscita ad avviarsi
          </h1>
          <p style={{ margin: "0.5rem 0 1.5rem", fontSize: "0.875rem", color: "#7C8798" }}>
            Riprova. Se continua, riapri l&apos;app tra qualche minuto.
          </p>
          <button
            onClick={reset}
            style={{
              height: "3rem",
              width: "100%",
              borderRadius: "999px",
              border: 0,
              background: "#5EE6E6",
              color: "#04252B",
              fontSize: "0.9375rem",
              fontWeight: 500,
            }}
          >
            Riprova
          </button>
          {error.digest && (
            <p style={{ marginTop: "1rem", fontSize: "0.6875rem", color: "#7C8798" }}>
              codice: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
