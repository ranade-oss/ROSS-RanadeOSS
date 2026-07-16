import { SiteShell } from "./site-shell";

export default function NotFound() {
  return <SiteShell><main id="main-content" className="center-page"><p className="eyebrow">404</p><h1>That page is not in the source map.</h1><p>The route may not exist yet, or it may have moved during development.</p><a className="button primary" href="/">Return home</a></main></SiteShell>;
}
