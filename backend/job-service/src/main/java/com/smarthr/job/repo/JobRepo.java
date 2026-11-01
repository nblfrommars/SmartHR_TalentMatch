package com.smarthr.job.repo;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;

@Repository
public interface JobRepo extends JpaRepository<Job, UUID> {

    Page<Job> findByCompanyId(UUID companyId, Pageable pageable);

    Page<Job> findByStatus(JobStatus status, Pageable pageable);

    List<Job> findByStatusAndDeadlineBefore(JobStatus status, OffsetDateTime deadline);

    @Query("""
        SELECT j FROM Job j
        WHERE (:industry IS NULL OR j.industry = :industry)
          AND (:location IS NULL OR j.location = :location)
          AND (:status IS NULL OR j.status = :status)
          AND (:salaryMin IS NULL OR j.salaryMax >= :salaryMin)
          AND (:salaryMax IS NULL OR j.salaryMin <= :salaryMax)
          AND (:level IS NULL OR j.level = :level)
          AND (:keyword IS NULL OR LOWER(j.title) LIKE LOWER(CONCAT('%', :keyword, '%')))
    """)
    Page<Job> search(
        @Param("industry") String industry,
        @Param("location") String location,
        @Param("status") JobStatus status,
        @Param("salaryMin") Long salaryMin,
        @Param("salaryMax") Long salaryMax,
        @Param("level") JobLevel level,
        @Param("keyword") String keyword,
        Pageable pageable
    );
}