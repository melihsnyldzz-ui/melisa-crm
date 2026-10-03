import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath = path.join(projectRoot, ".env")) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function integer(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

export function getConfig(env = process.env) {
  loadEnvFile();
  return {
    projectRoot,
    host: env.CRM_HOST || "0.0.0.0",
    port: integer(env.CRM_PORT, 4200),
    chatwootBaseUrl: String(env.CHATWOOT_BASE_URL || "").replace(/\/+$/, ""),
    chatwootAccountId: integer(env.CHATWOOT_ACCOUNT_ID, 0),
    chatwootInboxId: integer(env.CHATWOOT_INBOX_ID, 0),
    chatwootToken: String(env.CHATWOOT_API_TOKEN || ""),
    managerAccessKey: String(env.CRM_MANAGER_ACCESS_KEY || ""),
    ownerAccessKey: String(env.CRM_OWNER_ACCESS_KEY || ""),
    liveSendEnabled: boolean(env.CRM_LIVE_SEND_ENABLED),
    assignmentEnabled: boolean(env.CRM_ASSIGNMENT_ENABLED),
    allowedOrigins: String(env.CRM_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
    requestTimeoutMs: integer(env.CRM_REQUEST_TIMEOUT_MS, 15000),
  };
}

export function validateConfig(config) {
  const errors = [];
  if (!/^https?:\/\//.test(config.chatwootBaseUrl)) errors.push("CHATWOOT_BASE_URL geçerli bir http/https adresi olmalı.");
  if (!config.chatwootAccountId) errors.push("CHATWOOT_ACCOUNT_ID zorunlu.");
  if (!config.chatwootToken) errors.push("CHATWOOT_API_TOKEN zorunlu.");
  if (config.managerAccessKey.length < 16) errors.push("CRM_MANAGER_ACCESS_KEY en az 16 karakter olmalı.");
  if (config.ownerAccessKey.length < 16) errors.push("CRM_OWNER_ACCESS_KEY en az 16 karakter olmalı.");
  if (config.managerAccessKey && config.managerAccessKey === config.ownerAccessKey) errors.push("Müdür ve Patron erişim anahtarları farklı olmalı.");
  return errors;
}

