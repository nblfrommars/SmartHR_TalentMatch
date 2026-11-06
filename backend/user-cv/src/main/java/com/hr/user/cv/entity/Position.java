package com.hr.user.cv.entity;

import jakarta.persistence.*;

@Entity 
@Table(name = "position")
public class Position {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "code")
    private String code;

    @Column(name = "name")
    private String name;

    @Column(name = "description", columnDefinition= "TEXT")
    private String description;

    @Column(name = "is_active")
    private boolean isActive;
}
