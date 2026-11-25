import { WebSocketServer } from 'ws';
import { logger } from '../logger.js';
import { wsAuthFailures } from '../metrics.js';

// Mã đóng kết nối riêng của ứng dụng (dải 4000-4999)
export const CLOSE_TOKEN_EXPIRED = 4001; // token hết hạn mà client chưa gửi token mới
export const CLOSE_AUTH_FAILED = 4401; // không xác thực được: token sai, quá hạn chờ, message đầu không phải auth

// Token Keycloak khoảng 1-2KB; giới hạn nhỏ để kết nối chưa xác thực không gửi được dữ liệu lớn
const MAX_PAYLOAD_BYTES = 16 * 1024;
// setTimeout chỉ nhận tối đa ~24,8 ngày
const MAX_TIMER_MS = 2 ** 31 - 1;

function rejectUpgrade(socket, status, reason) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function parseAuthMessage(raw, isBinary) {
  if (isBinary) return null;
  try {
    const msg = JSON.parse(raw.toString('utf8'));
    return msg?.type === 'auth' && typeof msg.token === 'string' && msg.token ? msg.token : null;
  } catch {
    return null;
  }
}

/**
 * Gắn WebSocket vào HTTP server ở `path`.
 *
 * Token KHÔNG đi trên URL (tránh lộ trong access log của gateway / proxy). Giống frame CONNECT của STOMP,
 * client gửi token bằng message đầu tiên sau khi mở kết nối:
 *   client: {"type":"auth","token":"<access token>"}
 *   server: {"type":"connected","data":{"expiresAt":"..."}}
 * Quá authTimeoutMs chưa gửi, token sai, hoặc message đầu không phải auth: đóng mã 4401.
 *
 * Đang kết nối mà gửi lại {"type":"auth","token":"<token mới>"} (cùng user) thì gia hạn:
 *   server: {"type":"auth.renewed","data":{"expiresAt":"..."}}
 * Token hết hạn mà chưa gia hạn: đóng mã 4001.
 *
 * Server đẩy: notification.created / notification.read / notification.read_all (xem README).
 */
export function attachWebSocketServer(
  server,
  { path, heartbeatMs, authTimeoutMs = 5000, allowedOrigins, verifyToken, registry },
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const origins = new Set(allowedOrigins);

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) return rejectUpgrade(socket, 404, 'Not Found');

    // Chống trang web lạ mở WebSocket tới service. Thiếu Origin nghĩa là client không phải trình duyệt
    // (không bị tấn công kiểu này), nên cho qua.
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      logger.warn({ origin }, 'Từ chối WebSocket: Origin không được phép');
      return rejectUpgrade(socket, 403, 'Forbidden');
    }

    wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws));
  });

  function handleConnection(ws) {
    let userId = null; // null = chưa xác thực
    let expiryTimer = null;
    let verifying = false;
    ws.isAlive = true;

    function failAuth(reason, closeReason) {
      wsAuthFailures.inc({ reason });
      ws.close(CLOSE_AUTH_FAILED, closeReason);
    }

    const authTimer = setTimeout(() => failAuth('timeout', 'Authentication timeout'), authTimeoutMs);

    function scheduleExpiry(expiresAt) {
      clearTimeout(expiryTimer);
      expiryTimer =
        expiresAt == null
          ? null
          : setTimeout(
              () => ws.close(CLOSE_TOKEN_EXPIRED, 'Token expired'),
              Math.min(MAX_TIMER_MS, Math.max(0, expiresAt - Date.now())),
            );
    }

    function send(message) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    }

    async function onMessage(raw, isBinary) {
      const token = parseAuthMessage(raw, isBinary);
      if (!token) {
        // Đã xác thực: client chỉ nhận, message khác bị bỏ qua. Chưa xác thực: phải là auth.
        if (userId === null) failAuth('bad_message', 'Expected auth message');
        return;
      }
      if (verifying) return; // đang verify token trước, bỏ qua message auth dồn dập
      verifying = true;
      let identity;
      try {
        identity = await verifyToken(token);
      } catch (err) {
        logger.debug({ err: err.message, userId }, 'WebSocket: token không hợp lệ');
        failAuth('invalid_token', 'Invalid token');
        return;
      } finally {
        verifying = false;
      }
      if (ws.readyState !== ws.OPEN) return;
      const expiresAt = identity.expiresAt == null ? null : new Date(identity.expiresAt).toISOString();

      if (userId === null) {
        clearTimeout(authTimer);
        userId = identity.userId;
        registry.add(userId, ws);
        scheduleExpiry(identity.expiresAt);
        send({ type: 'connected', data: { expiresAt } });
        return;
      }
      // Gia hạn chỉ được bằng token của chính user đó, không cho đổi người trên kết nối đang mở
      if (identity.userId !== userId) {
        logger.warn({ userId }, 'WebSocket: gia hạn bằng token của user khác');
        failAuth('user_mismatch', 'Token belongs to another user');
        return;
      }
      scheduleExpiry(identity.expiresAt);
      send({ type: 'auth.renewed', data: { expiresAt } });
    }

    ws.on('message', (raw, isBinary) => {
      onMessage(raw, isBinary).catch((err) => logger.error({ err }, 'Lỗi xử lý message WebSocket'));
    });
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      clearTimeout(expiryTimer);
      if (userId !== null) registry.remove(userId, ws);
    });
    // Lỗi socket (vd message vượt maxPayload): ws tự đóng kết nối, chỉ cần ghi log
    ws.on('error', (err) => logger.debug({ err: err.message, userId }, 'Lỗi socket'));
  }

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
