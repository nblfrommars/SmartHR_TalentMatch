package com.hr.user.cv.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.hr.user.cv.entity.JobApplicationOutbox;

public interface JobApplicationOutboxRepository extends JpaRepository<JobApplicationOutbox, UUID> {
    List<JobApplicationOutbox> findTop50ByPublishedFalseOrderByCreatedAtAsc();
}
