import pg from 'pg';
import { logger } from '../logger.js';
import {
  NOTIFICATION_CREATED_CHANNEL,
  NOTIFICATION_READ_CHANNEL,
} from '../notifications/channels.js';
import { toNotificationDto } from '../notifications/notification-dto.js';

/** NOTIFY payload → message gửi qua WebSocket: { userId, message } hoặc null nếu bỏ qua. */
export function toSocketMessage(channel, row) {
  if (channel === NOTIFICATION_CREATED_CHANNEL) {
    return {
      userId: row.recipient_id,
      message: { type: 'notification.created', data: toNotificationDto(row) },
    };
  }
  if (channel === NOTIFICATION_READ_CHANNEL) {
    return row.all
      ? { userId: row.recipientId, message: { type: 'notification.read_all', data: { readAt: row.readAt } } }
      : { userId: row.recipientId, message: { type: 'notification.read', data: { ids: row.ids } } };
  }
  return null;
}

/**
 * LISTEN các kênh notification_created / notification_read rồi đẩy tới socket của người nhận trên
 * instance này. Chạy nhiều instance thì mỗi instance đều nhận và chỉ gửi cho socket của mình, nên
 * không cần Redis Pub/Sub.
 *
 * Phải dùng một pg.Client riêng: kết nối trong Pool bị trả về/đổi liên tục nên sẽ mất LISTEN.
 * Mất kết nối thì tự kết nối lại; thông báo phát ra trong lúc mất kết nối client sẽ lấy lại qua REST.
 */
export function startPgListener({ connectionString, registry, reconnectDelayMs = 2000 }) {
  let client = null;
  let listening = false;
  let stopped = false;
  let reconnectTimer = null;

  function scheduleReconnect() {
    listening = false;
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelayMs);
  }

  function onNotification(msg) {
    if (!msg.payload) return;
    let row;
    try {
      row = JSON.parse(msg.payload);
    } catch (err) {
      logger.error({ err, channel: msg.channel }, 'Payload NOTIFY không phải JSON');
      return;
    }
    const out = toSocketMessage(msg.channel, row);
    if (out) registry.sendToUser(out.userId, out.message);
  }

  function dropClient(current) {
    current.end().catch(() => {});
    if (client === current) client = null;
    scheduleReconnect();
  }

  async function connect() {
    const current = new pg.Client({ connectionString });
    client = current;
    current.on('notification', onNotification);
    current.on('error', (err) => {
      logger.warn({ err: err.message }, 'Mất kết nối LISTEN Postgres, sẽ kết nối lại');
      dropClient(current);
    });
    // Postgres đóng kết nối mà không báo lỗi (restart, bị terminate) cũng phải kết nối lại
    current.on('end', () => {
      if (client === current) client = null;
      scheduleReconnect();
    });
    try {
      await current.connect();
      await current.query(`LISTEN ${NOTIFICATION_CREATED_CHANNEL}`);
      await current.query(`LISTEN ${NOTIFICATION_READ_CHANNEL}`);
      if (client === current) listening = true;
      logger.info(
        { channels: [NOTIFICATION_CREATED_CHANNEL, NOTIFICATION_READ_CHANNEL] },
        'Đang LISTEN Postgres',
      );
    } catch (err) {
      logger.warn({ err: err.message }, 'Không LISTEN được Postgres, sẽ thử lại');
      dropClient(current);
    }
  }

  connect();

  return {
    isListening: () => listening,
    async stop() {
      stopped = true;
      listening = false;
      clearTimeout(reconnectTimer);
      if (client) await client.end().catch(() => {});
    },
  };
}
