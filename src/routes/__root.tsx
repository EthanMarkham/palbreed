import { Link, Outlet, createRootRoute, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import "../App.css";
import Seo from "../components/Seo";
import { breedingRepository } from "../data/breedingRepository";
import SyncSignIn from "../features/account/SyncSignIn";
import WorldImportDialog from "../features/inventory/WorldImportDialog";
import { useInventory } from "../services/inventory/useInventory";

const metadata = breedingRepository.metadata;

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  const brandMarkUrl = `${import.meta.env.BASE_URL}brand/palpath-mark-512.png`;
  const [hasHeaderBackdrop, setHasHeaderBackdrop] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const shouldReduceMotion = Boolean(useReducedMotion());

  useEffect(() => {
    const updateHeaderBackdrop = () => setHasHeaderBackdrop(window.scrollY > 8);

    updateHeaderBackdrop();
    window.addEventListener("scroll", updateHeaderBackdrop, { passive: true });
    return () => window.removeEventListener("scroll", updateHeaderBackdrop);
  }, []);

  return (
    <div className="site-frame">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className={`site-header${hasHeaderBackdrop ? " is-scrolled" : ""}`}>
        <Link className="brand" to="/" aria-label="Palpath home">
          <picture className="brand-logo-frame" aria-hidden="true">
            <img className="brand-logo" src={brandMarkUrl} width="512" height="384" alt="" />
          </picture>
          <span className="brand-name">PALPATH</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "is-active" }}>Inventory</Link>
          <Link to="/builder" activeProps={{ className: "is-active" }}>Builder</Link>
          <Link to="/tools" activeProps={{ className: "is-active" }}>Calculator</Link>
        </nav>
        <div className="header-actions">
          <WorldManager />
          <SyncSignIn />
          <span className="version-label">v{metadata.gameVersion}</span>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="route-stage"
          key={pathname}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.997 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, y: -5, scale: 0.998 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>

      <footer className="site-footer">
        <span>Unofficial Palworld utility</span>
        <Link to="/credits">Credits</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/legal">Legal</Link>
      </footer>

      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </div>
  );
}

function WorldManager() {
  const inventory = useInventory();
  return (
    <WorldImportDialog
      profiles={inventory.document.profiles}
      onImported={() => {}}
      trigger="header"
    />
  );
}

function NotFoundPage() {
  return (
    <>
      <Seo title="Page Not Found | Palpath" description="This Palpath page could not be found." noIndex />
      <main className="workspace feature-workspace">
        <section className="feature-card empty-state">
          <strong>We couldn't find that page</strong>
          <span>Use the navigation above to head back to Palpath.</span>
        </section>
      </main>
    </>
  );
}
