package com.hr.user.cv.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.stream.Stream;

public enum EduLevel {
    LOWER_SECONDARY(0, "Đã tốt nghiệp THCS"),
    UPPER_SECONDARY(1, "Đã tốt nghiệp THPT"),
    INTERMEDIATE(2, "Tốt nghiệp trung cấp"),
    JUNIORCOLLEGE(3, "Tốt nghiệp cao đẳng"),
    COLLEGE(4, "Tốt nghiệp đại học"),
    POSTGRADUATE(5, "Cao học"),
    STUDENT(6, "Sinh viên"),
    OTHER(7, "Khác");

    private final int value;
    private final String label;

    EduLevel(int value, String label) {
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
    public static EduLevel from(Object input) {
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

    public static EduLevel fromValue(int value) {
        return Stream.of(values())
                .filter(r -> r.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown SkillStatus value: " + value));
    }
}