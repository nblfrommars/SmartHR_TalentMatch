package com.smarthr.job.event;

import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthr.common.CorrelationIdFilter;
import com.smarthr.common.event.EventEnvelope;
import com.smarthr.job.model.entity.Outbox;
import com.smarthr.job.repo.OutboxRepo;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class OutboxPublisher {

    public static final String PRODUCER = "job-service";

    private final OutboxRepo outboxRepo;
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(JobEventType type, UUID aggregateId, Object data) {
        EventEnvelope<Object> envelope = EventEnvelope.of(type.getValue(), PRODUCER,
                MDC.get(CorrelationIdFilter.MDC_KEY), data);
        try {
            outboxRepo.save(Outbox.builder()
                    .eventType(type.getValue())
                    .aggregateId(aggregateId)
                    .payload(objectMapper.writeValueAsString(envelope))
                    .build());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize " + type.getValue() + " event", e);
        }
    }
}
