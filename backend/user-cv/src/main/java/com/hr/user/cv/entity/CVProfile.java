package com.hr.user.cv.entity;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import com.hr.user.cv.enums.EduLevel;

@Entity
@Table(name = "cv_profile")
@Getter
@Setter
@NoArgsConstructor
public class CVProfile {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "position_id")
    private Long positionId;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    @Column(name = "edu_level")
    @Enumerated(EnumType.STRING)
    private EduLevel eduLevel;

    @Column(name = "education")
    private String education;

    @OneToMany(mappedBy = "cvProfile", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<CVSkill> skills = new ArrayList<>();

    public void addSkill(Skill skill, Integer yearsOfExperience) {
        CVSkill cvSkill = new CVSkill();
        cvSkill.setCvProfile(this);
        cvSkill.setSkill(skill);
        cvSkill.setYearsOfExperience(yearsOfExperience);
        skills.add(cvSkill);
    }

    public void removeSkill(Long skillId) {
        skills.removeIf(cs -> cs.getSkill().getId().equals(skillId));
    }
}