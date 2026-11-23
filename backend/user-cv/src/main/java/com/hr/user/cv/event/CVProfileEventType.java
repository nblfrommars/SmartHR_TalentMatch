package com.hr.user.cv.event;

public enum CVProfileEventType {
    CREATED("cv_profile.created"),
    UPDATED("cv_profile.updated");

    public static final String TOPIC = "cv.profile.events";

    private final String value;

    CVProfileEventType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
