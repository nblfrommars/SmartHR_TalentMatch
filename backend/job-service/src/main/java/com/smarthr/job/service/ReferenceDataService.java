package com.smarthr.job.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.smarthr.job.dto.res.IndustryRes;
import com.smarthr.job.dto.res.LocationRes;
import com.smarthr.job.mapper.JobMapper;
import com.smarthr.job.repo.IndustryRepo;
import com.smarthr.job.repo.LocationRepo;

import lombok.RequiredArgsConstructor;

/** Read-only lookup data (industries, locations) used by job forms and search filters. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReferenceDataService {

    private final IndustryRepo industryRepo;
    private final LocationRepo locationRepo;
    private final JobMapper jobMapper;

    public List<IndustryRes> getIndustries() {
        return industryRepo.findAllByOrderByNameAsc().stream().map(jobMapper::toIndustryResponse).toList();
    }

    public List<LocationRes> getLocations() {
        return locationRepo.findAllByOrderByNameAsc().stream().map(jobMapper::toLocationResponse).toList();
    }
}
