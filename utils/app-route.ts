const normalizeRoute = (route?: string) =>
  (route || "").split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";

const isWithinRoute = (route: string, root: string) =>
  route === root || route.startsWith(`${root}/`);

export const isAdminRoute = (pathname?: string, asPath?: string) =>
  [pathname, asPath]
    .map(normalizeRoute)
    .some((route) => isWithinRoute(route, "/admin"));
