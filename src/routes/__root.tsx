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
  return (
    <div className="site-frame">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <Link className="brand" to="/" aria-label="Palpath home">
          <span className="brand-mark">PP</span>
          <span className="brand-name">PALPATH</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "is-active" }}>Planner</Link>
          <Link to="/pair" activeProps={{ className: "is-active" }}>Pair</Link>
          <Link to="/inventory" activeProps={{ className: "is-active" }}>Inventory</Link>
          <Link to="/builder" activeProps={{ className: "is-active" }}>Builder</Link>
        </nav>
        <span className="version-label">v{metadata.gameVersion}</span>
      </header>

      <Outlet />

      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </div>
  );
}

function NotFoundPage() {
  return (
    <main className="workspace">
      <section className="route-stage route-status is-warning">
        <div>
          <h2>Page not found</h2>
          <p>The route you requested does not exist.</p>
        </div>
      </section>
    </main>
  );
}
