export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/live/")) {
      return proxyLiveCrm(request, env, url);
    }

    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    // Fetch the root asset directly: /index.html may redirect to / and erase
    // the requested app route (for example /mobile-preview) in the browser.
    indexUrl.pathname = "/";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};

const ALLOWED_LIVE_PATHS = ["/health", "/auth/", "/crm/"];

function isAllowedLivePath(pathname) {
  return ALLOWED_LIVE_PATHS.some((allowed) => allowed.endsWith("/") ? pathname.startsWith(allowed) : pathname === allowed);
}

async function proxyLiveCrm(request, env, sourceUrl) {
  const baseUrl = String(env.CRM_API_BASE_URL || "").replace(/\/+$/, "");
  const upstreamPath = sourceUrl.pathname.slice("/api/live".length) || "/";
  if (!baseUrl) return Response.json({ error: "Canlı CRM bağlantısı yapılandırılmamış." }, { status: 503 });
  if (!isAllowedLivePath(upstreamPath)) return Response.json({ error: "CRM uç noktası izinli değil." }, { status: 404 });
  const catalogAuth = ["/crm/catalog/auth/sign-in", "/crm/catalog/auth/sign-out"].includes(upstreamPath);
  const catalogUiOrigin = "https://melisa-crm-ozel-tasarim-testi.melihsnyldzz.chatgpt.site";
  if (catalogAuth && (request.method !== "POST" || sourceUrl.origin !== catalogUiOrigin || request.headers.get("origin") !== catalogUiOrigin)) {
    return Response.json({ error: "CATALOG_SAME_UI_ORIGIN_REQUIRED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }


  const target = new URL(baseUrl + upstreamPath);
  target.search = sourceUrl.search;
  const headers = new Headers({ Accept: "application/json" });
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  if (authorization) headers.set("Authorization", authorization);
  if (contentType) headers.set("Content-Type", contentType);
  if (catalogAuth) headers.set("Origin", catalogUiOrigin);

  const init = { method: request.method, headers, redirect: "manual" };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();

  try {
    const upstreamFetch = env.CRM_API_FETCH || fetch;
    const upstream = await upstreamFetch(new Request(target, init));
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.delete("set-cookie");
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return Response.json({ error: "Canlı CRM servisine ulaşılamadı." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
