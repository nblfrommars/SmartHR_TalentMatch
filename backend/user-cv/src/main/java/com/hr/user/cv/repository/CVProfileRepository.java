package com.hr.user.cv.repository;
import org.springframework.data.repository.NoRepositoryBean;
import com.hr.user.cv.entity.CVProfile;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import jakarta.persistence.*;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.util.Date;
import java.util.List;
import java.util.Optional;

@Repository 
public interface CVProfileRepository extends JpaRepository<CVProfile, Long>{
    @Query(value = "select * from cv_profile left join user on cv_profile.user_id = user.id " + 
        "where user.is_active = 1", nativeQuery = true)
    List<CVProfile> findAllActive();

}
