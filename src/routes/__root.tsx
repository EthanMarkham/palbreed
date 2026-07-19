import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "../App.css";
import { breedingRepository } from "../data/breedingRepository";

const metadata = breedingRepository.metadata;

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  const brandMarkUrl = `${import.meta.env.BASE_URL}brand/palpath-mark-512.png`;

  return (
    <div className="site-frame">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <Link className="brand" to="/" aria-label="Palpath home">
          <picture className="brand-logo-frame" aria-hidden="true">
            <img className="brand-logo" src={brandMarkUrl} width="512" height="384" alt="" />
          </picture>
          <span className="brand-name">PALPATH</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "is-active" }}>Inventory</Link>
          <Link to="/builder" activeProps={{ className: "is-active" }}>Builder</Link>
          <Link to="/tools" activeProps={{ className: "is-active" }}>Tools</Link>
          <Link to="/account" activeProps={{ className: "is-active" }}>Account</Link>
        </nav>
        <span className="version-label">v{metadata.gameVersion}</span>
      </header>

      <Outlet />

      <footer className="site-footer">
        <span>Unofficial Palworld utility</span>
        <Link to="/privacy">Privacy</Link>
        <Link to="/legal">Legal</Link>
      </footer>

      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </div>
  );
}

function NotFoundPage() {
  return (
    <main className="workspace feature-workspace">
      <section className="feature-card empty-state">
        <strong>We couldn't find that page</strong>
        <span>Use the navigation above to head back to Palpath.</span>
      </section>
    </main>
  );
}
