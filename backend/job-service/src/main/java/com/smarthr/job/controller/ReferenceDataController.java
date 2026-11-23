package com.smarthr.job.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.smarthr.job.dto.res.IndustryRes;
import com.smarthr.job.dto.res.LocationRes;
import com.smarthr.job.service.ReferenceDataService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ReferenceDataController {

    private final ReferenceDataService referenceDataService;

    /** Flat list; clients build the tree from parentId. */
    @GetMapping("/industries")
    public ResponseEntity<List<IndustryRes>> getIndustries() {
        return ResponseEntity.ok(referenceDataService.getIndustries());
    }

    /** Flat list; provinces have parentId == null, areas point to their province. */
    @GetMapping("/locations")
    public ResponseEntity<List<LocationRes>> getLocations() {
        return ResponseEntity.ok(referenceDataService.getLocations());
    }
}
