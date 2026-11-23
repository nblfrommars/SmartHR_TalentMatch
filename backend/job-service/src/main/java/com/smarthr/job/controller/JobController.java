package com.smarthr.job.controller;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.smarthr.job.dto.req.CreateJobReq;
import com.smarthr.job.dto.req.UpdateJobReq;
import com.smarthr.job.dto.res.JobRes;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.service.JobService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/jobs")
@RequiredArgsConstructor
public class JobController {

    private final JobService jobService;

    @PostMapping
    public ResponseEntity<JobRes> createJob(
            @Valid @RequestBody CreateJobReq req,
            @AuthenticationPrincipal Jwt jwt
    ) {
        UUID userId = userId(jwt);
        return ResponseEntity.status(HttpStatus.CREATED).body(jobService.createJob(req, userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<JobRes> getJobById(
            @PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt
    ) {
        UUID userId = jwt == null ? null : userId(jwt);
        return ResponseEntity.ok(jobService.getJobById(id, userId));
    }

    @GetMapping
    public ResponseEntity<Page<JobRes>> searchJobs(
            @RequestParam(required = false) UUID industryId,
            @RequestParam(required = false) UUID locationId,
            @RequestParam(required = false) Long salaryMin,
            @RequestParam(required = false) Long salaryMax,
            @RequestParam(required = false) JobLevel level,
            @RequestParam(required = false) String companyName,
            @RequestParam(required = false) String keyword,
            @PageableDefault(size = 20) Pageable pageable
    ) {
        return ResponseEntity.ok(jobService.searchJobs(industryId, locationId, salaryMin, salaryMax, level, companyName, keyword, pageable));
    }

    //my
    @GetMapping("/my")
    public ResponseEntity<Page<JobRes>> getMyJobs(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) JobStatus status,
            @PageableDefault(size = 20) Pageable pageable
    ) {
        UUID userId = userId(jwt);
        return ResponseEntity.ok(jobService.getJobsByCreator(userId, status, pageable));
    }

    @PutMapping("/{id}")
    public ResponseEntity<JobRes> updateJob(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateJobReq req,
            @AuthenticationPrincipal Jwt jwt
    ) {
        UUID userId = userId(jwt);
        return ResponseEntity.ok(jobService.updateJob(id, req, userId));
    }

    @PatchMapping("/{id}/close")
    public ResponseEntity<Void> closeJob(
            @PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt
    ) {
        UUID userId = userId(jwt);
        jobService.closeJob(id, userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteJob(
            @PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt
    ) {
        UUID userId = userId(jwt);
        jobService.deleteJob(id, userId);
        return ResponseEntity.noContent().build();
    }

    private static UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "JWT subject must be a UUID", e);
        }
    }
}
