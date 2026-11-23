package com.smarthr.job.repo;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.smarthr.job.model.entity.Job;

@Repository
public interface JobRepo extends JpaRepository<Job, UUID>, JpaSpecificationExecutor<Job> {

    @Override
    @EntityGraph(attributePaths = {"location", "location.parent", "industry", "industry.parent"})
    Page<Job> findAll(Specification<Job> spec, Pageable pageable);

    @Query(value = """
            SELECT * FROM jobs
            WHERE status = 'OPEN' AND deadline < now()
            ORDER BY deadline
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<Job> lockExpiredBatch(@Param("limit") int limit);
}
