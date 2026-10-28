package com.smarthr.job.service.impl;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.smarthr.job.dto.req.CreateJobReq;
import com.smarthr.job.dto.req.JobSkillReq;
import com.smarthr.job.dto.req.UpdateJobReq;
import com.smarthr.job.dto.res.JobRes;
import com.smarthr.job.dto.res.JobSkillRes;
import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.entity.JobSkill;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;
import com.smarthr.job.repo.JobRepo;
import com.smarthr.job.service.JobService;

import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class JobServiceImpl implements JobService {

    private final JobRepo jobRepo;

    @Override
    @Transactional
    public JobRes createJob(UUID hrId, CreateJobReq Req) {
        validateSalary(Req.getSalaryMin(), Req.getSalaryMax(), Req.getSalaryNegotiable());

        Job job = Job.builder()
                .companyId(Req.getCompanyId())
                .hrId(hrId)
                .title(Req.getTitle())
                .description(Req.getDescription())
                .level(Req.getLevel())
                .jobType(Req.getJobType())
                .workMode(Req.getWorkMode())
                .location(Req.getLocation())
                .industry(Req.getIndustry())
                .salaryMin(Req.getSalaryMin())
                .salaryMax(Req.getSalaryMax())
                .salaryNegotiable(Boolean.TRUE.equals(Req.getSalaryNegotiable()))
                .yoe(Req.getYoe() != null ? Req.getYoe() : 0)
                .deadline(Req.getDeadline())
                .status(JobStatus.OPEN)
                .build();

        if (Req.getSkills() != null) {
            for (JobSkillReq skillReq : Req.getSkills()) {
                JobSkill skill = JobSkill.builder()
                        .skillName(skillReq.getSkillName().toLowerCase().trim())
                        .mustHave(Boolean.TRUE.equals(skillReq.getMustHave()))
                        .required(skillReq.getRequired() == null || Boolean.TRUE.equals(skillReq.getRequired()))
                        .build();
                job.addSkill(skill);
            }
        }

        Job savedJob = jobRepo.save(job);
        return mapToRes(savedJob);
    }

    @Override
    @Transactional(readOnly = true)
    public JobRes getJobById(UUID id) {
        Job job = jobRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy job với ID: " + id));
        return mapToRes(job);
    }

    @Override
    @Transactional
    public JobRes updateJob(UUID id, UUID hrId, UUID companyId, UpdateJobReq Req) {
        Job job = jobRepo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy job hoặc bạn không có quyền chỉnh sửa job này"));

        validateSalary(Req.getSalaryMin(), Req.getSalaryMax(), Req.getSalaryNegotiable());

        job.setTitle(Req.getTitle());
        job.setDescription(Req.getDescription());
        job.setLevel(Req.getLevel());
        job.setJobType(Req.getJobType());
        job.setWorkMode(Req.getWorkMode());
        job.setLocation(Req.getLocation());
        job.setIndustry(Req.getIndustry());
        job.setSalaryMin(Req.getSalaryMin());
        job.setSalaryMax(Req.getSalaryMax());
        job.setSalaryNegotiable(Boolean.TRUE.equals(Req.getSalaryNegotiable()));
        job.setYoe(Req.getYoe() != null ? Req.getYoe() : 0);
        job.setDeadline(Req.getDeadline());
        job.setStatus(Req.getStatus());

        job.clearSkills();

        if (Req.getSkills() != null) {
            for (JobSkillReq skillReq : Req.getSkills()) {
                JobSkill skill = JobSkill.builder()
                        .skillName(skillReq.getSkillName().toLowerCase().trim())
                        .mustHave(Boolean.TRUE.equals(skillReq.getMustHave()))
                        .required(skillReq.getRequired() == null || Boolean.TRUE.equals(skillReq.getRequired()))
                        .build();
                job.addSkill(skill);
            }
        }

        Job updatedJob = jobRepo.save(job);
        return mapToRes(updatedJob);
    }

    @Override
    @Transactional
    public void closeJob(UUID id, UUID hrId, UUID companyId) {
        Job job = jobRepo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy job hoặc bạn không có quyền đóng job này"));
        job.setStatus(JobStatus.CLOSED);
        jobRepo.save(job);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<JobRes> searchJobs(
            String search,
            String industry,
            String location,
            JobLevel level,
            JobType jobType,
            WorkMode workMode,
            Long salaryMin,
            Long salaryMax,
            JobStatus status,
            Pageable pageable
    ) {
        Specification<Job> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (search != null && !search.isBlank()) {
                String searchPattern = "%" + search.toLowerCase().trim() + "%";
                Predicate titleMatch = cb.like(cb.lower(root.get("title")), searchPattern);
                Predicate descMatch = cb.like(cb.lower(root.get("description")), searchPattern);
                predicates.add(cb.or(titleMatch, descMatch));
            }

            if (industry != null && !industry.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("industry")), industry.toLowerCase().trim()));
            }

            if (location != null && !location.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("location")), "%" + location.toLowerCase().trim() + "%"));
            }

            if (level != null) {
                predicates.add(cb.equal(root.get("level"), level));
            }

            if (jobType != null) {
                predicates.add(cb.equal(root.get("jobType"), jobType));
            }

            if (workMode != null) {
                predicates.add(cb.equal(root.get("workMode"), workMode));
            }

            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            } else {
                predicates.add(cb.equal(root.get("status"), JobStatus.OPEN));
            }

            if (salaryMin != null) {
                predicates.add(cb.or(
                        cb.greaterThanOrEqualTo(root.get("salaryMax"), salaryMin),
                        cb.equal(root.get("salaryNegotiable"), true)
                ));
            }

            if (salaryMax != null) {
                predicates.add(cb.or(
                        cb.lessThanOrEqualTo(root.get("salaryMin"), salaryMax),
                        cb.equal(root.get("salaryNegotiable"), true)
                ));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        return jobRepo.findAll(spec, pageable).map(this::mapToRes);
    }

    private void validateSalary(Long min, Long max, Boolean negotiable) {
        if (Boolean.TRUE.equals(negotiable)) {
            return;
        }
        if (min != null && max != null && min > max) {
            throw new IllegalArgumentException("Mức lương tối thiểu không được lớn hơn mức lương tối đa");
        }
    }

    private JobRes mapToRes(Job job) {
        List<JobSkillRes> skillRess = job.getSkills().stream()
                .map(s -> JobSkillRes.builder()
                        .id(s.getId())
                        .skillName(s.getSkillName())
                        .mustHave(s.getMustHave())
                        .required(s.getRequired())
                        .build())
                .toList();

        return JobRes.builder()
                .id(job.getId())
                .companyId(job.getCompanyId())
                .hrId(job.getHrId())
                .title(job.getTitle())
                .description(job.getDescription())
                .level(job.getLevel())
                .jobType(job.getJobType())
                .workMode(job.getWorkMode())
                .location(job.getLocation())
                .industry(job.getIndustry())
                .salaryMin(job.getSalaryMin())
                .salaryMax(job.getSalaryMax())
                .salaryNegotiable(job.getSalaryNegotiable())
                .yoe(job.getYoe())
                .deadline(job.getDeadline())
                .status(job.getStatus())
                .createdAt(job.getCreatedAt())
                .updatedAt(job.getUpdatedAt())
                .skills(skillRess)
                .build();
    }
}