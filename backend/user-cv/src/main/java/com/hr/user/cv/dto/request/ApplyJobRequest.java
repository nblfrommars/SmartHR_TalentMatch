package com.hr.user.cv.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ApplyJobRequest {

    @Size(max = 10000)
    private String coverLetter;
}
