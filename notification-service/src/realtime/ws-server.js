import { WebSocketServer } from 'ws';
import { logger } from '../logger.js';

// Mã đóng kết nối riêng của ứng dụng (dải 4000-4999). FE nhận 4001 thì lấy token mới rồi kết nối lại.
export const CLOSE_TOKEN_EXPIRED = 4001;

function rejectUpgrade(socket, status, reason) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * Gắn WebSocket vào HTTP server ở `path`.
 * Client kết nối: new WebSocket(`${url}?access_token=${token}`).
 * Server gửi:
 *   {"type":"connected"}
 *   {"type":"notification.created","data":{...NotificationDto}}
 *   {"type":"notification.read","data":{"ids":[...]}}       (tab khác vừa đánh dấu đã đọc)
 *   {"type":"notification.read_all","data":{"readAt":"..."}}
 * Token hết hạn thì server đóng với mã 4001.
 */
export function attachWebSocketServer(server, { path, heartbeatMs, allowedOrigins, verifyToken, registry }) {
  const wss = new WebSocketServer({ noServer: true });
  const origins = new Set(allowedOrigins);

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) return rejectUpgrade(socket, 404, 'Not Found');

    // Chống trang web lạ mở WebSocket bằng token của người dùng. Thiếu Origin nghĩa là client
    // không phải trình duyệt (không bị tấn công kiểu này), nên cho qua.
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      logger.warn({ origin }, 'Từ chối WebSocket: Origin không được phép');
      return rejectUpgrade(socket, 403, 'Forbidden');
    }

    const token = url.searchParams.get('access_token');
    if (!token) return rejectUpgrade(socket, 401, 'Unauthorized');

    let identity;
    try {
      identity = await verifyToken(token);
    } catch (err) {
      logger.debug({ err: err.message }, 'Từ chối WebSocket: token không hợp lệ');
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }
    const { userId, expiresAt } = identity;

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      registry.add(userId, ws);

      // Hết hạn token thì đóng, để tài khoản bị khóa / đăng xuất không tiếp tục nhận thông báo
      const expiryTimer =
        expiresAt == null
          ? null
          : setTimeout(() => ws.close(CLOSE_TOKEN_EXPIRED, 'Token expired'), Math.max(0, expiresAt - Date.now()));

      ws.on('pong', () => {
        ws.isAlive = true;
      });
      ws.on('close', () => {
        clearTimeout(expiryTimer);
        registry.remove(userId, ws);
      });
      ws.on('error', (err) => logger.debug({ err: err.message, userId }, 'Lỗi socket'));
      // Client chỉ nhận; mọi thao tác (đánh dấu đã đọc...) đi qua REST
      ws.on('message', () => {});
      ws.send(JSON.stringify({ type: 'connected' }));
    });
  });

  // Ping định kỳ để phát hiện kết nối chết (mất mạng, đóng laptop) và dọn khỏi registry
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatMs);
  interval.unref();

  return {
    wss,
    async close() {
      clearInterval(interval);
      for (const ws of wss.clients) ws.close(1001, 'Server shutting down');
      await new Promise((resolve) => wss.close(resolve));
    },
  };
}
