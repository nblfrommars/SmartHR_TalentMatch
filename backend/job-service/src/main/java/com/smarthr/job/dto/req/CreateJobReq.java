package com.smarthr.job.dto.req;

import java.time.OffsetDateTime;
import java.util.List;

import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
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
public class CreateJobReq {

    @NotBlank
    private String title;

    @NotBlank
    private String description;

    @NotNull
    private JobLevel level;

    @NotNull
    private JobType jobType;

    @NotNull
    private WorkMode workMode;

    @NotBlank
    private String location;

    @NotBlank
    private String industry;

    @Positive
    private Long salaryMin;

    @Positive
    private Long salaryMax;

    private Integer minYearsExp;

    @NotNull
    @Future
    private OffsetDateTime deadline;

    @NotEmpty
    @Valid
    private List<JobSkillReq> skills;
}