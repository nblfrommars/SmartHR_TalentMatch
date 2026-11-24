import { WebSocketServer } from 'ws';
import { logger } from '../logger.js';

function rejectUpgrade(socket, status, reason) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * Gắn WebSocket vào HTTP server ở `path`.
 * Client kết nối: new WebSocket(`${url}?access_token=${token}`).
 * Server gửi: {"type":"notification.created","data":{...NotificationDto}}
 */
export function attachWebSocketServer(server, { path, heartbeatMs, verifyToken, registry }) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) return rejectUpgrade(socket, 404, 'Not Found');

    const token = url.searchParams.get('access_token');
    if (!token) return rejectUpgrade(socket, 401, 'Unauthorized');

    let userId;
    try {
      userId = await verifyToken(token);
    } catch (err) {
      logger.debug({ err: err.message }, 'Từ chối WebSocket: token không hợp lệ');
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      ws.isAlive = true;
      registry.add(userId, ws);
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      ws.on('close', () => registry.remove(userId, ws));
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
