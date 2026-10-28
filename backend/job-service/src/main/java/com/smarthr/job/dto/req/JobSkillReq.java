package com.smarthr.job.dto.req;

import jakarta.validation.constraints.NotBlank;
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
public class JobSkillReq {

    @NotBlank(message = "Tên kỹ năng không được để trống")
    private String skillName;

    private Boolean mustHave;

    private Boolean required;
}