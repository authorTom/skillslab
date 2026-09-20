import { useState, useEffect, useCallback } from "react";

export interface Route {
  page: "home" | "skill" | "settings" | "update";
  params: Record<string, string>;
}

function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "") || "";

  if (path === "settings") return { page: "settings", params: {} };
  if (path === "update") return { page: "update", params: {} };

  const skillMatch = path.match(/^skill\/(.+)$/);
  if (skillMatch) return { page: "skill", params: { slug: skillMatch[1] } };

  return { page: "home", params: {} };
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((path: string) => {
    window.location.hash = path;
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = "/";
    }
  }, []);

  return { ...route, navigate, back };
}
