package com.hr.user.cv.service;

import java.util.List;
import com.hr.user.cv.entity.User;
import com.hr.user.cv.dto.response.UserResponse;
import com.hr.user.cv.dto.request.CreateUserRequest;
public interface UserService {
    List<User> getAll();
    UserResponse save(CreateUserRequest req);
}
