import { DurableObject } from "cloudflare:workers";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, app: "Gaming.Chat" });
    if (url.pathname.startsWith("/api/") || url.pathname === "/ws") {
      const id = env.CHAT_DB.idFromName("gaming-chat-main");
      return env.CHAT_DB.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class ChatService extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      salt TEXT NOT NULL, created_at INTEGER NOT NULL
    )`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
    )`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
    )`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") return this.connectWebSocket(request, url);
    if (request.method === "POST" && url.pathname === "/api/register") return this.register(request);
    if (request.method === "POST" && url.pathname === "/api/login") return this.login(request);
    if (url.pathname === "/api/me" && request.method === "GET") {
      const user = await this.authorize(request);
      return user ? json({ ok: true, user: { id: user.id, username: user.username } }) : json({ error: "لطفاً دوباره وارد شوید." }, 401);
    }
    if (url.pathname === "/api/messages" && request.method === "GET") {
      const user = await this.authorize(request);
      if (!user) return json({ error: "لطفاً وارد شوید." }, 401);
      const peer = (url.searchParams.get("with") || "").trim();
      if (!/^\d{8}$/.test(peer)) return json({ error: "شناسه باید ۸ رقمی باشد." }, 400);
      const rows = this.ctx.storage.sql.exec(
        `SELECT id, sender_id AS senderId, recipient_id AS recipientId, body, created_at AS createdAt
         FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
         ORDER BY id DESC LIMIT 100`, user.id, peer, peer, user.id
      ).toArray().reverse();
      return json({ messages: rows });
    }
    return json({ error: "مسیر پیدا نشد." }, 404);
  }

  async register(request) {
    let data;
    try { data = await request.json(); } catch { return json({ error: "اطلاعات نامعتبر است." }, 400); }
    const username = String(data.username || "").trim();
    const password = String(data.password || "");
    if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(username)) return json({ error: "نام کاربری باید ۳ تا ۲۴ حرف یا عدد باشد." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "رمز عبور باید حداقل ۸ کاراکتر باشد." }, 400);
    if (this.ctx.storage.sql.exec("SELECT id FROM users WHERE username = ? COLLATE NOCASE", username).toArray().length) {
      return json({ error: "این نام کاربری قبلاً ثبت شده است." }, 409);
    }
    let id;
    for (let i = 0; i < 12; i++) {
      const candidate = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000000).padStart(8, "0");
      if (!this.ctx.storage.sql.exec("SELECT id FROM users WHERE id = ?", candidate).toArray().length) { id = candidate; break; }
    }
    if (!id) return json({ error: "ساخت شناسه ممکن نشد؛ دوباره تلاش کن." }, 500);
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash = await hashPassword(password, salt);
    this.ctx.storage.sql.exec("INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)", id, username, passwordHash, salt, Date.now());
    const token = await this.createSession(id);
    return json({ ok: true, token, user: { id, username } }, 201);
  }

  async login(request) {
    let data;
    try { data = await request.json(); } catch { return json({ error: "اطلاعات نامعتبر است." }, 400); }
    const username = String(data.username || "").trim();
    const password = String(data.password || "");
    const rows = this.ctx.storage.sql.exec("SELECT id, username, password_hash, salt FROM users WHERE username = ? COLLATE NOCASE", username).toArray();
    if (!rows.length) return json({ error: "نام کاربری یا رمز عبور اشتباه است." }, 401);
    const user = rows[0];
    const candidate = await hashPassword(password, user.salt);
    if (!constantTimeEqual(candidate, user.password_hash)) return json({ error: "نام کاربری یا رمز عبور اشتباه است." }, 401);
    const token = await this.createSession(user.id);
    return json({ ok: true, token, user: { id: user.id, username: user.username } });
  }

  async createSession(userId) {
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
    this.ctx.storage.sql.exec("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", token, userId, expires);
    return token;
  }

  async authorize(request) {
    const header = request.headers.get("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return null;
    const rows = this.ctx.storage.sql.exec(
      `SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > ?`, token, Date.now()
    ).toArray();
    return rows[0] || null;
  }

  async connectWebSocket(request, url) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket لازم است." }, 426);
    const token = url.searchParams.get("token") || "";
    const peer = url.searchParams.get("with") || "";
    if (!/^\d{8}$/.test(peer)) return json({ error: "شناسهٔ مقصد باید ۸ رقمی باشد." }, 400);
    const rows = this.ctx.storage.sql.exec(
      `SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > ?`, token, Date.now()
    ).toArray();
    if (!rows.length) return json({ error: "نشست معتبر نیست؛ دوباره وارد شوید." }, 401);
    if (!this.ctx.storage.sql.exec("SELECT id FROM users WHERE id = ?", peer).toArray().length) return json({ error: "کاربری با این شناسه پیدا نشد." }, 404);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: rows[0].id, peerId: peer });
    server.send(JSON.stringify({ type: "ready", userId: rows[0].id, peerId: peer }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    let data;
    try { data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)); } catch { return; }
    if (data.type !== "message") return;
    const attachment = ws.deserializeAttachment();
    const body = String(data.body || "").trim();
    if (!attachment || !body || body.length > 2000) {
      try { ws.send(JSON.stringify({ type: "error", error: "پیام باید بین ۱ تا ۲۰۰۰ کاراکتر باشد." })); } catch {}
      return;
    }
    const exists = this.ctx.storage.sql.exec("SELECT id FROM users WHERE id = ?", attachment.peerId).toArray().length;
    if (!exists) return;
    const createdAt = Date.now();
    const result = this.ctx.storage.sql.exec(
      "INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)",
      attachment.userId, attachment.peerId, body, createdAt
    );
    const payload = JSON.stringify({ type: "message", message: {
      id: Number(result.lastRowId), senderId: attachment.userId, recipientId: attachment.peerId, body, createdAt
    }});
    for (const socket of this.ctx.getWebSockets()) {
      const a = socket.deserializeAttachment();
      if (!a) continue;
      const sameConversation = (a.userId === attachment.userId && a.peerId === attachment.peerId) ||
        (a.userId === attachment.peerId && a.peerId === attachment.userId);
      if (sameConversation) { try { socket.send(payload); } catch {} }
    }
  }

  async webSocketClose(ws) { try { ws.close(); } catch {} }
  async webSocketError(ws) { try { ws.close(1011, "connection error"); } catch {} }
}

async function hashPassword(password, saltHex) {
  const salt = fromHex(saltHex);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256);
  return toHex(new Uint8Array(bits));
}
function toHex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
function fromHex(hex) { return new Uint8Array((hex.match(/.{1,2}/g) || []).map(v => parseInt(v, 16))); }
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
