import { useEffect } from "react";

const BASE_URL = "https://quikpik.app";

export function useCanonical(path: string) {
  useEffect(() => {
    const href = path.startsWith("http") ? path : `${BASE_URL}${path}`;

    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const wasCreated = !link;
    if (wasCreated) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    const prev = link!.getAttribute("href") ?? "";
    link!.setAttribute("href", href);

    return () => {
      if (wasCreated) {
        link?.remove();
      } else {
        link?.setAttribute("href", prev);
      }
    };
  }, [path]);
}

export function useNoIndex(active = true) {
  useEffect(() => {
    if (!active) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const wasCreated = !meta;
    const prev = meta?.getAttribute("content") ?? "";
    if (wasCreated) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta!.setAttribute("content", "noindex, nofollow");

    return () => {
      if (wasCreated) {
        meta?.remove();
      } else {
        meta?.setAttribute("content", prev);
      }
    };
  }, [active]);
}
