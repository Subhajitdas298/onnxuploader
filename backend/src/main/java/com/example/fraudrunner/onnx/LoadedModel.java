package com.example.fraudrunner.onnx;

import ai.onnxruntime.OnnxJavaType;
import ai.onnxruntime.OrtSession;
import java.util.List;

/** An analyzed model together with its live ONNX Runtime session (null when the file is not valid). */
public record LoadedModel(String version, Analysis analysis, OrtSession session, List<TensorSpec> specs) {

    /** The tensor layout of one input, used to build the right ONNX tensor from a plain value. */
    public record TensorSpec(String name, OnnxJavaType type, long[] shape) {}
}
