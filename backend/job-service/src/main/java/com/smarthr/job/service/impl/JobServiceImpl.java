package com.smarthr.job.service.impl;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.smarthr.job.dto.req.CreateJobReq;
import com.smarthr.job.dto.req.UpdateJobReq;
import com.smarthr.job.dto.res.JobRes;
import com.smarthr.job.event.JobEventType;
import com.smarthr.job.event.OutboxPublisher;
import com.smarthr.job.mapper.JobMapper;
import com.smarthr.job.model.entity.Industry;
import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.entity.Location;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.repo.IndustryRepo;
import com.smarthr.job.repo.JobRepo;
import com.smarthr.job.repo.JobSpecifications;
import com.smarthr.job.repo.LocationRepo;
import com.smarthr.job.service.JobService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class JobServiceImpl implements JobService {

    private final JobRepo jobRepo;
    private final IndustryRepo industryRepo;
    private final LocationRepo locationRepo;
    private final JobMapper jobMapper;
    private final OutboxPublisher outboxPublisher;

    @Override
    @Transactional
    public JobRes createJob(CreateJobReq req, UUID companyId, UUID createdBy) {
        Job job = jobMapper.toEntity(req);
        job.setIndustry(findIndustry(req.getIndustryId()));
        job.setLocation(findLocation(req.getLocationId()));
        job.setCompanyId(companyId);
        job.setCreatedBy(createdBy);
        job.setStatus(JobStatus.OPEN);
        job.setPublishedAt(OffsetDateTime.now());

        Job saved = jobRepo.saveAndFlush(job);
        JobRes res = jobMapper.toResponse(saved);
        outboxPublisher.publish(JobEventType.CREATED, saved.getId(), res);
        return res;
    }

    @Override
    @Transactional
    public JobRes updateJob(UUID id, UpdateJobReq req, UUID companyId) {
        Job job = findOwnedJob(id, companyId);
        if (job.getStatus() == JobStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A closed job cannot be edited");
        }

        jobMapper.updateEntity(job, req);
        job.setIndustry(findIndustry(req.getIndustryId()));
        job.setLocation(findLocation(req.getLocationId()));
        touch(job);

        Job saved = jobRepo.saveAndFlush(job);
        JobRes res = jobMapper.toResponse(saved);
        outboxPublisher.publish(JobEventType.UPDATED, saved.getId(), res);
        return res;
    }

    @Override
    @Transactional(readOnly = true)
    public JobRes getJobById(UUID id, UUID companyId) {
        Job job = jobRepo.findById(id).orElseThrow(JobServiceImpl::jobNotFound);
        boolean owner = companyId != null && companyId.equals(job.getCompanyId());
        boolean publiclyVisible = job.getStatus() == JobStatus.OPEN && job.getDeadline().isAfter(OffsetDateTime.now());
        if (!owner && !publiclyVisible) {
            throw jobNotFound();
        }
        return jobMapper.toResponse(job);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<JobRes> getJobsByCompany(UUID companyId, JobStatus status, Pageable pageable) {
        return jobRepo.findAll(JobSpecifications.ofCompany(companyId, status), pageable)
                .map(jobMapper::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<JobRes> searchJobs(UUID industryId, UUID locationId, Long salaryMin, Long salaryMax, JobLevel level,
            String companyName, String keyword, Pageable pageable) {
        Specification<Job> spec = JobSpecifications.openAndNotExpired(OffsetDateTime.now())
                .and(JobSpecifications.filter(industryId, locationId, salaryMin, salaryMax, level, companyName, keyword));
        return jobRepo.findAll(spec, pageable).map(jobMapper::toResponse);
    }

    @Override
    @Transactional
    public void closeJob(UUID id, UUID companyId) {
        Job job = findOwnedJob(id, companyId);
        if (job.getStatus() == JobStatus.CLOSED) {
            return;
        }
        job.setStatus(JobStatus.CLOSED);
        touch(job);

        Job saved = jobRepo.saveAndFlush(job);
        outboxPublisher.publish(JobEventType.CLOSED, saved.getId(), jobMapper.toResponse(saved));
    }

    @Override
    @Transactional
    public void deleteJob(UUID id, UUID companyId) {
        Job job = findOwnedJob(id, companyId);
        JobRes snapshot = jobMapper.toResponse(job);
        jobRepo.delete(job);
        jobRepo.flush();
        outboxPublisher.publish(JobEventType.DELETED, id, snapshot);
    }

    private static void touch(Job job) {
        job.setUpdatedAt(OffsetDateTime.now());
    }

    private Industry findIndustry(UUID industryId) {
        return industryRepo.findById(industryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Industry not found"));
    }

    private Location findLocation(UUID locationId) {
        return locationRepo.findById(locationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location not found"));
    }

    private Job findOwnedJob(UUID id, UUID companyId) {
        Job job = jobRepo.findById(id).orElseThrow(JobServiceImpl::jobNotFound);
        if (!job.getCompanyId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to modify this job");
        }
        return job;
    }

    private static ResponseStatusException jobNotFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found");
    }
}
