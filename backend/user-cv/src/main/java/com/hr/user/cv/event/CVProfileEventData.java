package com.hr.user.cv.event;

import java.util.List;
import java.util.UUID;

import com.hr.user.cv.enums.EduLevel;

public record CVProfileEventData(
        UUID userId,
        Long positionId,
        Long workLocationId,
        UUID cvAttachmentId,
        String cvAttachmentUrl,
        String summary,
        EduLevel eduLevel,
        String education,
        List<CVProfileSkillEventData> skills) {
}
