import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export function createAudit(projectRoot) {
  const directory = path.join(projectRoot, "data");
  fs.mkdirSync(directory, { recursive: true });
  return (event) => {
    const day = new Date().toISOString().slice(0, 10);
    const safeEvent = {
      at: new Date().toISOString(), action: event.action, actor: event.actor, role: event.role,
      conversationId: String(event.conversationId || ""),
      messageLength: event.content ? String(event.content).length : undefined,
      messageHash: event.content ? createHash("sha256").update(String(event.content)).digest("hex") : undefined,
      assigneeId: event.assigneeId, result: event.result,
    };
    fs.appendFileSync(path.join(directory, `audit-${day}.jsonl`), `${JSON.stringify(safeEvent)}\n`, { mode: 0o600 });
  };
}

