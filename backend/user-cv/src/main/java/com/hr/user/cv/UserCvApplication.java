package com.hr.user.cv;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class UserCvApplication {

	public static void main(String[] args) {
		SpringApplication.run(UserCvApplication.class, args);
	}

}
