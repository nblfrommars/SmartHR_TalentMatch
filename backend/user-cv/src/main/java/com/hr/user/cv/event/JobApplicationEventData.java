package com.hr.user.cv.event;

import java.time.Instant;
import java.util.UUID;

import com.hr.user.cv.enums.ApplicationStatus;

public record JobApplicationEventData(
        UUID applicationId,
        UUID jobId,
        UUID applicantId,
        UUID cvAttachmentId,
        String coverLetter,
        ApplicationStatus status,
        Instant appliedAt) {
}
