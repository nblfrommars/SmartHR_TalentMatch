package com.smarthr.job.repo;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.smarthr.job.model.entity.Location;

@Repository
public interface LocationRepo extends JpaRepository<Location, UUID> {

    List<Location> findAllByOrderByNameAsc();
}
