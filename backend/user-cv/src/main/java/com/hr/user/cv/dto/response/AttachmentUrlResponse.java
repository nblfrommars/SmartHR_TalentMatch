package com.hr.user.cv.dto.response;

import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AttachmentUrlResponse {
    private UUID attachmentId;
    private String url;
    private int expiresInSeconds;
}
