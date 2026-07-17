import { useEffect, useRef } from "react";

type AdPlacement = "results-inline";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID;
const slotIds: Record<AdPlacement, string | undefined> = {
  "results-inline": import.meta.env.VITE_ADSENSE_RESULTS_SLOT,
};

function loadAdSense(client: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>('script[data-ad-provider="adsense"]');
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    script.crossOrigin = "anonymous";
    script.dataset.adProvider = "adsense";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load advertising provider."));
    document.head.append(script);
  });
}

/**
 * A single, post-result placement. It renders only when production configuration
 * is complete, preventing blank boxes or development traffic from reaching AdSense.
 */
export default function AdSlot({ placement }: { placement: AdPlacement }) {
  const ref = useRef<HTMLModElement>(null);
  const slotId = slotIds[placement];

  useEffect(() => {
    if (!clientId || !slotId || !ref.current) return;
    let cancelled = false;
    loadAdSense(clientId)
      .then(() => {
        if (!cancelled) (window.adsbygoogle = window.adsbygoogle || []).push({});
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [slotId]);

  if (!clientId || !slotId) return null;
  return (
    <aside className="ad-slot" aria-label="Advertisement" data-placement={placement}>
      <span>Advertisement</span>
      <ins ref={ref} className="adsbygoogle" style={{ display: "block" }} data-ad-client={clientId} data-ad-slot={slotId} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
