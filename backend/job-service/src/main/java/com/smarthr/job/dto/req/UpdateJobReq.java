package com.smarthr.job.dto.req;

import java.time.Instant;
import java.util.List;

import com.smarthr.job.model.enums.JobLevel;
import com.smarthr.job.model.enums.JobStatus;
import com.smarthr.job.model.enums.JobType;
import com.smarthr.job.model.enums.WorkMode;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
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
public class UpdateJobReq {

    @NotBlank(message = "Tiêu đề công việc không được để trống")
    private String title;

    @NotBlank(message = "Mô tả công việc không được để trống")
    private String description;

    @NotNull(message = "Cấp bậc không được để trống")
    private JobLevel level;

    @NotNull(message = "Loại hình làm việc không được để trống")
    private JobType jobType;

    @NotNull(message = "Chế độ làm việc không được để trống")
    private WorkMode workMode;

    @NotBlank(message = "Địa điểm không được để trống")
    private String location;

    @NotBlank(message = "Ngành nghề không được để trống")
    private String industry;

    @Min(value = 0, message = "Lương tối thiểu phải lớn hơn hoặc bằng 0")
    private Long salaryMin;

    @Min(value = 0, message = "Lương tối đa phải lớn hơn hoặc bằng 0")
    private Long salaryMax;

    private Boolean salaryNegotiable;

    @Min(value = 0, message = "Số năm kinh nghiệm không được âm")
    private Integer yoe;

    @NotNull(message = "Hạn nộp hồ sơ không được để trống")
    @Future(message = "Hạn nộp hồ sơ phải là một thời điểm trong tương lai")
    private Instant deadline;

    @NotNull(message = "Trạng thái không được để trống")
    private JobStatus status;

    @NotEmpty(message = "Danh sách kỹ năng không được để trống")
    @Valid
    private List<JobSkillReq> skills;
}