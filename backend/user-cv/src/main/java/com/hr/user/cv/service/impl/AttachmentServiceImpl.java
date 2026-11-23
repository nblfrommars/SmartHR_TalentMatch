package com.hr.user.cv.service.impl;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

import com.hr.user.cv.dto.response.AttachmentResponse;
import com.hr.user.cv.dto.response.AttachmentUrlResponse;
import com.hr.user.cv.entity.Attachment;
import com.hr.user.cv.repository.AttachmentRepository;
import com.hr.user.cv.service.AttachmentService;

import io.minio.BucketExistsArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.http.Method;

@Service
public class AttachmentServiceImpl implements AttachmentService {

    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024;
    private static final int URL_EXPIRY_SECONDS = 300;

    private final MinioClient minioClient;
    private final MinioClient publicMinioClient;
    private final AttachmentRepository attachmentRepository;

    @Value("${minio.bucket}")
    private String bucket;

    public AttachmentServiceImpl(
            @Qualifier("minioClient") MinioClient minioClient,
            @Qualifier("publicMinioClient") MinioClient publicMinioClient,
            AttachmentRepository attachmentRepository) {
        this.minioClient = minioClient;
        this.publicMinioClient = publicMinioClient;
        this.attachmentRepository = attachmentRepository;
    }

    @Override
    @Transactional
    public AttachmentResponse upload(UUID userId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File size must not exceed 5 MB");
        }

        UUID attachmentId = UUID.randomUUID();
        String filename = file.getOriginalFilename() == null ? "attachment" : file.getOriginalFilename();
        String objectKey = userId + "/" + attachmentId + "/" + sanitize(filename);
        ensureBucket();
        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .stream(file.getInputStream(), file.getSize(), -1)
                    .contentType(file.getContentType() == null ? "application/octet-stream" : file.getContentType())
                    .build());

            Attachment attachment = new Attachment();
            attachment.setId(attachmentId);
            attachment.setBucket(bucket);
            attachment.setObjectKey(objectKey);
            attachment.setOriginalFilename(filename);
            attachment.setContentType(file.getContentType() == null ? "application/octet-stream" : file.getContentType());
            attachment.setFileSize(file.getSize());
            attachment.setCreatedBy(userId);
            return toResponse(attachmentRepository.save(attachment));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to store attachment", ex);
        }
    }

    @Override
    public AttachmentUrlResponse createDownloadUrl(UUID userId, boolean admin, UUID attachmentId) {
        Attachment attachment = findAuthorized(userId, admin, attachmentId);
        try {
            String url = publicMinioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(attachment.getBucket())
                    .object(attachment.getObjectKey())
                    .expiry(URL_EXPIRY_SECONDS, TimeUnit.SECONDS)
                    .build());
            return new AttachmentUrlResponse(attachmentId, url, URL_EXPIRY_SECONDS);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to create attachment URL", ex);
        }
    }

    @Override
    @Transactional
    public void delete(UUID userId, boolean admin, UUID attachmentId) {
        Attachment attachment = findAuthorized(userId, admin, attachmentId);
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(attachment.getBucket())
                    .object(attachment.getObjectKey())
                    .build());
            attachmentRepository.delete(attachment);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to delete attachment", ex);
        }
    }

    private Attachment findAuthorized(UUID userId, boolean admin, UUID attachmentId) {
        Attachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found"));
        if (!admin && !userId.equals(attachment.getCreatedBy())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Attachment does not belong to the user");
        }
        return attachment;
    }

    private void ensureBucket() {
        try {
            if (!minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            }
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to initialize MinIO bucket", ex);
        }
    }

    private AttachmentResponse toResponse(Attachment attachment) {
        return new AttachmentResponse(attachment.getId(), attachment.getOriginalFilename(),
                attachment.getContentType(), attachment.getFileSize(), attachment.getCreatedBy(),
                attachment.getCreatedAt());
    }

    private String sanitize(String filename) {
        return filename.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
