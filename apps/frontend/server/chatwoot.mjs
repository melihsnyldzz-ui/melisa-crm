export class ChatwootError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = "ChatwootError";
    this.status = status;
    this.details = details;
  }
}

export class ChatwootClient {
  constructor(config, fetchImpl = fetch) {
    this.baseUrl = config.chatwootBaseUrl;
    this.accountId = config.chatwootAccountId;
    this.inboxId = config.chatwootInboxId;
    this.token = config.chatwootToken;
    this.timeoutMs = config.requestTimeoutMs;
    this.fetch = fetchImpl;
  }

  async request(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Accept: "application/json", "Content-Type": "application/json", api_access_token: this.token },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { throw new ChatwootError("Chatwoot okunamayan bir yanıt döndürdü.", response.status); }
      if (!response.ok) {
        const message = payload?.message || payload?.error || payload?.description || `Chatwoot HTTP ${response.status}`;
        throw new ChatwootError(String(message), response.status, payload);
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw new ChatwootError("Chatwoot zaman aşımına uğradı.", 504);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  listConversations({ status = "open", assigneeType = "all", page = 1, query = "" } = {}) {
    const params = new URLSearchParams({ status, assignee_type: assigneeType, page: String(page) });
    if (this.inboxId) params.set("inbox_id", String(this.inboxId));
    if (query) params.set("q", query);
    return this.request(`/api/v1/accounts/${this.accountId}/conversations?${params}`);
  }

  conversation(conversationId) { return this.request(`/api/v1/accounts/${this.accountId}/conversations/${conversationId}`); }

  sendText(conversationId, content) {
    return this.request(`/api/v1/accounts/${this.accountId}/conversations/${conversationId}/messages`, {
      method: "POST",
      body: { content, message_type: "outgoing", private: false, content_type: "text" },
    });
  }

  assign(conversationId, assigneeId) {
    return this.request(`/api/v1/accounts/${this.accountId}/conversations/${conversationId}/assignments`, {
      method: "POST",
      body: { assignee_id: assigneeId },
    });
  }

  agents() { return this.request(`/api/v1/accounts/${this.accountId}/agents`); }
}

