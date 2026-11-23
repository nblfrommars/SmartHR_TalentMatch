package com.hr.user.cv.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class CVSkillResponse {
    private Long skillId;
    private String skill;
    private Integer yearsOfExperience;
}
