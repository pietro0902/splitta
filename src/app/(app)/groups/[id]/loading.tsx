// Opening a group runs five queries, one of which reads every expense, every
// split and every payer in it. Without a loading file the browser sits on the
// previous screen for that whole round trip and the tap reads as ignored.
//
// The skeleton mirrors the real layout -- header, hero surface, tab row,
// hairline rows -- so nothing jumps when the data lands. That means carrying
// the page's `lg` shape too: above the breakpoint the real page is a 6xl
// container split into an expense column and a balances column, and a skeleton
// stuck at `max-w-2xl` would have everything slide sideways on arrival, which
// is the one thing it exists to prevent.
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Caricamento del gruppo">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-3 sm:px-5 lg:max-w-6xl lg:px-8">
          <div className="size-9 shrink-0 lg:hidden" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-5 lg:max-w-6xl lg:px-8">
        <div className="mb-5 rounded-2xl border border-border bg-raised p-5">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-8 w-40 animate-pulse rounded bg-muted" />
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-7">
          <div className="min-w-0">
            <div className="flex gap-2">
              {[64, 56, 72, 52, 56].map((w, i) => (
                <div
                  key={i}
                  // The two side tabs move into the column on the right above
                  // `lg`, and their pills go with them.
                  className={`h-9 animate-pulse rounded-full bg-muted ${
                    i === 1 || i === 2 ? "lg:hidden" : ""
                  }`}
                  style={{ width: w }}
                />
              ))}
            </div>

            <div className="mt-6 divide-y divide-hairline">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <div className="size-[29px] shrink-0 animate-pulse rounded-[9px] bg-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
                    <div className="mt-1.5 h-3 w-1/3 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="mt-3 divide-y divide-hairline">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <div className="size-[29px] shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-14 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
