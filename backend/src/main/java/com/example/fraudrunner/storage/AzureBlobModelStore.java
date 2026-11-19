package com.example.fraudrunner.storage;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.models.BlobProperties;
import com.azure.storage.blob.models.BlobStorageException;
import com.azure.storage.blob.models.BlobCorsRule;
import com.azure.storage.blob.models.BlobServiceProperties;
import com.azure.storage.blob.models.UserDelegationKey;
import com.azure.storage.blob.sas.BlobSasPermission;
import com.azure.storage.blob.sas.BlobServiceSasSignatureValues;
import com.azure.storage.common.sas.SasProtocol;
import com.example.fraudrunner.api.ApiException;
import com.example.fraudrunner.config.AppProperties;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(name = "app.storage.provider", havingValue = "azure", matchIfMissing = true)
class AzureBlobModelStore implements ModelStore {

    private static final Logger log = LoggerFactory.getLogger(AzureBlobModelStore.class);

    private final BlobServiceClient service;
    private final BlobContainerClient container;
    private final BlobClient blob;
    private final AppProperties.Storage config;
    private final List<String> corsOrigins;

    AzureBlobModelStore(BlobServiceClient service, AppProperties props) {
        this.service = service;
        this.config = props.storage();
        this.corsOrigins = props.cors().allowedOrigins();
        this.container = service.getBlobContainerClient(config.container());
        this.blob = container.getBlobClient(config.blobName());
    }

    /** Creates the container (and, for local Azurite only, CORS rules) so a fresh environment works out of the box. */
    @EventListener(ApplicationReadyEvent.class)
    void prepare() {
        try {
            if (config.ensureContainer()) {
                container.createIfNotExists();
            }
            if (config.configureCors()) {
                BlobServiceProperties p = service.getProperties();
                p.setCors(List.of(new BlobCorsRule()
                        .setAllowedOrigins(String.join(",", corsOrigins))
                        .setAllowedMethods("GET,PUT,HEAD,OPTIONS")
                        .setAllowedHeaders("*")
                        .setExposedHeaders("*")
                        .setMaxAgeInSeconds(3600)));
                service.setProperties(p);
            }
        } catch (RuntimeException e) {
            log.warn("Could not prepare model storage: {}", e.getMessage());
        }
    }

    @Override
    public Optional<ModelInfo> info() {
        try {
            BlobProperties p = blob.getProperties();
            return Optional.of(new ModelInfo(p.getETag(), p.getBlobSize(), p.getLastModified().toInstant()));
        } catch (BlobStorageException e) {
            if (e.getStatusCode() == 404) {
                return Optional.empty();
            }
            throw e;
        }
    }

    @Override
    public ModelContent download() {
        try {
            long size = blob.getProperties().getBlobSize();
            if (size > config.maxModelBytes()) {
                throw new ApiException(HttpStatus.CONTENT_TOO_LARGE,
                        "The model is larger than the " + (config.maxModelBytes() / 1_048_576) + " MB limit.");
            }
            var response = blob.downloadContentWithResponse(null, null, null, null);
            return new ModelContent(response.getDeserializedHeaders().getETag(), response.getValue().toBytes());
        } catch (BlobStorageException e) {
            if (e.getStatusCode() == 404) {
                throw new ApiException(HttpStatus.NOT_FOUND, "No model has been uploaded yet.");
            }
            throw e;
        }
    }

    @Override
    public UploadLink createUploadLink() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime start = now.minusMinutes(5);
        OffsetDateTime expiry = now.plus(config.sasValidity());
        BlobSasPermission permission = new BlobSasPermission().setCreatePermission(true).setWritePermission(true);
        // Real Azure endpoints are https only, so the link must not work over plain http. Local Azurite is http.
        SasProtocol protocol = blob.getBlobUrl().startsWith("https://") ? SasProtocol.HTTPS_ONLY : SasProtocol.HTTPS_HTTP;
        BlobServiceSasSignatureValues values =
                new BlobServiceSasSignatureValues(expiry, permission).setStartTime(start).setProtocol(protocol);

        String sas;
        if (config.usesAccountKey()) {
            sas = blob.generateSas(values);
        } else {
            UserDelegationKey key = service.getUserDelegationKey(start, expiry);
            sas = blob.generateUserDelegationSas(values, key);
        }
        return new UploadLink(blob.getBlobUrl() + "?" + sas, expiry.toInstant(), config.blobName());
    }
}
