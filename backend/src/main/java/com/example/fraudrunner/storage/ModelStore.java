package com.example.fraudrunner.storage;

import java.time.Instant;
import java.util.Optional;

/** Holds the one and only model file. Every upload overwrites the previous model. */
public interface ModelStore {

    record ModelInfo(String version, long sizeBytes, Instant lastModified) {}

    record ModelContent(String version, byte[] bytes) {}

    record UploadLink(String url, Instant expiresAt, String blobName) {}

    Optional<ModelInfo> info();

    ModelContent download();

    /** A short-lived, write-only link that lets the browser upload straight to the model blob. */
    UploadLink createUploadLink();
}
