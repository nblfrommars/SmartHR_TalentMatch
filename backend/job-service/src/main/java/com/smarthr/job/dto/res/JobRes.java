package com.smarthr.job.dto.res;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobRes {

    private UUID id;
    private UUID companyId;
    private UUID hrId;
    private String title;
    private String description;
    private JobLevel level;
    private JobType jobType;
    private WorkMode workMode;
    private String location;
    private String industry;
    private Long salaryMin;
    private Long salaryMax;
    private Boolean salaryNegotiable;
    private Integer yoe;
    private Instant deadline;
    private JobStatus status;
    private Instant createdAt;
    private Instant updatedAt;
    private List<JobSkillRes> skills;
}