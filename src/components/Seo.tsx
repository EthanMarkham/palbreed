import { useEffect } from "react";
import { canonicalUrl, INDEX_ROBOTS, SOCIAL_IMAGE_URL } from "../config/seo";

type SeoProps = {
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
};

export default function Seo({ title, description, path, noIndex = false }: SeoProps) {
  useEffect(() => {
    document.title = title;

    setMeta("name", "description", description);
    setMeta("name", "robots", noIndex
      ? "noindex, follow"
      : INDEX_ROBOTS);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", SOCIAL_IMAGE_URL);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", SOCIAL_IMAGE_URL);

    if (path && !noIndex) {
      const url = canonicalUrl(path);
      setMeta("property", "og:url", url);
      setCanonical(url);
    } else {
      document.querySelector('link[rel="canonical"]')?.remove();
      document.querySelector('meta[property="og:url"]')?.remove();
    }
  }, [description, noIndex, path, title]);

  return null;
}

function setMeta(attribute: "name" | "property", value: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, value);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}
