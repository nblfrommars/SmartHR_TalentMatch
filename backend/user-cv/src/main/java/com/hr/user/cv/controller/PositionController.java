package com.hr.user.cv.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.hr.user.cv.dto.request.PositionRequest;
import com.hr.user.cv.entity.Position;
import com.hr.user.cv.repository.PositionRepository;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/positions")
@RequiredArgsConstructor
public class PositionController {

    private final PositionRepository positionRepository;

    @GetMapping
    public List<Position> getActivePositions() {
        return positionRepository.findByIsActiveTrue();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public Position create(@Valid @RequestBody PositionRequest request) {
        Position position = new Position();
        apply(position, request);
        position.setActive(true);
        return positionRepository.save(position);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Position update(@PathVariable Long id, @Valid @RequestBody PositionRequest request) {
        Position position = positionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Position not found"));
        apply(position, request);
        return positionRepository.save(position);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(@PathVariable Long id) {
        Position position = positionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Position not found"));
        position.setActive(false);
        positionRepository.save(position);
    }

    private void apply(Position position, PositionRequest request) {
        position.setCode(request.getCode().trim());
        position.setName(request.getName().trim());
        position.setDescription(request.getDescription());
    }

}
