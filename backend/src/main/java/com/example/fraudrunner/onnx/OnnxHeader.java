package com.example.fraudrunner.onnx;

import java.util.List;

/** Top-level facts stored in an ONNX file, read without loading the model. */
public record OnnxHeader(
        Long irVersion,
        String producerName,
        String producerVersion,
        String domain,
        Long modelVersion,
        String docString,
        String graphName,
        List<Opset> opsets) {

    public record Opset(String domain, long version) {}
}
