package com.hr.user.cv.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.stream.Stream;

public enum UserRole {
    ADMIN(1, "Admin"),
    HR(2, "HR"),
    APPLICANT(3, "Applicant");

    private final int value;
    private final String label;

    UserRole(int value, String label) {
        this.value = value;
        this.label = label;
    }

    @JsonValue
    public int getValue() {
        return value;
    }

    public String getLabel() {
        return label;
    }

    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public static UserRole from(Object input) {
        if (input == null) {
            return null;
        }
        if (input instanceof Number n) {
            return fromValue(n.intValue());
        }
        String s = input.toString().trim();
        return Stream.of(values())
                .filter(r -> r.name().equalsIgnoreCase(s) || r.label.equalsIgnoreCase(s))
                .findFirst()
                .orElseGet(() -> {
                    try {
                        return fromValue(Integer.parseInt(s));
                    } catch (NumberFormatException e) {
                        throw new IllegalArgumentException("Unknown UserRole: " + input);
                    }
                });
    }

    public static UserRole fromValue(int value) {
        return Stream.of(values())
                .filter(r -> r.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown UserRole value: " + value));
    }
}