package com.example.fraudrunner;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

@TestConfiguration
public class TestStoreConfig {

    @Bean
    InMemoryModelStore inMemoryModelStore() {
        return new InMemoryModelStore();
    }
}
