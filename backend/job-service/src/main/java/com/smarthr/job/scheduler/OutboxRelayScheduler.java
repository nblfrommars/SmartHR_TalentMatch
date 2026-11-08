package com.smarthr.job.scheduler;

import java.util.List;
import java.util.concurrent.TimeUnit;

import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.smarthr.job.model.entity.Outbox;
import com.smarthr.job.repo.OutboxRepo;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxRelayScheduler {

    private static final String TOPIC_JOB_EVENTS = "job.events";

    private final OutboxRepo outboxRepo;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Scheduled(fixedDelay = 2000)
    @Transactional
    public void processOutboxEvents() {
        List<Outbox> unpublishedEvents = outboxRepo.findUnpublished(PageRequest.of(0, 50));

        for (Outbox event : unpublishedEvents) {
            try {
                kafkaTemplate.send(TOPIC_JOB_EVENTS, event.getAggregateId().toString(), event.getPayload())
                        .get(5, TimeUnit.SECONDS);

                event.setPublished(true);
                outboxRepo.save(event);
            } catch (Exception e) {
                log.error("Failed to publish outbox event: {}", event.getId(), e);
                break;
            }
        }
    }
}