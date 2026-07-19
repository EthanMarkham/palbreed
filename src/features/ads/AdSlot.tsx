import { useEffect, useRef, useState } from "react";
import { runtimeConfig } from "../../config/runtimeConfig";

type AdPlacement = "builder" | "tools";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

let scriptPromise: Promise<void> | undefined;

export default function AdSlot({ placement }: { placement: AdPlacement }) {
  const configuration = runtimeConfig.adsense;
  const requested = useRef(false);
  const [failed, setFailed] = useState(false);
  const slotId = placement === "builder" ? configuration?.builderSlot : configuration?.toolsSlot;

  useEffect(() => {
    if (!configuration || !slotId || import.meta.env.DEV || requested.current) return;
    requested.current = true;
    void loadAdSense(configuration.publisherId)
      .then(() => {
        window.adsbygoogle = window.adsbygoogle ?? [];
        window.adsbygoogle.push({});
      })
      .catch(() => setFailed(true));
  }, [configuration, slotId]);

  if (!configuration || !slotId || failed || import.meta.env.DEV) return null;

  return (
    <aside className="ad-placement" aria-label="Advertisement">
      <span>Advertisement</span>
      <ins
        className="adsbygoogle"
        data-ad-client={configuration.publisherId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}

function loadAdSense(publisherId: string) {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-palpath-adsense]");
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("AdSense failed to load.")), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.palpathAdsense = "true";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("AdSense failed to load.")), { once: true });
    document.head.append(script);
  });
  return scriptPromise;
}
