package com.example.fraudrunner;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class FraudRunnerApplication {
    public static void main(String[] args) {
        SpringApplication.run(FraudRunnerApplication.class, args);
    }
}
