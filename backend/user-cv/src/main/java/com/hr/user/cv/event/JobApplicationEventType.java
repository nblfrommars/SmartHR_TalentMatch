package com.hr.user.cv.event;

public enum JobApplicationEventType {
    CREATED("job_application.created");

    public static final String TOPIC = "job.application.events";

    private final String value;

    JobApplicationEventType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
