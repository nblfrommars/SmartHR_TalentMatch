package com.smarthr.job.controller;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
            @RequestHeader("X-Company-Id") UUID companyId,
            @RequestHeader("X-User-Id") UUID userId
    ) {
        JobRes res = jobService.createJob(req, companyId, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    @GetMapping("/{id}")
    public ResponseEntity<JobRes> getJobById(@PathVariable UUID id) {
        return ResponseEntity.ok(jobService.getJobById(id));
    }

    @GetMapping
    public ResponseEntity<Page<JobRes>> searchJobs(
            @RequestParam(required = false) String industry,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) JobStatus status,
            @RequestParam(required = false) Long salaryMin,
            @RequestParam(required = false) Long salaryMax,
            @RequestParam(required = false) JobLevel level,
            @RequestParam(required = false) String keyword,
            @PageableDefault(size = 20) Pageable pageable
    ) {
        return ResponseEntity.ok(jobService.searchJobs(industry, location, status, salaryMin, salaryMax, level, keyword, pageable));
    }

    @GetMapping("/company")
    public ResponseEntity<Page<JobRes>> getJobsByCompany(
            @RequestHeader("X-Company-Id") UUID companyId,
            @PageableDefault(size = 20) Pageable pageable
    ) {
        return ResponseEntity.ok(jobService.getJobsByCompany(companyId, pageable));
    }

    @PutMapping("/{id}")
    public ResponseEntity<JobRes> updateJob(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateJobReq req,
            @RequestHeader("X-Company-Id") UUID companyId
    ) {
        return ResponseEntity.ok(jobService.updateJob(id, req, companyId));
    }

    @PatchMapping("/{id}/close")
    public ResponseEntity<Void> closeJob(
            @PathVariable UUID id,
            @RequestHeader("X-Company-Id") UUID companyId
    ) {
        jobService.closeJob(id, companyId);
        return ResponseEntity.noContent().build();
    }
} 