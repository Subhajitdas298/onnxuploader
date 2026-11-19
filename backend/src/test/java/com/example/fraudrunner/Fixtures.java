package com.example.fraudrunner;

import java.io.IOException;
import org.springframework.core.io.ClassPathResource;

/** Loads the ONNX files used by the tests: the shipped sample model and the generated edge-case fixtures. */
public final class Fixtures {

    private Fixtures() {}

    public static byte[] sample() {
        return read("fraud-risk-demo.onnx");
    }

    public static byte[] fixture(String name) {
        return read("fixtures/" + name + ".onnx");
    }

    private static byte[] read(String path) {
        try {
            return new ClassPathResource(path).getContentAsByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Missing test resource " + path, e);
        }
    }
}
