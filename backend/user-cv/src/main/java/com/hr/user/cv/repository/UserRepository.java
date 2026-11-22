package com.hr.user.cv.repository;
import com.hr.user.cv.entity.User;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository 
public interface UserRepository extends JpaRepository<User, UUID>{
    @Query(value = "select * from user where full_name like  %?1% and is_active = 1", nativeQuery = true)
    List<User> findByFullName(String fullName);

    boolean existsByUserName(String userName);

    boolean existsByEmail(String email);
}
