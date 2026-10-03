import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ChatwootClient, ChatwootError } from "./chatwoot.mjs";
import { getConfig, validateConfig } from "./config.mjs";
import { createAudit } from "./audit.mjs";
import { normalizeConversation, normalizeInbox, normalizeMessage } from "./normalize.mjs";
import { authenticate, createRateLimiter } from "./security.mjs";

const config = getConfig();
const errors = validateConfig(config);
if (errors.length) {
  process.stderr.write(`Melisa CRM Gateway başlamadı:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

const chatwoot = new ChatwootClient(config);
const audit = createAudit(config.projectRoot);
const allowWrite = createRateLimiter({ limit: 20, windowMs: 60_000 });
const publicDir = path.join(config.projectRoot, "dist", "client");

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(body));
}

function clientIp(request) { return String(request.socket.remoteAddress || "unknown"); }

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error("İstek çok büyük."), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Geçersiz JSON."), { status: 400 }); }
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  if (!origin || !config.allowedOrigins.length || config.allowedOrigins.includes(origin)) return origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
  return null;
}

function staticFile(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(publicDir, requested);
  if (!target.startsWith(publicDir) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return false;
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2" };
  response.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
  fs.createReadStream(target).pipe(response);
  return true;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const cors = corsHeaders(request);
  if (cors === null) return json(response, 403, { error: "Bu tarayıcı kaynağına izin verilmedi." });
  if (request.method === "OPTIONS") {
    response.writeHead(204, { ...cors, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
    return response.end();
  }

  if (url.pathname === "/health") return json(response, 200, { status: "ok", service: "melisa-crm-gateway", chatwootAccountId: config.chatwootAccountId, liveSendEnabled: config.liveSendEnabled, assignmentEnabled: config.assignmentEnabled }, cors);
  if (!url.pathname.startsWith("/api/")) {
    if (staticFile(response, url.pathname)) return;
    if (fs.existsSync(path.join(publicDir, "index.html"))) return staticFile(response, "/");
    return json(response, 404, { error: "Arayüz build edilmemiş." }, cors);
  }

  const actor = authenticate(request, config);
  if (!actor) return json(response, 401, { error: "Geçersiz CRM erişim anahtarı." }, cors);

  try {
    if (request.method === "GET" && url.pathname === "/api/session") {
      return json(response, 200, { role: actor.role, displayName: actor.displayName, liveSendEnabled: config.liveSendEnabled, assignmentEnabled: config.assignmentEnabled }, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/crm/inbox") {
      const raw = await chatwoot.listConversations({
        status: url.searchParams.get("status") || "open", assigneeType: url.searchParams.get("assignee_type") || "all",
        page: Number(url.searchParams.get("page") || 1), query: url.searchParams.get("q") || "",
      });
      return json(response, 200, normalizeInbox(raw), cors);
    }
    if (request.method === "GET" && url.pathname === "/api/crm/agents") {
      const raw = await chatwoot.agents();
      const items = Array.isArray(raw) ? raw : raw?.payload || raw?.data || [];
      return json(response, 200, { agents: items.map((item) => ({ id: item.id, name: item.name || item.available_name, role: item.role, availability: item.availability_status || item.availability })) }, cors);
    }

    const detailMatch = url.pathname.match(/^\/api\/crm\/conversations\/(\d+)$/);
    if (request.method === "GET" && detailMatch) {
      const raw = await chatwoot.conversation(detailMatch[1]);
      return json(response, 200, { conversation: normalizeConversation(raw, true) }, cors);
    }

    const sendMatch = url.pathname.match(/^\/api\/crm\/conversations\/(\d+)\/messages$/);
    if (request.method === "POST" && sendMatch) {
      if (!config.liveSendEnabled) return json(response, 423, { error: "Canlı mesaj gönderimi sunucuda kapalı." }, cors);
      if (!allowWrite(`${clientIp(request)}:send`)) return json(response, 429, { error: "Çok fazla gönderim denemesi." }, cors);
      const body = await readJson(request);
      const content = String(body.content || "").trim();
      if (body.approved !== true) return json(response, 400, { error: "Mesaj insan onayı olmadan gönderilemez." }, cors);
      if (!content || content.length > 4096) return json(response, 400, { error: "Mesaj 1–4096 karakter arasında olmalı." }, cors);
      try {
        const raw = await chatwoot.sendText(sendMatch[1], content);
        audit({ action: "message.send", actor: actor.displayName, role: actor.role, conversationId: sendMatch[1], content, result: "success" });
        return json(response, 200, { message: normalizeMessage(raw) }, cors);
      } catch (error) {
        audit({ action: "message.send", actor: actor.displayName, role: actor.role, conversationId: sendMatch[1], content, result: "failed" });
        throw error;
      }
    }

    const assignMatch = url.pathname.match(/^\/api\/crm\/conversations\/(\d+)\/assign$/);
    if (request.method === "POST" && assignMatch) {
      if (!config.assignmentEnabled) return json(response, 423, { error: "Müşteri atama sunucuda kapalı." }, cors);
      if (!allowWrite(`${clientIp(request)}:assign`)) return json(response, 429, { error: "Çok fazla atama denemesi." }, cors);
      const body = await readJson(request);
      const assigneeId = Number(body.assigneeId);
      if (!Number.isInteger(assigneeId) || assigneeId <= 0) return json(response, 400, { error: "Geçerli personel seçilmedi." }, cors);
      const raw = await chatwoot.assign(assignMatch[1], assigneeId);
      audit({ action: "conversation.assign", actor: actor.displayName, role: actor.role, conversationId: assignMatch[1], assigneeId, result: "success" });
      return json(response, 200, { assignment: { id: raw?.id || assigneeId, name: raw?.name || raw?.available_name || "Atandı" } }, cors);
    }
    return json(response, 404, { error: "Uç nokta bulunamadı." }, cors);
  } catch (error) {
    const status = error instanceof ChatwootError ? (error.status >= 400 && error.status < 600 ? error.status : 502) : (error.status || 500);
    return json(response, status, { error: error.message || "Beklenmeyen sunucu hatası." }, cors);
  }
});

server.listen(config.port, config.host, () => {
  process.stdout.write(`Melisa CRM Gateway http://${config.host}:${config.port} adresinde hazır.\n`);
});

