package com.hr.user.cv.dto.response;

import java.time.Instant;
import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AttachmentResponse {
    private UUID id;
    private String originalFilename;
    private String contentType;
    private long fileSize;
    private UUID createdBy;
    private Instant createdAt;
}
