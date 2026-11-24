import { setTimeout as sleep } from 'node:timers/promises';
import { Kafka, logLevel, Partitioners } from 'kafkajs';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { parseEnvelope, PoisonMessageError } from './envelope.js';
import { APPLICATION_EVENTS_TOPIC, handleApplicationEvent } from './handlers/application-events.js';
import { handleJobEvent, JOB_EVENTS_TOPIC } from './handlers/job-events.js';

const HANDLERS = {
  [JOB_EVENTS_TOPIC]: handleJobEvent,
  [APPLICATION_EVENTS_TOPIC]: handleApplicationEvent,
};

/**
 * Xử lý một message: thử lại theo retryBackoffMs, hết lượt (hoặc gặp poison message) thì đẩy
 * vào <topic>.DLQ rồi đi tiếp, để một message lỗi không chặn cả partition.
 * Tách riêng khỏi kafkajs để test được.
 */
export async function processMessage({ pool, topic, message, heartbeat, sendToDlq, backoffMs }) {
  const handler = HANDLERS[topic];
  let log = logger.child({ topic, offset: message.offset });

  let envelope;
  try {
    envelope = parseEnvelope(message.value);
  } catch (err) {
    log.error({ err }, 'Message không hợp lệ, đẩy vào DLQ');
    await sendToDlq(topic, message, err);
    return 'dlq';
  }
  log = log.child({ correlationId: envelope.correlationId ?? undefined });

  for (let attempt = 0; ; attempt++) {
    try {
      const handled = await handler(pool, envelope);
      log.debug({ eventId: envelope.eventId, type: envelope.type, handled }, 'Đã xử lý event');
      return handled ? 'handled' : 'ignored';
    } catch (err) {
      if (err instanceof PoisonMessageError || attempt >= backoffMs.length) {
        log.error({ err, eventId: envelope.eventId, type: envelope.type, attempt }, 'Xử lý event thất bại, đẩy vào DLQ');
        await sendToDlq(topic, message, err);
        return 'dlq';
      }
      log.warn({ err: err.message, eventId: envelope.eventId, attempt }, 'Xử lý event lỗi, sẽ thử lại');
      await sleep(backoffMs[attempt]);
      await heartbeat();
    }
  }
}

export async function startConsumer(pool) {
  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    logLevel: logLevel.WARN,
  });
  const consumer = kafka.consumer({ groupId: config.kafka.groupId });
  // DefaultPartitioner băm key bằng murmur2 giống producer Java, key DLQ giữ đúng partition như topic gốc
  const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });

  async function sendToDlq(topic, message, err) {
    await producer.send({
      topic: `${topic}.DLQ`,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: {
            ...message.headers,
            'x-dlq-error': String(err?.message ?? err).slice(0, 1000),
            'x-dlq-original-offset': message.offset,
          },
        },
      ],
    });
  }

  // kafkajs tự khởi động lại khi gặp lỗi tạm thời (restart=true). Lỗi không thể khởi động lại thì
  // consumer dừng mà process vẫn sống, service "chạy" nhưng không nhận event nữa: thoát để Docker
  // (restart: unless-stopped) dựng lại.
  let healthy = false;
  consumer.on(consumer.events.GROUP_JOIN, () => {
    healthy = true;
  });
  consumer.on(consumer.events.CRASH, ({ payload }) => {
    healthy = false;
    if (payload.restart) {
      logger.warn({ err: payload.error?.message }, 'Kafka consumer crash, kafkajs sẽ tự khởi động lại');
      return;
    }
    logger.fatal({ err: payload.error }, 'Kafka consumer crash không tự khởi động lại được, thoát process');
    process.exit(1);
  });
  consumer.on(consumer.events.DISCONNECT, () => {
    healthy = false;
  });

  await producer.connect();
  await consumer.connect();
  // fromBeginning: lần đầu chạy phải đọc lại toàn bộ job.events để dựng đủ job_snapshots
  await consumer.subscribe({ topics: Object.keys(HANDLERS), fromBeginning: true });
  await consumer.run({
    eachMessage: ({ topic, message, heartbeat }) =>
      processMessage({ pool, topic, message, heartbeat, sendToDlq, backoffMs: config.kafka.retryBackoffMs }),
  });
  logger.info({ topics: Object.keys(HANDLERS) }, 'Kafka consumer đã chạy');

  return {
    isHealthy: () => healthy,
    async stop() {
      await consumer.disconnect();
      await producer.disconnect();
    },
  };
}
