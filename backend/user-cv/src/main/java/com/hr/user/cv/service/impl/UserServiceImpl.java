package com.hr.user.cv.service.impl;
import com.hr.user.cv.service.UserService;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.hr.user.cv.repository.UserRepository;
import com.hr.user.cv.repository.CVProfileRepository;
import com.hr.user.cv.repository.HRProfileRepository;
import com.hr.user.cv.repository.SkillRepository;
import com.hr.user.cv.entity.User;
import com.hr.user.cv.entity.HRProfile;
import com.hr.user.cv.entity.CVProfile;
import com.hr.user.cv.entity.Skill;
import com.hr.user.cv.enums.UserRole;
import com.hr.user.cv.enums.SkillStatus;
import com.hr.user.cv.dto.request.CreateUserRequest;
import com.hr.user.cv.dto.request.RegisterUserRequest;
import com.hr.user.cv.dto.request.CVSkillRequest;
import com.hr.user.cv.dto.response.UserResponse;
import com.hr.user.cv.mapper.UserMapper;
import com.hr.user.cv.integration.KeycloakAdminClient;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final CVProfileRepository cvProfileRepository;
    private final HRProfileRepository hrProfileRepository;
    private final SkillRepository skillRepository;
    private final UserMapper userMapper;
    private final KeycloakAdminClient keycloakAdminClient;

    @Override
    @Transactional(readOnly = true)
    public List<User> getAll() {
        return userRepository.findAll();
    }

    @Override
    @Transactional
    public UserResponse save(CreateUserRequest req) {
        User user = createUser(req);
        return userMapper.toResponse(user);
    }

    @Override
    @Transactional
    public UserResponse register(RegisterUserRequest req) {
        validateRegistration(req);
        String keycloakRole = req.getRole() == UserRole.HR ? "HR" : "USER";
        String keycloakUserId;
        try {
            keycloakUserId = keycloakAdminClient.createUser(
                    req.getUserName().trim(), req.getEmail().trim(), req.getFullName(), req.getPassword(), keycloakRole);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to create user in Keycloak", ex);
        }

        try {
            return userMapper.toResponse(createUser(req));
        } catch (RuntimeException ex) {
            try {
                keycloakAdminClient.deleteUser(keycloakUserId);
            } catch (Exception ignored) {
                // Keep the original registration error; reconciliation can remove the orphan later.
            }
            throw ex;
        }
    }

    private void validateRegistration(RegisterUserRequest req) {
        validate(req);
        if (req.getEmail() == null || req.getEmail().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is required");
        }
        if (req.getPassword() == null || req.getPassword().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password is required");
        }
    }

    private User createUser(CreateUserRequest req) {
        validate(req);

        User user = new User();
        user.setUserName(req.getUserName().trim());
        user.setEmail(req.getEmail().trim());
        user.setFullName(req.getFullName());
        user.setDob(req.getDob());
        user.setRole(req.getRole());
        user.setActive(true);
        user.setDeleted(false);
        user = userRepository.save(user);

        switch (req.getRole()) {
            case HR -> createHRProfile(user.getId(), req);
            case APPLICANT -> createCVProfile(user.getId(), req);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role not allowed");
        }
        return user;
    }

    private void validate(CreateUserRequest req) {
        if (req.getRole() != UserRole.HR && req.getRole() != UserRole.APPLICANT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role must be HR or APPLICANT");
        }
        if (userRepository.existsByUserName(req.getUserName().trim())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already exists");
        }
        if (req.getRole() == UserRole.HR) {
            if (req.getCompanyId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "companyId is required for HR");
            }
            if (req.getSkills() != null && !req.getSkills().isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "HR cannot have skills");
            }
        } else if (req.getCompanyId() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "companyId is only for HR");
        }
    }

    private void createHRProfile(Long userId, CreateUserRequest req) {
        HRProfile hr = new HRProfile();
        hr.setUserId(userId);
        hr.setCompanyId(req.getCompanyId());
        hr.setVerified(false);     // luôn false, admin duyệt sau
        hrProfileRepository.save(hr);
    }

    private void createCVProfile(Long userId, CreateUserRequest req) {
        CVProfile profile = new CVProfile();
        profile.setUserId(userId);
        profile.setPositionId(req.getPositionId());
        profile.setImageUrl(req.getImageUrl());
        profile.setSummary(req.getSummary());
        profile.setEduLevel(req.getEduLevel());
        profile.setEducation(req.getEducation());

        Map<Long, Skill> skillById = new LinkedHashMap<>();
        Map<Long, Integer> yearsBySkillId = new HashMap<>();

        List<CVSkillRequest> items = req.getSkills() == null ? List.of() : req.getSkills();
        for (CVSkillRequest item : items) {
            Skill skill = resolveSkill(item, userId);
            skillById.putIfAbsent(skill.getId(), skill);
            yearsBySkillId.merge(skill.getId(), item.getYearsOfExperience(), Math::max);
        }
        skillById.forEach((id, skill) -> profile.addSkill(skill, yearsBySkillId.get(id)));

        cvProfileRepository.save(profile);
    }

    private Skill resolveSkill(CVSkillRequest item, Long userId) {
        if (item.getSkillId() != null) {
            return skillRepository.findById(item.getSkillId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "Skill not found: " + item.getSkillId()));
        }

        String title = item.getTitle();
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Each skill requires either skillId or title");
        }

        String normalizedTitle = title.trim().toLowerCase();
        return skillRepository.findByNormalizedTitle(normalizedTitle)
                .orElseGet(() -> createPendingSkill(title.trim(), normalizedTitle, userId));
    }

    private Skill createPendingSkill(String title, String normalizedTitle, Long userId) {
        Skill skill = new Skill();
        skill.setTitle(title);
        skill.setNormalizedTitle(normalizedTitle);
        skill.setStatus(SkillStatus.PENDING);
        skill.setCreatedBy(userId);
        return skillRepository.save(skill);
    }
}
