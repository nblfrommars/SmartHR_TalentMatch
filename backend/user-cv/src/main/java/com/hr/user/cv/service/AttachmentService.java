package com.hr.user.cv.service;

import java.util.UUID;

import org.springframework.web.multipart.MultipartFile;

import com.hr.user.cv.dto.response.AttachmentResponse;
import com.hr.user.cv.dto.response.AttachmentUrlResponse;

public interface AttachmentService {
    AttachmentResponse upload(UUID userId, MultipartFile file);

    AttachmentUrlResponse createDownloadUrl(UUID userId, boolean admin, UUID attachmentId);

    AttachmentUrlResponse createInternalDownloadUrl(UUID userId, UUID attachmentId);

    void delete(UUID userId, boolean admin, UUID attachmentId);
}
