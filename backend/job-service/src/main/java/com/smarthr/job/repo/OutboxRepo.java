package com.smarthr.job.repo;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.smarthr.job.model.entity.Outbox;

@Repository
public interface OutboxRepo extends JpaRepository<Outbox, UUID> {

    @Query("SELECT o FROM Outbox o WHERE o.published = false ORDER BY o.createdAt ASC")
    List<Outbox> findUnpublished(Pageable pageable);
}