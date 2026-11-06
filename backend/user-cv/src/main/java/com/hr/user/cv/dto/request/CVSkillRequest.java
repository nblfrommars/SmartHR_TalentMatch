package com.hr.user.cv.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CVSkillRequest {

    private Long skillId;
    private String title; //cho phép tự tạo skill mới để trạng thái pending => admin xử lý

    @NotNull
    @Min(0)
    private Integer yearsOfExperience;
}