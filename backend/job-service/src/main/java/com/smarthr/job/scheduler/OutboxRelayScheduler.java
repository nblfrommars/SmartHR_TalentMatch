package com.smarthr.job.scheduler;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.smarthr.job.event.JobEventType;
import com.smarthr.job.model.entity.Outbox;
import com.smarthr.job.repo.OutboxRepo;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxRelayScheduler {

    private static final long SEND_TIMEOUT_SECONDS = 5;

    private final OutboxRepo outboxRepo;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${app.outbox.batch-size:50}")
    private int batchSize;

    @Value("${app.outbox.retention-days:7}")
    private int retentionDays;

    @Scheduled(fixedDelay = 2000)
    @Transactional
    public void processOutboxEvents() {
        List<Outbox> batch = outboxRepo.lockUnpublished(batchSize);
        if (batch.isEmpty()) {
            return;
        }

        List<CompletableFuture<SendResult<String, String>>> sends = new ArrayList<>(batch.size());
        for (Outbox event : batch) {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                    JobEventType.TOPIC, event.getAggregateId().toString(), event.getPayload());
            record.headers().add("event-type", event.getEventType().getBytes(StandardCharsets.UTF_8));
            sends.add(kafkaTemplate.send(record));
        }

        for (int i = 0; i < batch.size(); i++) {
            Outbox event = batch.get(i);
            try {
                sends.get(i).get(SEND_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                event.setPublished(true);
            } catch (Exception e) {
                if (e instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                log.error("Failed to publish outbox event {} ({}); will retry", event.getId(), event.getEventType(), e);
                break;
            }
        }
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgePublishedEvents() {
        int deleted = outboxRepo.deletePublishedBefore(OffsetDateTime.now().minusDays(retentionDays));
        if (deleted > 0) {
            log.info("Purged {} published outbox row(s)", deleted);
        }
    }
}
