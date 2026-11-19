package com.example.fraudrunner.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Storage storage, Cors cors, Run run) {

    /**
     * Where the single model file lives. Use either a connection string (local Azurite, account key SAS)
     * or an endpoint (Azure, managed identity + user delegation SAS).
     */
    public record Storage(
            String provider,
            String connectionString,
            String endpoint,
            String container,
            String blobName,
            Duration sasValidity,
            long maxModelBytes,
            boolean ensureContainer,
            boolean configureCors) {

        public boolean usesAccountKey() {
            return connectionString != null && !connectionString.isBlank();
        }
    }

    public record Cors(List<String> allowedOrigins) {}

    public record Run(int maxRows) {}
}
