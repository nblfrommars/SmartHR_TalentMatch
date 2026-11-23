package com.hr.user.cv.event;

import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hr.user.cv.entity.JobApplicationOutbox;
import com.hr.user.cv.repository.JobApplicationOutboxRepository;
import com.smarthr.common.CorrelationIdFilter;
import com.smarthr.common.event.EventEnvelope;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class JobApplicationEventPublisher {

    private static final String PRODUCER = "user-service";

    private final JobApplicationOutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(JobApplicationEventType type, UUID applicationId, Object data) {
        EventEnvelope<Object> envelope = EventEnvelope.of(type.getValue(), PRODUCER,
                MDC.get(CorrelationIdFilter.MDC_KEY), data);
        try {
            JobApplicationOutbox outbox = new JobApplicationOutbox();
            outbox.setEventType(type.getValue());
            outbox.setAggregateId(applicationId);
            outbox.setPayload(objectMapper.writeValueAsString(envelope));
            outboxRepository.save(outbox);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize " + type.getValue() + " event", ex);
        }
    }
}
