import WebSocket from 'ws';

/** userId → các socket đang mở của user đó trên instance này (nhiều tab / nhiều thiết bị). */
export class ConnectionRegistry {
  #byUser = new Map();

  add(userId, socket) {
    let sockets = this.#byUser.get(userId);
    if (!sockets) {
      sockets = new Set();
      this.#byUser.set(userId, sockets);
    }
    sockets.add(socket);
  }

  remove(userId, socket) {
    const sockets = this.#byUser.get(userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.#byUser.delete(userId);
  }

  /** Gửi tới mọi socket của user trên instance này. Trả về số socket đã gửi. */
  sendToUser(userId, message) {
    const sockets = this.#byUser.get(userId);
    if (!sockets) return 0;
    const payload = JSON.stringify(message);
    let sent = 0;
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
        sent++;
      }
    }
    return sent;
  }

  get userCount() {
    return this.#byUser.size;
  }

  get socketCount() {
    let total = 0;
    for (const sockets of this.#byUser.values()) total += sockets.size;
    return total;
  }
}
