package com.example.fraudrunner.config;

import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.BlobServiceClientBuilder;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "app.storage.provider", havingValue = "azure", matchIfMissing = true)
class StorageConfig {

    @Bean
    BlobServiceClient blobServiceClient(AppProperties props) {
        AppProperties.Storage s = props.storage();
        BlobServiceClientBuilder builder = new BlobServiceClientBuilder();
        if (s.usesAccountKey()) {
            return builder.connectionString(s.connectionString()).buildClient();
        }
        if (s.endpoint() == null || s.endpoint().isBlank()) {
            throw new IllegalStateException(
                    "Set STORAGE_CONNECTION_STRING (local) or STORAGE_ENDPOINT (Azure) to configure the model storage.");
        }
        // Picks up the user-assigned managed identity through AZURE_CLIENT_ID, or `az login` locally.
        return builder.endpoint(s.endpoint()).credential(new DefaultAzureCredentialBuilder().build()).buildClient();
    }
}
