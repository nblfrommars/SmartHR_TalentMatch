package com.hr.user.cv.service.impl;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.hr.user.cv.dto.request.CVSkillRequest;
import com.hr.user.cv.dto.request.CreateCVProfileRequest;
import com.hr.user.cv.dto.response.CVDetailResponse;
import com.hr.user.cv.dto.response.CVSkillResponse;
import com.hr.user.cv.dto.response.AttachmentUrlResponse;
import com.hr.user.cv.entity.CVProfile;
import com.hr.user.cv.entity.Attachment;
import com.hr.user.cv.entity.Skill;
import com.hr.user.cv.entity.User;
import com.hr.user.cv.enums.SkillStatus;
import com.hr.user.cv.enums.UserRole;
import com.hr.user.cv.event.CVProfileEventPublisher;
import com.hr.user.cv.event.CVProfileEventType;
import com.hr.user.cv.event.CVProfileEventData;
import com.hr.user.cv.event.CVProfileSkillEventData;
import com.hr.user.cv.service.AttachmentService;
import com.hr.user.cv.repository.CVProfileRepository;
import com.hr.user.cv.repository.AttachmentRepository;
import com.hr.user.cv.repository.PositionRepository;
import com.hr.user.cv.repository.SkillRepository;
import com.hr.user.cv.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CVProfileServiceImpl {

    private final CVProfileRepository cvProfileRepository;
    private final AttachmentRepository attachmentRepository;
    private final UserRepository userRepository;
    private final PositionRepository positionRepository;
    private final SkillRepository skillRepository;
    private final CVProfileEventPublisher eventPublisher;
    private final AttachmentService attachmentService;

    @Transactional(readOnly = true)
    public CVDetailResponse get(UUID userId) {
        return toResponse(findOwnedUserCv(userId));
    }

    @Transactional
    public CVDetailResponse create(UUID userId, CreateCVProfileRequest request) {
        requireApplicant(userId);
        if (cvProfileRepository.existsById(userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CV already exists");
        }
        CVProfile profile = new CVProfile();
        profile.setUserId(userId);
        apply(profile, request, userId);
        CVProfile saved = cvProfileRepository.save(profile);
        CVDetailResponse response = toResponse(saved);
        eventPublisher.publish(CVProfileEventType.CREATED, userId, toEventData(response));
        return response;
    }

    @Transactional
    public CVDetailResponse update(UUID userId, CreateCVProfileRequest request) {
        requireApplicant(userId);
        CVProfile profile = findOwnedUserCv(userId);
        apply(profile, request, userId);
        CVProfile saved = cvProfileRepository.save(profile);
        CVDetailResponse response = toResponse(saved);
        eventPublisher.publish(CVProfileEventType.UPDATED, userId, toEventData(response));
        return response;
    }

    private CVProfileEventData toEventData(CVDetailResponse response) {
        String cvAttachmentUrl = null;
        if (response.getCvAttachmentId() != null) {
            AttachmentUrlResponse urlResponse = attachmentService.createInternalDownloadUrl(
                    response.getUserId(), response.getCvAttachmentId());
            cvAttachmentUrl = urlResponse.getUrl();
        }
        return new CVProfileEventData(
                response.getUserId(),
                response.getPositionId(),
                response.getWorkLocationId(),
                response.getCvAttachmentId(),
                cvAttachmentUrl,
                response.getSummary(),
                response.getEduLevel(),
                response.getEducation(),
                response.getSkills().stream()
                        .map(skill -> new CVProfileSkillEventData(skill.getSkill(), skill.getYearsOfExperience()))
                        .toList());
    }

    @Transactional
    public void delete(UUID userId) {
        requireApplicant(userId);
        CVProfile profile = findOwnedUserCv(userId);
        cvProfileRepository.delete(profile);
    }

    private CVProfile findOwnedUserCv(UUID userId) {
        return cvProfileRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "CV not found"));
    }

    private void requireApplicant(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        if (user.isDeleted() || !user.isActive()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "User account is inactive");
        }
        if (user.getRole() != UserRole.USER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only USER accounts can manage CVs");
        }
    }

    private void apply(CVProfile profile, CreateCVProfileRequest request, UUID userId) {
        if (request.getPositionId() != null && !positionRepository.existsById(request.getPositionId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Position not found");
        }
        profile.setPositionId(request.getPositionId());
        profile.setWorkLocationId(request.getWorkLocationId());
        profile.setImageAttachmentId(validateAttachment(request.getImageAttachmentId(), userId));
        profile.setCvAttachmentId(validateAttachment(request.getCvAttachmentId(), userId));
        profile.setSummary(request.getSummary());
        profile.setEduLevel(request.getEduLevel());
        profile.setEducation(request.getEducation());

        profile.getSkills().clear();
        Map<Long, Skill> skillById = new LinkedHashMap<>();
        Map<Long, Integer> yearsBySkillId = new HashMap<>();
        List<CVSkillRequest> requestedSkills = request.getSkills() == null ? List.of() : request.getSkills();
        for (CVSkillRequest item : requestedSkills) {
            Skill skill = resolveSkill(item, userId);
            skillById.putIfAbsent(skill.getId(), skill);
            yearsBySkillId.merge(skill.getId(), item.getYearsOfExperience(), Math::max);
        }
        skillById.forEach((id, skill) -> profile.addSkill(skill, yearsBySkillId.get(id)));
    }

    private Skill resolveSkill(CVSkillRequest item, UUID userId) {
        if (item.getSkillId() != null) {
            return skillRepository.findById(item.getSkillId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Skill not found"));
        }
        if (item.getSkill() == null || item.getSkill().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Each skill requires skillId or skill");
        }
        String title = item.getSkill().trim();
        String normalizedTitle = title.toLowerCase();
        return skillRepository.findByNormalizedTitle(normalizedTitle)
                .orElseGet(() -> {
                    Skill skill = new Skill();
                    skill.setTitle(title);
                    skill.setNormalizedTitle(normalizedTitle);
                    skill.setStatus(SkillStatus.PENDING);
                    skill.setCreatedBy(userId);
                    return skillRepository.save(skill);
                });
    }

    private CVDetailResponse toResponse(CVProfile profile) {
        CVDetailResponse response = new CVDetailResponse();
        response.setUserId(profile.getUserId());
        response.setPositionId(profile.getPositionId());
        response.setWorkLocationId(profile.getWorkLocationId());
        response.setImageAttachmentId(profile.getImageAttachmentId());
        response.setCvAttachmentId(profile.getCvAttachmentId());
        response.setSummary(profile.getSummary());
        response.setEduLevel(profile.getEduLevel());
        response.setEducation(profile.getEducation());
        response.setSkills(profile.getSkills().stream()
                .map(item -> new CVSkillResponse(item.getSkill().getId(), item.getSkill().getTitle(),
                        item.getYearsOfExperience()))
                .toList());
        return response;
    }

    private UUID validateAttachment(UUID attachmentId, UUID userId) {
        if (attachmentId == null) {
            return null;
        }
        Attachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found"));
        if (!userId.equals(attachment.getCreatedBy())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Attachment does not belong to the user");
        }
        return attachmentId;
    }
}
