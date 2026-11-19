package com.example.fraudrunner.onnx;

import ai.onnxruntime.OrtException;
import com.example.fraudrunner.api.ApiException;
import com.example.fraudrunner.config.AppProperties;
import com.example.fraudrunner.feature.Feature;
import com.example.fraudrunner.feature.FeatureCatalog;
import com.example.fraudrunner.feature.FeatureKind;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Runs test cases through the current model and explains each score. */
@Service
public class TestRunner {

    public record InputMapping(String input, String feature) {}

    public record Contribution(String feature, Object value, double contribution) {}

    public record CaseResult(double score, List<Contribution> contributions) {}

    public record RunResult(String output, long elapsedMs, double baselineScore, List<CaseResult> results) {}

    private final ModelRegistry registry;
    private final Inference inference;
    private final FeatureCatalog catalog;
    private final AppProperties props;

    public TestRunner(ModelRegistry registry, Inference inference, FeatureCatalog catalog, AppProperties props) {
        this.registry = registry;
        this.inference = inference;
        this.catalog = catalog;
        this.props = props;
    }

    public RunResult run(List<InputMapping> mapping, List<Map<String, Object>> rows) {
        long started = System.nanoTime();
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Add at least one test case.");
        }
        if (rows.size() > props.run().maxRows()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A run can have at most " + props.run().maxRows() + " test cases.");
        }
        LoadedModel model = registry.current();
        Analysis analysis = model.analysis();
        if (!analysis.usable()) {
            throw new ApiException(HttpStatus.CONFLICT, "The uploaded model cannot be run. Check the model analysis first.");
        }

        List<Feature> features = resolveFeatures(analysis, mapping);
        int n = features.size();
        List<Object> baseline = features.stream().map(f -> baselineValue(f)).toList();
        double baselineScore = Double.NaN;

        List<CaseResult> results = new ArrayList<>();
        try {
            for (int r = 0; r < rows.size(); r++) {
                List<Object> actual = new ArrayList<>();
                for (Feature f : features) {
                    actual.add(coerce(f, rows.get(r).get(f.name()), r + 1));
                }
                double[] subsets = new double[1 << n];
                for (int mask = 0; mask < subsets.length; mask++) {
                    List<Object> values = new ArrayList<>(n);
                    for (int i = 0; i < n; i++) {
                        values.add((mask >> i & 1) == 1 ? actual.get(i) : baseline.get(i));
                    }
                    subsets[mask] = inference.score(model, values);
                }
                baselineScore = subsets[0];
                double[] phi = Contributions.shapley(subsets, n);
                List<Contribution> contributions = new ArrayList<>();
                for (int i = 0; i < n; i++) {
                    contributions.add(new Contribution(features.get(i).name(), actual.get(i), phi[i]));
                }
                contributions.sort(Comparator.comparingDouble((Contribution c) -> Math.abs(c.contribution())).reversed());
                results.add(new CaseResult(subsets[subsets.length - 1], contributions));
            }
        } catch (OrtException e) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "The model failed to run: " + firstLine(e.getMessage()));
        }
        long elapsed = (System.nanoTime() - started) / 1_000_000;
        return new RunResult(analysis.scoreOutput(), elapsed, baselineScore, results);
    }

    private List<Feature> resolveFeatures(Analysis analysis, List<InputMapping> mapping) {
        List<Analysis.Input> inputs = analysis.inputs();
        if (mapping.size() != inputs.size()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "The mapping must cover all " + inputs.size() + " model inputs.");
        }
        List<Feature> features = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (Analysis.Input input : inputs) {
            InputMapping m = mapping.stream().filter(x -> x.input().equals(input.name())).findFirst()
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Input \"" + input.name() + "\" has no feature."));
            Feature f = catalog.find(m.feature())
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Unknown feature \"" + m.feature() + "\"."));
            if (f.kind() != input.kind()) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "Feature \"" + f.name() + "\" is " + f.kind().name().toLowerCase() + " but input \"" + input.name() + "\" needs "
                                + input.kind().name().toLowerCase() + ".");
            }
            if (!used.add(f.name())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Feature \"" + f.name() + "\" is used by more than one input.");
            }
            features.add(f);
        }
        return features;
    }

    private static Object baselineValue(Feature f) {
        return coerceValue(f, f.baseline(), "baseline");
    }

    private static Object coerce(Feature f, Object raw, int row) {
        if (raw == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Test case " + row + ": \"" + f.name() + "\" needs a value.");
        }
        try {
            return coerceValue(f, raw, "test case " + row);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Test case " + row + ": " + e.getMessage());
        }
    }

    private static Object coerceValue(Feature f, Object raw, String where) {
        FeatureKind kind = f.kind();
        return switch (kind) {
            case BOOLEAN -> {
                if (raw instanceof Boolean b) yield b;
                throw new IllegalArgumentException("\"" + f.name() + "\" must be true or false.");
            }
            case INTEGER -> {
                if (raw instanceof Number num && num.doubleValue() == Math.rint(num.doubleValue())) yield num.longValue();
                throw new IllegalArgumentException("\"" + f.name() + "\" must be a whole number.");
            }
            case STRING -> {
                if (raw instanceof String s && !s.isBlank()) yield s;
                throw new IllegalArgumentException("\"" + f.name() + "\" must be text.");
            }
        };
    }

    private static String firstLine(String s) {
        if (s == null) return "unknown error";
        int nl = s.indexOf('\n');
        return nl > 0 ? s.substring(0, nl) : s;
    }
}
