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

    public synchronized LoadedModel current() {
        var info = store.info().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No model has been uploaded yet."));
        if (cached != null && cached.version().equals(info.version())) {
            return cached;
        }
        var content = store.download();
        LoadedModel loaded = analyzer.load(content.version(), content.bytes());
        close(cached);
        cached = loaded;
        return loaded;
    }

    @PreDestroy
    synchronized void shutdown() {
        close(cached);
        cached = null;
    }

    private static void close(LoadedModel m) {
        if (m != null && m.session() != null) {
            try {
                m.session().close();
            } catch (Exception ignored) {
                // nothing useful to do
            }
        }
    }
}
