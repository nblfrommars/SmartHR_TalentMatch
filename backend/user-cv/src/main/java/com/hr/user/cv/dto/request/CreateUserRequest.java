package com.hr.user.cv.dto.request;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import com.hr.user.cv.enums.EduLevel;
import com.hr.user.cv.enums.UserRole;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CreateUserRequest {

    // --- User ---
    @NotBlank
    private String userName;
    private String fullName;
    private String email;
    private Date dob;
    @NotNull
    private UserRole role;

    // --- HR only ---
    private UUID companyId;

    // --- APPLICANT only ---
    private Long positionId;
    private String imageUrl;
    private String summary;
    private EduLevel eduLevel;
    private String education;

    @Valid
    private List<CVSkillRequest> skills = new ArrayList<>();
}