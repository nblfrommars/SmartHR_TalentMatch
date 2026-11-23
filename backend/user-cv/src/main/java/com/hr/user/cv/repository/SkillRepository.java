package com.hr.user.cv.repository;

import org.springframework.stereotype.Repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import jakarta.persistence.*;
import com.hr.user.cv.entity.Skill;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.time.LocalDate;
import java.util.Date;
import java.util.List;
import java.util.Optional;
@Repository 
public interface SkillRepository extends JpaRepository<Skill, Long> {
    Optional<Skill> findByNormalizedTitle(String normalizedTitle);
}
