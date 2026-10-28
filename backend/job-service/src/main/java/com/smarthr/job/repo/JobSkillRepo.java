package com.smarthr.job.repo;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.smarthr.job.model.entity.JobSkill;

@Repository
public interface JobSkillRepo extends JpaRepository<JobSkill, UUID> {
}