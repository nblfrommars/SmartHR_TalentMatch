import pg from 'pg';
import { logger } from '../logger.js';
import { toNotificationDto } from '../notifications/notification-dto.js';

export const NOTIFICATION_CHANNEL = 'notification_created';

/**
 * LISTEN kênh notification_created (trigger trên bảng notifications phát ra) rồi đẩy tới socket
 * của người nhận trên instance này. Chạy nhiều instance thì mỗi instance đều nhận và chỉ gửi cho
 * socket của mình, nên không cần Redis Pub/Sub.
 *
 * Phải dùng một pg.Client riêng: kết nối trong Pool bị trả về/đổi liên tục nên sẽ mất LISTEN.
 * Mất kết nối thì tự kết nối lại; thông báo phát ra trong lúc mất kết nối client sẽ lấy lại qua REST.
 */
export function startPgListener({ connectionString, registry, reconnectDelayMs = 2000 }) {
  let client = null;
  let stopped = false;
  let reconnectTimer = null;

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelayMs);
  }

  function onNotification(msg) {
    if (msg.channel !== NOTIFICATION_CHANNEL || !msg.payload) return;
    let row;
    try {
      row = JSON.parse(msg.payload);
    } catch (err) {
      logger.error({ err }, 'Payload NOTIFY không phải JSON');
      return;
    }
    registry.sendToUser(row.recipient_id, {
      type: 'notification.created',
      data: toNotificationDto(row),
    });
  }

  async function connect() {
    const current = new pg.Client({ connectionString });
    client = current;
    current.on('notification', onNotification);
    current.on('error', (err) => {
      logger.warn({ err: err.message }, 'Mất kết nối LISTEN Postgres, sẽ kết nối lại');
      current.end().catch(() => {});
      if (client === current) client = null;
      scheduleReconnect();
    });
    // Postgres đóng kết nối mà không báo lỗi (restart, bị terminate) cũng phải kết nối lại
    current.on('end', () => {
      if (client === current) client = null;
      scheduleReconnect();
    });
    try {
      await current.connect();
      await current.query(`LISTEN ${NOTIFICATION_CHANNEL}`);
      logger.info({ channel: NOTIFICATION_CHANNEL }, 'Đang LISTEN Postgres');
    } catch (err) {
      logger.warn({ err: err.message }, 'Không LISTEN được Postgres, sẽ thử lại');
      current.end().catch(() => {});
      if (client === current) client = null;
      scheduleReconnect();
    }
  }

  connect();

  return async function stop() {
    stopped = true;
    clearTimeout(reconnectTimer);
    if (client) await client.end().catch(() => {});
  };
}
