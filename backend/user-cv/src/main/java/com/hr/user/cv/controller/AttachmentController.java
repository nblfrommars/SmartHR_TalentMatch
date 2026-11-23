package com.hr.user.cv.controller;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.hr.user.cv.dto.response.AttachmentResponse;
import com.hr.user.cv.dto.response.AttachmentUrlResponse;
import com.hr.user.cv.service.AttachmentService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/attachments")
@RequiredArgsConstructor
public class AttachmentController {

    private final AttachmentService attachmentService;

    @PostMapping(consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public AttachmentResponse upload(@AuthenticationPrincipal Jwt jwt,
            @RequestParam("file") MultipartFile file) {
        return attachmentService.upload(userId(jwt), file);
    }

    @GetMapping("/{id}/url")
    public AttachmentUrlResponse createDownloadUrl(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id) {
        return attachmentService.createDownloadUrl(userId(jwt), isAdmin(jwt), id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        attachmentService.delete(userId(jwt), isAdmin(jwt), id);
    }

    private UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "JWT subject must be a UUID", ex);
        }
    }

    private boolean isAdmin(Jwt jwt) {
        Object realmAccess = jwt.getClaims().get("realm_access");
        return realmAccess instanceof Map<?, ?> claims
                && claims.get("roles") instanceof List<?> roles
                && roles.contains("ADMIN");
    }
}
