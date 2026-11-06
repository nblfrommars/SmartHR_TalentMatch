package com.hr.user.cv.mapper;

import java.util.List;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import com.hr.user.cv.dto.response.UserResponse;
import com.hr.user.cv.entity.User;

@Mapper(componentModel = "spring")
public interface UserMapper {

    @Mapping(target = "active", source = "active")
    UserResponse toResponse(User user);

    List<UserResponse> toResponses(List<User> users);
}
