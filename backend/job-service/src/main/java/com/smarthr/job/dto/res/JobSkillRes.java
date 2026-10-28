package com.smarthr.job.dto.res;

import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobSkillRes {

    private UUID id;
    private String skillName;
    private Boolean mustHave;
    private Boolean required;
}