package com.smarthr.job.dto.res;

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

    private String skill;
    private Boolean mustHave;
    private Boolean required;
}