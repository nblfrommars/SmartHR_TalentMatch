package com.hr.user.cv.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;

@Data
public class CVSkillRequest {

    private Long skillId;

    @JsonAlias("title")
    private String skill; // title vẫn được hỗ trợ để tương thích request cũ

    @NotNull
    @Min(0)
    private Integer yearsOfExperience;
}
