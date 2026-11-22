package com.hr.user.cv.dto.request;

import java.util.ArrayList;
import java.util.List;

import com.hr.user.cv.enums.EduLevel;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateCVProfileRequest {
    private Long positionId;
    private Long workLocationId;
    private String imageUrl;

    @Size(max = 10000)
    private String summary;

    private EduLevel eduLevel;
    private String education;

    @Valid
    private List<CVSkillRequest> skills = new ArrayList<>();
}
