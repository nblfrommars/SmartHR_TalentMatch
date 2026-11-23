package com.smarthr.common.event;

import java.time.OffsetDateTime;
import java.util.UUID;

public record EventEnvelope<T>(
        UUID eventId,
        String type,
        int version,
        OffsetDateTime occurredAt,
        String producer,
        String correlationId,
        T data) {

    public static final int CURRENT_VERSION = 1;

    public static <T> EventEnvelope<T> of(String type, String producer, String correlationId, T data) {
        return new EventEnvelope<>(UUID.randomUUID(), type, CURRENT_VERSION, OffsetDateTime.now(), producer,
                correlationId, data);
    }
}
