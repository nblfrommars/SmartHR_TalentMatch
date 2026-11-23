package com.hr.user.cv.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.hr.user.cv.entity.JobApplication;

public interface JobApplicationRepository extends JpaRepository<JobApplication, UUID> {

    boolean existsByJobIdAndApplicantId(UUID jobId, UUID applicantId);

    List<JobApplication> findByApplicantIdOrderByAppliedAtDesc(UUID applicantId);

    List<JobApplication> findByJobIdOrderByAppliedAtDesc(UUID jobId);

    Optional<JobApplication> findByIdAndApplicantId(UUID id, UUID applicantId);
}
