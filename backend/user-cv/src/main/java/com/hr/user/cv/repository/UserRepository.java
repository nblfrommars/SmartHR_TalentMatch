package com.hr.user.cv.repository;
import org.springframework.data.repository.NoRepositoryBean;
import com.hr.user.cv.entity.User;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import jakarta.persistence.*;
import java.util.List;

@Repository 
public interface UserRepository extends JpaRepository<User, Long>{
    @Query(value = "select * from user where full_name like  %?1% and is_active = 1", nativeQuery = true)
    List<User> findByFullName(String fullName);

    boolean existsByUserName(String userName);
}
