package com.hr.user.cv.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.hr.user.cv.entity.CVProfileOutbox;

public interface CVProfileOutboxRepository extends JpaRepository<CVProfileOutbox, UUID> {
    List<CVProfileOutbox> findTop50ByPublishedFalseOrderByCreatedAtAsc();
}
