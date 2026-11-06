package com.hr.user.cv.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "cv_skill", uniqueConstraints = @UniqueConstraint(name = "uk_cv_skills_user_skill", columnNames = { "user_id", "skill_id" }))
@Getter
@Setter
@NoArgsConstructor
public class CVSkill {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private CVProfile cvProfile;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "skill_id", nullable = false)
    private Skill skill;

    @Column(name = "years_of_experience", nullable = false)
    private Integer yearsOfExperience = 0;
}