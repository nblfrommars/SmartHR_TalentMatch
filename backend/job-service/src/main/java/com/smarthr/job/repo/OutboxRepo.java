package com.smarthr.job.repo;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.smarthr.job.model.entity.Outbox;

@Repository
public interface OutboxRepo extends JpaRepository<Outbox, UUID> {

    @Query(value = """
            SELECT * FROM outbox
            WHERE published = false
            ORDER BY created_at
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<Outbox> lockUnpublished(@Param("limit") int limit);

    @Modifying
    @Query("DELETE FROM Outbox o WHERE o.published = true AND o.createdAt < :before")
    int deletePublishedBefore(@Param("before") OffsetDateTime before);
}
