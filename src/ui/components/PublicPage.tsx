import Link from "next/link";
import type { ReactNode } from "react";

export function PublicPage({ children }: { children: ReactNode }) {
  return <main className="public-page"><div className="public-content">
    {children}
  </div></main>;
}

export function LandingPage() {
  return <PublicPage>
    <nav className="public-links" aria-label="Project links">
      <a href="https://www.lukemolony.com">by luke</a>
      <a href="https://github.com/LMol-4/freewrite-web">repo</a>
      <a href="https://github.com/farzaa/freewrite">fork of</a>
    </nav>
    <h1>hi, this is freewrite.</h1>
    <p className="public-description">it&apos;s an upgraded web port i made for myself.</p>
    <p className="public-description">one simple, clean place to write continuously for a set time without distraction — think through a new idea, write your next script, reflect on an event, whatever.</p>
    <p className="public-description">syncs across devices.<br />open-source.<br />upgraded features. free. enjoy.</p>
    <Link scroll={false} className="public-button" href="/continue">continue to app</Link>
  </PublicPage>;
}
