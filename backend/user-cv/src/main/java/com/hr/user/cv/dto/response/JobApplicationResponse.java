package com.hr.user.cv.dto.response;

import java.time.Instant;
import java.util.UUID;

import com.hr.user.cv.enums.ApplicationStatus;

import lombok.Data;

@Data
public class JobApplicationResponse {
    private UUID id;
    private UUID jobId;
    private UUID applicantId;
    private UUID cvAttachmentId;
    private String coverLetter;
    private ApplicationStatus status;
    private Instant appliedAt;
    private Instant updatedAt;
}
