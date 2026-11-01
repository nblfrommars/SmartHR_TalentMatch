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

    JobRes createJob(CreateJobReq req, UUID companyId, UUID createdBy);

    JobRes updateJob(UUID id, UpdateJobReq req, UUID companyId);

    JobRes getJobById(UUID id);

    Page<JobRes> getJobsByCompany(UUID companyId, Pageable pageable);

    Page<JobRes> searchJobs(String industry, String location, JobStatus status, Long salaryMin, Long salaryMax, JobLevel level, String keyword, Pageable pageable);

    void closeJob(UUID id, UUID companyId);
}