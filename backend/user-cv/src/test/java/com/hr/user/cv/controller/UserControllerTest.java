package com.hr.user.cv.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Date;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.hr.user.cv.dto.request.CreateUserRequest;
import com.hr.user.cv.dto.response.UserResponse;
import com.hr.user.cv.entity.User;
import com.hr.user.cv.enums.UserRole;
import com.hr.user.cv.mapper.UserMapperImpl;
import com.hr.user.cv.service.UserService;

class UserControllerTest {

    private final UserService userService = mock(UserService.class);
    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new UserController(userService, new UserMapperImpl()))
            .build();

    @Test
    void getAllReturnsMappedUsers() throws Exception {
        User user = new User();
        user.setId(1L);
        user.setUserName("alice");
        user.setFullName("Alice Nguyen");
        user.setDob(new Date(0));
        user.setRole(UserRole.APPLICANT);
        user.setActive(true);

        when(userService.getAll()).thenReturn(List.of(user));

        mockMvc.perform(get("/api/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].userName").value("alice"))
                .andExpect(jsonPath("$[0].fullName").value("Alice Nguyen"))
                .andExpect(jsonPath("$[0].role").value(3))
                .andExpect(jsonPath("$[0].active").value(true));
    }

    @Test
    void createReturns201() throws Exception {
        UserResponse response = new UserResponse();
        response.setId(7L);
        response.setUserName("bob");
        response.setRole(UserRole.HR);
        when(userService.save(any(CreateUserRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userName\":\"bob\",\"role\":2,\"companyId\":\"00000000-0000-0000-0000-000000000001\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.userName").value("bob"));
    }
}
