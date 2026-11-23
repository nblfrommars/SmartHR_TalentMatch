package com.hr.user.cv.dto.request;

import java.util.UUID;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ApplyJobRequest {

    /** CV attachment to snapshot for this application. If omitted, the current CV attachment is used. */
    private UUID cvAttachmentId;

    @Size(max = 10000)
    private String coverLetter;
}
