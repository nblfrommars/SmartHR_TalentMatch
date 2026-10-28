package com.smarthr.job.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import com.smarthr.job.dto.req.CreateJobReq;
import com.smarthr.job.dto.req.UpdateJobReq;
import com.smarthr.job.dto.res.JobRes;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;

public interface JobService {

    JobRes createJob(UUID hrId, CreateJobReq request);

    JobRes getJobById(UUID id);

    JobRes updateJob(UUID id, UUID hrId, UUID companyId, UpdateJobReq request);

    void closeJob(UUID id, UUID hrId, UUID companyId);

    Page<JobRes> searchJobs(
            String search,
            String industry,
            String location,
            JobLevel level,
            JobType jobType,
            WorkMode workMode,
            Long salaryMin,
            Long salaryMax,
            JobStatus status,
            Pageable pageable
    );
}