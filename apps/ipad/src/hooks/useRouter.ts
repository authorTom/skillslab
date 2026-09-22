import { useState, useEffect, useLayoutEffect, useCallback } from "react";

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

// Scroll offsets of pages the user has navigated away from, keyed by hash.
// Hash navigation keeps the window's scroll position, so without this a skill
// opened from far down the list would open part-way down, and going back
// would lose the user's place in the list.
const savedScroll = new Map<string, number>();
let navigatingForward = false;

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

/** Scroll to `y`, retrying for a few frames while the page is still loading
 *  its content and is not yet tall enough to reach it. */
function restoreScroll(y: number) {
  let frames = 0;
  const attempt = () => {
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 1 && frames++ < 30) requestAnimationFrame(attempt);
  };
  attempt();
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useLayoutEffect(() => {
    const y = navigatingForward ? 0 : savedScroll.get(window.location.hash) ?? 0;
    navigatingForward = false;
    restoreScroll(y);
  }, [route]);

  const navigate = useCallback((path: string) => {
    savedScroll.set(window.location.hash, window.scrollY);
    navigatingForward = true;
    window.location.hash = path;
  }, []);

  const back = useCallback(() => {
    savedScroll.set(window.location.hash, window.scrollY);
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = "/";
    }
  }, []);

  return { ...route, navigate, back };
}
