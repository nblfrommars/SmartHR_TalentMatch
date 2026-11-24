import { Kafka, logLevel, Partitioners } from 'kafkajs';
import { config } from '../config.js';

export const DLQ_SUFFIX = '.DLQ';
// Header thêm vào message khi đẩy vào DLQ / khi đẩy lại từ DLQ
export const DLQ_ERROR_HEADER = 'x-dlq-error';
export const DLQ_OFFSET_HEADER = 'x-dlq-original-offset';
export const DLQ_REPLAY_HEADER = 'x-dlq-replay-count';

export function createKafka(clientId = config.kafka.clientId) {
  return new Kafka({ clientId, brokers: config.kafka.brokers, logLevel: logLevel.WARN });
}

/** DefaultPartitioner băm key bằng murmur2 giống producer Java: cùng key vào cùng partition như topic gốc. */
export function createProducer(kafka) {
  return kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
}

/**
 * Lag của consumer group theo partition = offset cuối của partition - offset group đã commit.
 * Partition group chưa commit lần nào thì tính từ offset nhỏ nhất còn giữ.
 */
export async function fetchConsumerLag(admin, groupId, topics) {
  const committed = await admin.fetchOffsets({ groupId, topics });
  const result = [];
  for (const { topic, partitions } of committed) {
    const ends = await admin.fetchTopicOffsets(topic);
    const committedByPartition = new Map(partitions.map((p) => [p.partition, Number(p.offset)]));
    for (const { partition, high, low } of ends) {
      const done = committedByPartition.get(partition) ?? -1;
      const from = done >= 0 ? done : Number(low);
      result.push({ topic, partition, lag: Math.max(0, Number(high) - from) });
    }
  }
  return result;
}
