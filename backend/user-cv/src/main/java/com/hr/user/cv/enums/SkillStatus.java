package com.hr.user.cv.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.stream.Stream;

public enum SkillStatus {
    PENDING(1, "Đang chờ duyệt"),
    APPROVED(2, "Đã duyệt"),
    REJECTED(3, "Từ chối");

    private final int value;
    private final String label;

    SkillStatus(int value, String label) {
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
    public static SkillStatus from(Object input) {
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
                        throw new IllegalArgumentException("Unknown SkillStaus: " + input);
                    }
                });
    }

    public static SkillStatus fromValue(int value) {
        return Stream.of(values())
                .filter(r -> r.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown SkillStatus value: " + value));
    }
}