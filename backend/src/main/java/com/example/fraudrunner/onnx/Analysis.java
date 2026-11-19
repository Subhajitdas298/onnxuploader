package com.example.fraudrunner.onnx;

import com.example.fraudrunner.feature.FeatureKind;
import java.util.List;

/** What the system found out about an uploaded model. {@code kind} is null for inputs it cannot feed. */
public record Analysis(
        boolean valid,
        String error,
        String version,
        OnnxHeader header,
        List<Input> inputs,
        List<Output> outputs,
        String scoreOutput,
        List<String> problems) {

    public record Input(
            int index, String name, String tensorType, FeatureKind kind, List<Long> shape, boolean supported, String problem) {}

    public record Output(String name, String tensorType, List<Long> shape, boolean score) {}

    public static Analysis invalid(String version, String error) {
        return new Analysis(false, error, version, null, List.of(), List.of(), null, List.of());
    }

    public boolean usable() {
        return valid && problems.isEmpty() && inputs.stream().allMatch(Input::supported);
    }
}
