// hash 路由：#/ 首页，#/event/:id 事件详情
import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'event'; id: string };

export function parseHash(hash: string): Route {
  const m = /^#\/event\/([^/?#]+)/.exec(hash);
  if (m) {
    try {
      return { name: 'event', id: decodeURIComponent(m[1]) };
    } catch {
      return { name: 'home' };
    }
  }
  return { name: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function eventHref(id: string): string {
  return `#/event/${encodeURIComponent(id)}`;
}

export function goEvent(id: string): void {
  window.location.hash = `/event/${encodeURIComponent(id)}`;
}

export function goHome(): void {
  window.location.hash = '/';
}
