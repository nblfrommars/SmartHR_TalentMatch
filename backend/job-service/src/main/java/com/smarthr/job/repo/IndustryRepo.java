package com.smarthr.job.repo;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.smarthr.job.model.entity.Industry;

@Repository
public interface IndustryRepo extends JpaRepository<Industry, UUID> {

    List<Industry> findAllByOrderByNameAsc();
}
