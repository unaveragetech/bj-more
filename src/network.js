let socket = null;
let eventHandler = null;
let reconnectTimer = null;
let pendingAvatar = null;

export function normalizeWebSocketUrl(url) {
  const pasted = String(url || "").trim();
  const matched = pasted.match(/(?:wss?|https?):\/\/[^\s"'<>]+/i);
  const trimmed = (matched ? matched[0] : pasted).replace(/[),.;]+$/, "");
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    parsed.hash = "";
    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
      return parsed.toString();
    }
    if (parsed.protocol === "http:") {
      parsed.protocol = "ws:";
      return parsed.toString();
    }
    if (parsed.protocol === "https:") {
      parsed.protocol = "wss:";
      return parsed.toString();
    }
  } catch (error) {
    if (trimmed.startsWith("https://")) return `wss://${trimmed.slice(8)}`;
    if (trimmed.startsWith("http://")) return `ws://${trimmed.slice(7)}`;
    if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) return trimmed;
  }
  return `wss://${trimmed}`;
}

export function validateServerUrl(url) {
  const wsUrl = normalizeWebSocketUrl(url);
  if (!wsUrl) return { ok: false, message: "Server URL is required.", wsUrl: "" };
  try {
    const parsed = new URL(wsUrl);
    if (!["ws:", "wss:"].includes(parsed.protocol)) {
      return { ok: false, message: "Use a WebSocket server URL, not a regular web page URL.", wsUrl };
    }
    if ((parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") && parsed.port === "8701") {
      return { ok: false, message: "That is the client app port. Multiplayer needs the backend server on ws://localhost:9000.", wsUrl };
    }
    return { ok: true, message: "", wsUrl };
  } catch (error) {
    return { ok: false, message: "Server URL is not valid. Paste ws://localhost:9000 or the ngrok https:// URL for the backend server.", wsUrl };
  }
}

function safeSend(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('WebSocket not open, cannot send', message);
    return;
  }
  const payload = JSON.stringify(message);
  console.debug('client send', payload);
  socket.send(payload);
}

export function initNetwork(onEvent) {
  eventHandler = onEvent;
}

export function connectServer(url, username, avatar) {
  disconnectServer();
  if (!url || !username) {
    eventHandler?.({ type: "error", message: "Server URL and username are required." });
    return;
  }

  pendingAvatar = avatar || null;
  const validation = validateServerUrl(url);
  if (!validation.ok) {
    eventHandler?.({ type: "error", message: validation.message });
    return;
  }
  const wsUrl = validation.wsUrl;
  socket = new WebSocket(wsUrl);
  socket.addEventListener("open", () => {
    eventHandler?.({ type: "status", status: "connected", message: "Socket opened." });
    safeSend({ type: "join", username });
    if (pendingAvatar) safeSend({ type: "avatar", avatar: pendingAvatar });
  });

  socket.addEventListener("message", (event) => {
    console.debug('client recv', event.data);
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      console.error('client parse error', error, event.data);
      eventHandler?.({ type: "error", message: "Invalid server response." });
      return;
    }
    try {
      eventHandler?.(payload);
    } catch (error) {
      console.error('client handler error', error, payload);
    }
  });

  socket.addEventListener("close", () => {
    eventHandler?.({ type: "disconnected", message: "Server connection closed." });
    socket = null;
  });

  socket.addEventListener("error", (error) => {
    eventHandler?.({ type: "error", message: `WebSocket error connecting to ${wsUrl}. Make sure the backend server/ngrok tunnel points to port 9000, not the client on 8701.` });
  });
}

export function disconnectServer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  eventHandler?.({ type: "disconnected", message: "Disconnected from server." });
}

export function createRoom(name) {
  safeSend({ type: "create_room", name });
}

export function joinRoom(roomId) {
  safeSend({ type: "join_room", roomId });
}

export function leaveRoom() {
  safeSend({ type: "leave_room" });
}

export function sendNetworkBet(amount) {
  safeSend({ type: "bet", amount });
}

export function sendNetworkAction(action) {
  safeSend({ type: "action", action });
}

export function sendNetworkChat(message) {
  safeSend({ type: "chat", message });
}

export function sendNetworkAvatar(avatar) {
  pendingAvatar = avatar;
  safeSend({ type: "avatar", avatar });
}

export function sendSlotEnter(state) {
  safeSend({ type: "slot_enter", ...(state || {}) });
}

export function sendSlotState(state) {
  safeSend({ type: "slot_state", ...(state || {}) });
}

export function sendSlotLeave() {
  safeSend({ type: "slot_leave" });
}

export function isSocketOpen() {
  return socket && socket.readyState === WebSocket.OPEN;
}
