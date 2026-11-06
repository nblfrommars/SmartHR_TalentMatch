package com.hr.user.cv.service;

import java.util.List;
import com.hr.user.cv.entity.User;
import com.hr.user.cv.dto.response.UserResponse;
import com.hr.user.cv.dto.request.CreateUserRequest;
import com.hr.user.cv.dto.request.RegisterUserRequest;
public interface UserService {
    List<User> getAll();
    UserResponse save(CreateUserRequest req);
    UserResponse register(RegisterUserRequest req);
}
