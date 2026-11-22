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
import com.hr.user.cv.entity.CVProfile;
import com.hr.user.cv.entity.Skill;
import com.hr.user.cv.entity.User;
import com.hr.user.cv.enums.SkillStatus;
import com.hr.user.cv.enums.UserRole;
import com.hr.user.cv.repository.CVProfileRepository;
import com.hr.user.cv.repository.LocationRepository;
import com.hr.user.cv.repository.PositionRepository;
import com.hr.user.cv.repository.SkillRepository;
import com.hr.user.cv.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CVProfileServiceImpl {

    private final CVProfileRepository cvProfileRepository;
    private final UserRepository userRepository;
    private final PositionRepository positionRepository;
    private final LocationRepository locationRepository;
    private final SkillRepository skillRepository;

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
        return toResponse(cvProfileRepository.save(profile));
    }

    @Transactional
    public CVDetailResponse update(UUID userId, CreateCVProfileRequest request) {
        requireApplicant(userId);
        CVProfile profile = findOwnedUserCv(userId);
        apply(profile, request, userId);
        return toResponse(cvProfileRepository.save(profile));
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
        if (request.getWorkLocationId() != null
                && !locationRepository.findById(request.getWorkLocationId())
                        .map(location -> location.isActive())
                        .orElse(false)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Work location not found or inactive");
        }
        profile.setPositionId(request.getPositionId());
        profile.setWorkLocationId(request.getWorkLocationId());
        profile.setImageUrl(request.getImageUrl());
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
        if (item.getTitle() == null || item.getTitle().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Each skill requires skillId or title");
        }
        String title = item.getTitle().trim();
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
        response.setImageUrl(profile.getImageUrl());
        response.setSummary(profile.getSummary());
        response.setEduLevel(profile.getEduLevel());
        response.setEducation(profile.getEducation());
        response.setSkills(profile.getSkills().stream()
                .map(item -> new CVSkillResponse(item.getSkill().getId(), item.getSkill().getTitle(),
                        item.getYearsOfExperience()))
                .toList());
        return response;
    }
}
