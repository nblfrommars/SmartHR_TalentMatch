package com.hr.user.cv.dto.response;

import java.util.List;
import java.util.UUID;

import com.hr.user.cv.enums.EduLevel;

import lombok.Data;

@Data
public class CVDetailResponse {
    private UUID userId;
    private Long positionId;
    private UUID workLocationId;
    private UUID imageAttachmentId;
    private UUID cvAttachmentId;
    private String summary;
    private EduLevel eduLevel;
    private String education;
    private List<CVSkillResponse> skills;
}
