"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <html lang="en"><body><main className="center-page"><p className="eyebrow">Something went wrong</p><h1>The public site could not render this page.</h1><p>No application or client data is loaded by this site.</p><button className="button primary" onClick={() => reset()}>Try again</button></main></body></html>;
}
