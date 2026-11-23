package com.hr.user.cv.service.impl;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.hr.user.cv.dto.request.ApplyJobRequest;
import com.hr.user.cv.dto.response.JobApplicationResponse;
import com.hr.user.cv.entity.JobApplication;
import com.hr.user.cv.entity.Attachment;
import com.hr.user.cv.entity.CVProfile;
import com.hr.user.cv.enums.ApplicationStatus;
import com.hr.user.cv.enums.UserRole;
import com.hr.user.cv.event.JobApplicationEventData;
import com.hr.user.cv.event.JobApplicationEventPublisher;
import com.hr.user.cv.event.JobApplicationEventType;
import com.hr.user.cv.integration.JobServiceClient;
import com.hr.user.cv.repository.JobApplicationRepository;
import com.hr.user.cv.repository.AttachmentRepository;
import com.hr.user.cv.repository.CVProfileRepository;
import com.hr.user.cv.repository.UserRepository;
import com.hr.user.cv.service.JobApplicationService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class JobApplicationServiceImpl implements JobApplicationService {

    private final JobApplicationRepository applicationRepository;
    private final UserRepository userRepository;
    private final JobServiceClient jobServiceClient;
    private final AttachmentRepository attachmentRepository;
    private final CVProfileRepository cvProfileRepository;
    private final JobApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public JobApplicationResponse apply(UUID applicantId, UUID jobId, ApplyJobRequest request) {
        userRepository.findById(applicantId)
                .filter(user -> user.isActive() && !user.isDeleted() && user.getRole() == UserRole.USER)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Only active USER accounts can apply to jobs"));

        if (applicationRepository.existsByJobIdAndApplicantId(jobId, applicantId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You have already applied to this job");
        }

        jobServiceClient.getOpenJob(jobId);

        UUID cvAttachmentId = resolveCvAttachmentId(applicantId, request);

        JobApplication application = new JobApplication();
        application.setJobId(jobId);
        application.setApplicantId(applicantId);
        application.setCvAttachmentId(cvAttachmentId);
        application.setCoverLetter(request == null ? null : request.getCoverLetter());
        application.setStatus(ApplicationStatus.APPLIED);

        try {
            JobApplication saved = applicationRepository.save(application);
            eventPublisher.publish(JobApplicationEventType.CREATED, saved.getId(),
                    new JobApplicationEventData(
                            saved.getId(), saved.getJobId(), saved.getApplicantId(), saved.getCvAttachmentId(),
                            saved.getCoverLetter(), saved.getStatus(), saved.getAppliedAt()));
            return toResponse(saved);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You have already applied to this job", ex);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobApplicationResponse> getMyApplications(UUID applicantId) {
        return applicationRepository.findByApplicantIdOrderByAppliedAtDesc(applicantId)
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobApplicationResponse> getApplicationsForOwnedJob(UUID hrId, UUID jobId) {
        userRepository.findById(hrId)
                .filter(user -> user.isActive() && !user.isDeleted() && user.getRole() == UserRole.HR)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Only active HR accounts can view job applicants"));

        JobServiceClient.JobSnapshot job = jobServiceClient.getJob(jobId);
        if (job.getCreatedBy() == null || !hrId.equals(job.getCreatedBy())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the HR who created the job can view its applicants");
        }

        return applicationRepository.findByJobIdOrderByAppliedAtDesc(jobId)
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional
    public void withdraw(UUID applicantId, UUID applicationId) {
        JobApplication application = applicationRepository.findByIdAndApplicantId(applicationId, applicantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found"));
        if (application.getStatus() != ApplicationStatus.APPLIED
                && application.getStatus() != ApplicationStatus.REVIEWING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Application cannot be withdrawn in its current status");
        }
        application.setStatus(ApplicationStatus.WITHDRAWN);
    }

    private JobApplicationResponse toResponse(JobApplication application) {
        JobApplicationResponse response = new JobApplicationResponse();
        response.setId(application.getId());
        response.setJobId(application.getJobId());
        response.setApplicantId(application.getApplicantId());
        response.setCvAttachmentId(application.getCvAttachmentId());
        response.setCoverLetter(application.getCoverLetter());
        response.setStatus(application.getStatus());
        response.setAppliedAt(application.getAppliedAt());
        response.setUpdatedAt(application.getUpdatedAt());
        return response;
    }

    private UUID resolveCvAttachmentId(UUID applicantId, ApplyJobRequest request) {
        UUID requestedAttachmentId = request == null ? null : request.getCvAttachmentId();
        UUID cvAttachmentId = requestedAttachmentId;

        if (cvAttachmentId == null) {
            cvAttachmentId = cvProfileRepository.findById(applicantId)
                    .map(CVProfile::getCvAttachmentId)
                    .orElse(null);
        }

        if (cvAttachmentId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "cvAttachmentId is required or must be configured in your CV profile");
        }

        Attachment attachment = attachmentRepository.findById(cvAttachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "CV attachment not found"));
        if (!applicantId.equals(attachment.getCreatedBy())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "CV attachment does not belong to the applicant");
        }
        return cvAttachmentId;
    }
}
