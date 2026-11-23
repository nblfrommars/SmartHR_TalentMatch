package com.smarthr.job.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import com.smarthr.job.dto.req.CreateJobReq;
import com.smarthr.job.dto.req.UpdateJobReq;
import com.smarthr.job.dto.res.JobRes;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;

public interface JobService {

    JobRes createJob(CreateJobReq req, UUID createdBy);

    JobRes updateJob(UUID id, UpdateJobReq req, UUID userId);

    JobRes getJobById(UUID id, UUID userId);

    Page<JobRes> getJobsByCreator(UUID userId, JobStatus status, Pageable pageable);

    Page<JobRes> searchJobs(UUID industryId, UUID locationId, Long salaryMin, Long salaryMax, JobLevel level,
            String companyName, String keyword, Pageable pageable);

    void closeJob(UUID id, UUID userId);

    void deleteJob(UUID id, UUID userId);
}
