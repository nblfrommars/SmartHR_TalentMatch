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
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;
import com.smarthr.job.service.JobService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("api/v1/jobs")
@RequiredArgsConstructor
public class JobController {

    private final JobService jobService;

    @PostMapping
    public ResponseEntity<JobRes> createJob(
            @RequestHeader("X-User-Id") UUID hrId,
            @Valid @RequestBody CreateJobReq req
    ) {
        JobRes res = jobService.createJob(hrId, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    @GetMapping("/{id}")
    public ResponseEntity<JobRes> getJobById(@PathVariable UUID id) {
        JobRes res = jobService.getJobById(id);
        return ResponseEntity.ok(res);
    }

    @PutMapping("/{id}")
    public ResponseEntity<JobRes> updateJob(
            @PathVariable UUID id,
            @RequestHeader("X-User-Id") UUID hrId,
            @RequestHeader("X-Company-Id") UUID companyId,
            @Valid @RequestBody UpdateJobReq req
    ) {
        JobRes res = jobService.updateJob(id, hrId, companyId, req);
        return ResponseEntity.ok(res);
    }

    @PatchMapping("/{id}/close")
    public ResponseEntity<Void> closeJob(
            @PathVariable UUID id,
            @RequestHeader("X-User-Id") UUID hrId,
            @RequestHeader("X-Company-Id") UUID companyId
    ) {
        jobService.closeJob(id, hrId, companyId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<Page<JobRes>> searchJobs(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String industry,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) JobLevel level,
            @RequestParam(required = false) JobType jobType,
            @RequestParam(required = false) WorkMode workMode,
            @RequestParam(required = false) Long salaryMin,
            @RequestParam(required = false) Long salaryMax,
            @RequestParam(required = false) JobStatus status,
            @PageableDefault(size = 10) Pageable pageable
    ) {
        Page<JobRes> res = jobService.searchJobs(
                search, industry, location, level, jobType, workMode, salaryMin, salaryMax, status, pageable
        );
        return ResponseEntity.ok(res);
    }
}