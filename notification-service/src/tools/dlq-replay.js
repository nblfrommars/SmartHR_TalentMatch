/**
 * Đẩy lại message từ <topic>.DLQ về topic gốc, sau khi đã sửa nguyên nhân lỗi.
 *
 *   npm run dlq:replay -- --topic job.application.events --dry-run   # chỉ liệt kê
 *   npm run dlq:replay -- --topic job.application.events             # đẩy lại tất cả
 *   npm run dlq:replay -- --topic job.events --limit 10              # đẩy lại tối đa 10 message
 *
 * - Chỉ đẩy các message đang có trong DLQ lúc bắt đầu chạy (message vào DLQ trong lúc chạy để lần sau).
 * - Dùng consumer group riêng `<KAFKA_GROUP_ID>-dlq-replay`: đẩy xong message nào thì commit message đó,
 *   chạy lại không đẩy trùng. --dry-run không commit gì.
 * - Giữ nguyên key, value, header gốc; bỏ header x-dlq-*, thêm x-dlq-replay-count (đếm số lần đã đẩy lại).
 * - Đẩy lại an toàn: thông báo chống trùng theo eventId, nên message đã xử lý một phần cũng không tạo trùng.
 */
import { parseArgs } from 'node:util';
import { config } from '../config.js';
import {
  createKafka,
  createProducer,
  DLQ_ERROR_HEADER,
  DLQ_REPLAY_HEADER,
  DLQ_SUFFIX,
} from '../kafka/client.js';
import { HANDLERS } from '../kafka/consumer.js';

/** Header gốc để đẩy lại: bỏ header x-dlq-* (trừ bộ đếm), tăng bộ đếm số lần đẩy lại. */
export function replayHeaders(headers = {}) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!name.startsWith('x-dlq-')) out[name] = value;
  }
  const previous = Number(headers[DLQ_REPLAY_HEADER]?.toString() ?? 0) || 0;
  out[DLQ_REPLAY_HEADER] = String(previous + 1);
  return out;
}

function describe(message) {
  let summary = '';
  try {
    const env = JSON.parse(message.value?.toString('utf8') ?? '');
    summary = `eventId=${env.eventId} type=${env.type}`;
  } catch {
    summary = 'value không phải JSON';
  }
  const error = message.headers?.[DLQ_ERROR_HEADER]?.toString() ?? '';
  return `offset=${message.offset} key=${message.key?.toString() ?? ''} ${summary} | lỗi: ${error}`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      topic: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
    },
  });
  const topic = values.topic;
  if (!topic || !(topic in HANDLERS)) {
    console.error(`Cần --topic là một trong: ${Object.keys(HANDLERS).join(', ')}`);
    process.exit(2);
  }
  const limit = values.limit === undefined ? Infinity : Number(values.limit);
  if (!(limit > 0)) {
    console.error('--limit phải là số dương');
    process.exit(2);
  }
  const dryRun = values['dry-run'];
  const dlqTopic = `${topic}${DLQ_SUFFIX}`;
  const groupId = `${config.kafka.groupId}-dlq-replay`;

  const kafka = createKafka(`${config.kafka.clientId}-dlq-replay`);
  const admin = kafka.admin();
  await admin.connect();

  // Mốc dừng: offset cuối của từng partition lúc bắt đầu, so với offset group đã commit
  let ends;
  try {
    ends = await admin.fetchTopicOffsets(dlqTopic);
  } catch (err) {
    console.log(`Không đọc được ${dlqTopic} (${err.message}): DLQ chưa có message nào.`);
    await admin.disconnect();
    return;
  }
  const [committed] = await admin.fetchOffsets({ groupId, topics: [dlqTopic] });
  const committedByPartition = new Map(committed.partitions.map((p) => [p.partition, Number(p.offset)]));
  const pending = new Map(); // partition -> offset cuối cần đọc (high - 1)
  let total = 0;
  for (const { partition, high, low } of ends) {
    const start = Math.max(committedByPartition.get(partition) ?? -1, Number(low));
    const count = Number(high) - start;
    if (count > 0) {
      pending.set(partition, Number(high) - 1);
      total += count;
    }
  }
  await admin.disconnect();
  if (total === 0) {
    console.log(`${dlqTopic}: không có message nào cần đẩy lại.`);
    return;
  }
  console.log(`${dlqTopic}: ${total} message chưa đẩy lại${dryRun ? ' (dry-run, không đẩy, không commit)' : ''}.`);

  const producer = createProducer(kafka);
  const consumer = kafka.consumer({ groupId });
  if (!dryRun) await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: dlqTopic, fromBeginning: true });

  let processed = 0;
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ partition, message }) => {
      const last = pending.get(partition);
      if (last === undefined || processed >= limit) return;
      const offset = Number(message.offset);
      if (offset > last) return;

      console.log(`${dryRun ? '[dry-run] ' : ''}p${partition} ${describe(message)}`);
      if (!dryRun) {
        await producer.send({
          topic,
          messages: [{ key: message.key, value: message.value, headers: replayHeaders(message.headers) }],
        });
        await consumer.commitOffsets([{ topic: dlqTopic, partition, offset: String(offset + 1) }]);
      }
      processed++;
      if (offset >= last) pending.delete(partition);
      if (pending.size === 0 || processed >= limit) finish();
    },
  });

  await finished;
  await consumer.disconnect();
  if (!dryRun) await producer.disconnect();
  console.log(dryRun ? `Sẽ đẩy lại ${processed} message.` : `Đã đẩy lại ${processed} message về ${topic}.`);
}

// Chỉ chạy khi gọi trực tiếp (test import replayHeaders thì không chạy)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
