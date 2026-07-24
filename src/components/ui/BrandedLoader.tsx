/*
 * Full-page loading state used as the Suspense fallback while a route's chunk
 * downloads: the logo breathing over the app canvas, so slow connections see
 * the product, not a blank flash.
 */
export function BrandedLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white">
      <img src="/logo-mark.jpeg" alt="" className="h-14 w-14 animate-pulse rounded-2xl object-cover shadow-card" />
      <div className="flex items-center gap-1.5" aria-label="Loading">
        {[0, 150, 300].map(delay => (
          <span key={delay}
            className="h-2 w-2 animate-bounce rounded-full bg-navy/60"
            style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );
}
