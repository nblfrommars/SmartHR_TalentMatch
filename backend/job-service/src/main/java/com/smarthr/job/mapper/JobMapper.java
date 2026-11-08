package com.smarthr.job.mapper;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.smarthr.job.dto.req.CreateJobReq;
import com.smarthr.job.dto.req.JobSkillReq;
import com.smarthr.job.dto.req.UpdateJobReq;
import com.smarthr.job.dto.res.IndustryRes;
import com.smarthr.job.dto.res.JobRes;
import com.smarthr.job.dto.res.JobSkillRes;
import com.smarthr.job.dto.res.LocationRes;
import com.smarthr.job.model.entity.Industry;
import com.smarthr.job.model.entity.Job;
import com.smarthr.job.model.entity.JobSkill;
import com.smarthr.job.model.entity.Location;

@Component
public class JobMapper {

    public Job toEntity(CreateJobReq req) {
        Job job = Job.builder()
                .title(req.getTitle())
                .description(req.getDescription())
                .level(req.getLevel())
                .jobType(req.getJobType())
                .workMode(req.getWorkMode())
                .salaryMin(req.getSalaryMin())
                .salaryMax(req.getSalaryMax())
                .minYearsExp(req.getMinYearsExp())
                .deadline(req.getDeadline())
                .build();

        if (req.getSkills() != null) {
            for (JobSkillReq skillReq : req.getSkills()) {
                JobSkill.JobSkillId id = JobSkill.JobSkillId.builder()
                        .skill(skillReq.getSkill())
                        .build();

                JobSkill skill = JobSkill.builder()
                        .jobSkillId(id)
                        .mustHave(Boolean.TRUE.equals(skillReq.getMustHave()))
                        .required(skillReq.getRequired() == null || skillReq.getRequired())
                        .build();

                job.addSkill(skill);
            }
        }
        return job;
    }

    public void updateEntity(Job job, UpdateJobReq req) {
        job.setTitle(req.getTitle());
        job.setDescription(req.getDescription());
        job.setLevel(req.getLevel());
        job.setJobType(req.getJobType());
        job.setWorkMode(req.getWorkMode());
        job.setSalaryMin(req.getSalaryMin());
        job.setSalaryMax(req.getSalaryMax());
        job.setMinYearsExp(req.getMinYearsExp());
        job.setDeadline(req.getDeadline());

        job.getJobSkills().clear();
        if (req.getSkills() != null) {
            for (JobSkillReq skillReq : req.getSkills()) {
                JobSkill.JobSkillId id = JobSkill.JobSkillId.builder()
                        .jobId(job.getId())
                        .skill(skillReq.getSkill())
                        .build();

                JobSkill skill = JobSkill.builder()
                        .jobSkillId(id)
                        .mustHave(Boolean.TRUE.equals(skillReq.getMustHave()))
                        .required(skillReq.getRequired() == null || skillReq.getRequired())
                        .build();

                job.addSkill(skill);
            }
        }
    }

    public JobRes toResponse(Job job) {
        List<JobSkillRes> skillResponses = Collections.emptyList();
        if (job.getJobSkills() != null) {
            skillResponses = job.getJobSkills().stream()
                    .map(this::toSkillResponse)
                    .collect(Collectors.toList());
        }

        return JobRes.builder()
                .id(job.getId())
                .companyId(job.getCompanyId())
                .createdBy(job.getCreatedBy())
                .title(job.getTitle())
                .description(job.getDescription())
                .level(job.getLevel())
                .jobType(job.getJobType())
                .workMode(job.getWorkMode())
                .location(toLocationResponse(job.getLocation()))
                .industry(toIndustryResponse(job.getIndustry()))
                .salaryMin(job.getSalaryMin())
                .salaryMax(job.getSalaryMax())
                .minYearsExp(job.getMinYearsExp())
                .deadline(job.getDeadline())
                .status(job.getStatus())
                .version(job.getVersion())
                .skills(skillResponses)
                .build();
    }

    public IndustryRes toIndustryResponse(Industry industry) {
        if (industry == null) {
            return null;
        }
        return IndustryRes.builder()
                .id(industry.getId())
                .name(industry.getName())
                .parentId(industry.getParent() != null ? industry.getParent().getId() : null)
                .build();
    }

    public LocationRes toLocationResponse(Location location) {
        if (location == null) {
            return null;
        }
        return LocationRes.builder()
                .id(location.getId())
                .name(location.getName())
                .parentId(location.getParent() != null ? location.getParent().getId() : null)
                .build();
    }

    public JobSkillRes toSkillResponse(JobSkill skill) {
        return JobSkillRes.builder()
                .skill(skill.getJobSkillId() != null ? skill.getJobSkillId().getSkill() : null)
                .mustHave(skill.getMustHave())
                .required(skill.getRequired())
                .build();
    }
}