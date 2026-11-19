package com.example.fraudrunner.onnx;

import com.example.fraudrunner.api.ApiException;
import com.example.fraudrunner.storage.ModelStore;
import jakarta.annotation.PreDestroy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Keeps the analyzed model in memory and reloads it from storage when a new file has been uploaded. */
@Service
public class ModelRegistry {

    private final ModelStore store;
    private final ModelAnalyzer analyzer;
    private LoadedModel cached;

    public ModelRegistry(ModelStore store, ModelAnalyzer analyzer) {
        this.store = store;
        this.analyzer = analyzer;
    }

    /** The analysis of the stored model. */
    public Analysis analysis() {
        LoadedModel model = lease();
        try {
            return model.analysis();
        } finally {
            model.release();
        }
    }

    /** The current model, kept alive until {@link LoadedModel#release()} is called. */
    public synchronized LoadedModel lease() {
        var info = store.info().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No model has been uploaded yet."));
        if (cached == null || !cached.version().equals(info.version())) {
            var content = store.download();
            LoadedModel loaded = analyzer.load(content.version(), content.bytes());
            LoadedModel old = cached;
            cached = loaded;
            if (old != null) old.release();
        }
        if (!cached.tryAcquire()) {
            throw new IllegalStateException("The model was released while it was current.");
        }
        return cached;
    }

    @PreDestroy
    synchronized void shutdown() {
        if (cached != null) {
            cached.release();
            cached = null;
        }
    }
}
