package com.smarthr.job.repo;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.domain.Specification;

import com.smarthr.job.model.entity.Industry;
import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.entity.JobSkill;
import com.smarthr.job.model.entity.Location;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;

import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;

public final class JobSpecifications {

    private static final char ESCAPE = '\\';

    private JobSpecifications() {
    }

    public static Specification<Job> openAndNotExpired(OffsetDateTime now) {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("status"), JobStatus.OPEN),
                cb.greaterThan(root.get("deadline"), now));
    }

    public static Specification<Job> ofCreator(UUID userId, JobStatus status) {
        return (root, query, cb) -> {
            Predicate byCreator = cb.equal(root.get("createdBy"), userId);
            return status == null ? byCreator : cb.and(byCreator, cb.equal(root.get("status"), status));
        };
    }

    public static Specification<Job> filter(UUID industryId, UUID locationId, Long salaryMin, Long salaryMax,
            JobLevel level, String companyName, String keyword) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (industryId != null) {
                Join<Job, Industry> industry = root.join("industry");
                Join<Industry, Industry> parent = industry.join("parent", JoinType.LEFT);
                predicates.add(cb.or(cb.equal(industry.get("id"), industryId), cb.equal(parent.get("id"), industryId)));
            }
            if (locationId != null) {
                Join<Job, Location> location = root.join("location");
                Join<Location, Location> parent = location.join("parent", JoinType.LEFT);
                predicates.add(cb.or(cb.equal(location.get("id"), locationId), cb.equal(parent.get("id"), locationId)));
            }
            if (salaryMin != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("salaryMax"), salaryMin));
            }
            if (salaryMax != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("salaryMin"), salaryMax));
            }
            if (level != null) {
                predicates.add(cb.equal(root.get("level"), level));
            }
            if (companyName != null && !companyName.isBlank()) {
                String pattern = "%" + escapeLike(companyName.trim().toLowerCase()) + "%";
                predicates.add(cb.like(cb.lower(root.get("companyName")), pattern, ESCAPE));
            }
            if (keyword != null && !keyword.isBlank()) {
                String pattern = "%" + escapeLike(keyword.trim().toLowerCase()) + "%";
                Subquery<Integer> skillMatch = query.subquery(Integer.class);
                Root<JobSkill> skill = skillMatch.from(JobSkill.class);
                skillMatch.select(cb.literal(1)).where(
                        cb.equal(skill.get("job"), root),
                        cb.like(cb.lower(skill.get("jobSkillId").get("skill")), pattern, ESCAPE));
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), pattern, ESCAPE),
                        cb.like(cb.lower(root.get("description")), pattern, ESCAPE),
                        cb.exists(skillMatch)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
