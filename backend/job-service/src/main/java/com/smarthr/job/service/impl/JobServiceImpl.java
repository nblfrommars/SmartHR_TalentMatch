package com.smarthr.job.service.impl;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthr.job.dto.req.CreateJobReq;
import com.smarthr.job.dto.req.UpdateJobReq;
import com.smarthr.job.dto.res.JobRes;
import com.smarthr.job.mapper.JobMapper;
import com.smarthr.job.model.entity.Industry;
import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.entity.Location;
import com.smarthr.job.model.entity.Outbox;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.repo.IndustryRepo;
import com.smarthr.job.repo.JobRepo;
import com.smarthr.job.repo.LocationRepo;
import com.smarthr.job.repo.OutboxRepo;
import com.smarthr.job.service.JobService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class JobServiceImpl implements JobService {

    private final JobRepo jobRepo;
    private final OutboxRepo outboxRepo;
    private final IndustryRepo industryRepo;
    private final LocationRepo locationRepo;
    private final JobMapper jobMapper;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public JobRes createJob(CreateJobReq req, UUID companyId, UUID createdBy) {
        Job job = jobMapper.toEntity(req);
        job.setIndustry(findIndustry(req.getIndustryId()));
        job.setLocation(findLocation(req.getLocationId()));
        job.setCompanyId(companyId);
        job.setCreatedBy(createdBy);
        job.setStatus(JobStatus.OPEN);

        Job savedJob = jobRepo.save(job);
        JobRes res = jobMapper.toResponse(savedJob);

        saveOutboxEvent("job.created", savedJob.getId(), res);

        return res;
    }

    @Override
    @Transactional
    public JobRes updateJob(UUID id, UpdateJobReq req, UUID companyId) {
        Job job = findJobByIdAndValidateOwnership(id, companyId);

        jobMapper.updateEntity(job, req);
        job.setIndustry(findIndustry(req.getIndustryId()));
        job.setLocation(findLocation(req.getLocationId()));
        Job updatedJob = jobRepo.save(job);
        JobRes res = jobMapper.toResponse(updatedJob);

        saveOutboxEvent("job.updated", updatedJob.getId(), res);

        return res;
    }

    @Override
    @Transactional(readOnly = true)
    public JobRes getJobById(UUID id) {
        Job job = jobRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        return jobMapper.toResponse(job);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<JobRes> getJobsByCompany(UUID companyId, Pageable pageable) {
        return jobRepo.findByCompanyId(companyId, pageable)
                .map(jobMapper::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<JobRes> searchJobs(UUID industryId, UUID locationId, JobStatus status, Long salaryMin, Long salaryMax, JobLevel level, String keyword, Pageable pageable) {
        return jobRepo.search(industryId, locationId, status, salaryMin, salaryMax, level, keyword, pageable)
                .map(jobMapper::toResponse);
    }

    @Override
    @Transactional
    public void closeJob(UUID id, UUID companyId) {
        Job job = findJobByIdAndValidateOwnership(id, companyId);
        job.setStatus(JobStatus.CLOSED);
        Job closedJob = jobRepo.save(job);

        JobRes res = jobMapper.toResponse(closedJob);
        saveOutboxEvent("job.closed", closedJob.getId(), res);
    }

    private Industry findIndustry(UUID industryId) {
        return industryRepo.findById(industryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Industry not found"));
    }

    private Location findLocation(UUID locationId) {
        return locationRepo.findById(locationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location not found"));
    }

    private Job findJobByIdAndValidateOwnership(UUID id, UUID companyId) {
        Job job = jobRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));

        if (!job.getCompanyId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to modify this job");
        }
        return job;
    }

    private void saveOutboxEvent(String eventType, UUID aggregateId, Object data) {
        try {
            String payload = objectMapper.writeValueAsString(data);
            Outbox outbox = Outbox.builder()
                    .eventType(eventType)
                    .aggregateId(aggregateId)
                    .payload(payload)
                    .build();
            outboxRepo.save(outbox);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize event payload");
        }
    }
}