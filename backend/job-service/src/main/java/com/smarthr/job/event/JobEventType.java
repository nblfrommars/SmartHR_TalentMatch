package com.smarthr.job.event;

public enum JobEventType {
    CREATED("job.created"),
    UPDATED("job.updated"),
    CLOSED("job.closed"),
    EXPIRED("job.expired"),
    DELETED("job.deleted");

    public static final String TOPIC = "job.events";

    private final String value;

    JobEventType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
