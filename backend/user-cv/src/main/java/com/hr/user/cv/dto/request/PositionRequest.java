package com.hr.user.cv.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class PositionRequest {

    @NotBlank
    private String code;

    @NotBlank
    private String name;

    private String description;
}
