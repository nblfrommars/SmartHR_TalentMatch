package com.hr.user.cv.event;

import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hr.user.cv.entity.CVProfileOutbox;
import com.hr.user.cv.repository.CVProfileOutboxRepository;
import com.smarthr.common.CorrelationIdFilter;
import com.smarthr.common.event.EventEnvelope;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class CVProfileEventPublisher {

    private static final String PRODUCER = "user-service";

    private final CVProfileOutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(CVProfileEventType type, UUID userId, Object data) {
        EventEnvelope<Object> envelope = EventEnvelope.of(type.getValue(), PRODUCER,
                MDC.get(CorrelationIdFilter.MDC_KEY), data);
        try {
            CVProfileOutbox outbox = new CVProfileOutbox();
            outbox.setEventType(type.getValue());
            outbox.setAggregateId(userId);
            outbox.setPayload(objectMapper.writeValueAsString(envelope));
            outboxRepository.save(outbox);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize " + type.getValue() + " event", ex);
        }
    }
}
