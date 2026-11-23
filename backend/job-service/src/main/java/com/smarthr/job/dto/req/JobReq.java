package com.smarthr.job.dto.req;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public abstract class JobReq {

    @NotBlank
    @Size(max = 255)
    private String companyName;

    @NotBlank
    @Size(max = 255)
    private String title;

    @NotBlank
    private String description;

    @NotNull
    private JobLevel level;

    @NotNull
    private JobType jobType;

    @NotNull
    private WorkMode workMode;

    @NotNull
    private UUID locationId;

    @NotNull
    private UUID industryId;

    @Positive
    private Long salaryMin;

    @Positive
    private Long salaryMax;

    @PositiveOrZero
    private Integer minYearsExp;

    @NotNull
    @Future
    private OffsetDateTime deadline;

    @NotEmpty
    @Size(max = 50)
    @Valid
    private List<JobSkillReq> skills;

    @JsonIgnore
    @AssertTrue(message = "salaryMin must be less than or equal to salaryMax")
    public boolean isSalaryRangeValid() {
        return salaryMin == null || salaryMax == null || salaryMin <= salaryMax;
    }
}
