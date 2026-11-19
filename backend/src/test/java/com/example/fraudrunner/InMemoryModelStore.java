package com.example.fraudrunner;

import com.example.fraudrunner.storage.ModelStore;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

/** Test double for the blob storage, so tests do not need Azure or Azurite. */
public class InMemoryModelStore implements ModelStore {

    private final AtomicReference<ModelContent> content = new AtomicReference<>();
    private volatile Instant modified = Instant.now();

    public void put(byte[] bytes) {
        content.set(new ModelContent("\"" + UUID.randomUUID() + "\"", bytes));
        modified = Instant.now();
    }

    public void clear() {
        content.set(null);
    }

    @Override
    public Optional<ModelInfo> info() {
        ModelContent c = content.get();
        return c == null ? Optional.empty() : Optional.of(new ModelInfo(c.version(), c.bytes().length, modified));
    }

    @Override
    public ModelContent download() {
        return content.get();
    }

    @Override
    public UploadLink createUploadLink() {
        return new UploadLink("https://example.invalid/models/model.onnx?sig=test", Instant.now().plusSeconds(900), "model.onnx");
    }
}
