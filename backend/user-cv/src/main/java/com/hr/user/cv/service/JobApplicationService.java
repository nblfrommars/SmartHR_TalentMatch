package com.hr.user.cv.service;

import java.util.List;
import java.util.UUID;

import com.hr.user.cv.dto.request.ApplyJobRequest;
import com.hr.user.cv.dto.response.JobApplicationResponse;

public interface JobApplicationService {

    JobApplicationResponse apply(UUID applicantId, UUID jobId, ApplyJobRequest request);

    List<JobApplicationResponse> getMyApplications(UUID applicantId);

    List<JobApplicationResponse> getApplicationsForOwnedJob(UUID hrId, UUID jobId);

    void withdraw(UUID applicantId, UUID applicationId);
}
