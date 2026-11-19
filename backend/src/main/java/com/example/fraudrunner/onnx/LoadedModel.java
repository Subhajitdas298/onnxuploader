package com.example.fraudrunner.onnx;

import ai.onnxruntime.OnnxJavaType;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * An analyzed model together with its live ONNX Runtime session (null when the file is not valid).
 *
 * <p>The session is reference counted. The registry holds one reference while the model is current, and every
 * running request holds one for as long as it uses the session. A new upload therefore never closes a session that
 * is still in use: it is closed when the last user lets go.
 */
public final class LoadedModel {

    /** The tensor layout of one input, used to build the right ONNX tensor from a plain value. */
    public record TensorSpec(String name, OnnxJavaType type, long[] shape) {}

    private final String version;
    private final Analysis analysis;
    private final OrtSession session;
    private final List<TensorSpec> specs;
    private final AtomicInteger references = new AtomicInteger(1);

    LoadedModel(String version, Analysis analysis, OrtSession session, List<TensorSpec> specs) {
        this.version = version;
        this.analysis = analysis;
        this.session = session;
        this.specs = specs;
    }

    public String version() {
        return version;
    }

    public Analysis analysis() {
        return analysis;
    }

    public OrtSession session() {
        return session;
    }

    public List<TensorSpec> specs() {
        return specs;
    }

    boolean tryAcquire() {
        int n;
        do {
            n = references.get();
            if (n == 0) return false;
        } while (!references.compareAndSet(n, n + 1));
        return true;
    }

    /** Lets go of one reference; the session is closed when nobody holds the model any more. */
    public void release() {
        if (references.decrementAndGet() == 0 && session != null) {
            try {
                session.close();
            } catch (OrtException ignored) {
                // nothing useful to do
            }
        }
    }
}
