package com.hr.user.cv.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.hr.user.cv.dto.request.ApplyJobRequest;
import com.hr.user.cv.dto.response.JobApplicationResponse;
import com.hr.user.cv.service.JobApplicationService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/applications")
@RequiredArgsConstructor
public class JobApplicationController {

    private final JobApplicationService applicationService;

    @PostMapping("/jobs/{jobId}")
    @ResponseStatus(HttpStatus.CREATED)
    public JobApplicationResponse apply(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID jobId,
            @Valid @RequestBody(required = false) ApplyJobRequest request) {
        return applicationService.apply(userId(jwt), jobId, request);
    }

    @GetMapping("/me")
    public List<JobApplicationResponse> getMyApplications(@AuthenticationPrincipal Jwt jwt) {
        return applicationService.getMyApplications(userId(jwt));
    }

    @DeleteMapping("/{applicationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applicationId) {
        applicationService.withdraw(userId(jwt), applicationId);
    }

    private UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "JWT subject must be a UUID", ex);
        }
    }
}
