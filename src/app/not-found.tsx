import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

// Reached far more often than a mistyped URL: `requireAccess` calls notFound()
// for a group this browser may not see, deliberately, so that walking
// /groups/1, /groups/2, ... cannot tell a group that exists from one that does
// not. Without this file that lands on Next's grey default, in English, with no
// way back -- which reads like the app is broken rather than like a door that
// is simply not yours.
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-2.5 px-5 py-4">
        <BrandMark size={26} className="text-primary" />
        <span className="text-[17px] font-medium tracking-[-0.02em]">Splitta</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm rounded-[22px] border border-border bg-raised p-6 text-center">
          <h1 className="text-lg font-medium">Qui non c&apos;è niente</h1>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
            La pagina non esiste, oppure è un gruppo di cui non fai parte. Per entrare in un
            gruppo serve il suo link d&apos;invito.
          </p>
          <Link
            href="/"
            className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-primary text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Torna ai tuoi gruppi
          </Link>
        </div>
      </main>
    </div>
  );
}
