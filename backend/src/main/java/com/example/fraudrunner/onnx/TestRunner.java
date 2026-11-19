package com.example.fraudrunner.onnx;

import ai.onnxruntime.OnnxJavaType;
import ai.onnxruntime.OrtException;
import com.example.fraudrunner.api.ApiException;
import com.example.fraudrunner.config.AppProperties;
import com.example.fraudrunner.feature.Feature;
import com.example.fraudrunner.feature.FeatureCatalog;
import java.math.BigDecimal;
import java.math.BigInteger;
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

    /** Longest text value accepted for a string feature. */
    static final int MAX_TEXT_LENGTH = 256;

    /** Whole numbers above this cannot be represented exactly by every JSON client. */
    private static final double MAX_EXACT_DOUBLE = 9_007_199_254_740_992.0;

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
        LoadedModel model = registry.lease();
        try {
            return execute(model, mapping, rows, started);
        } finally {
            model.release();
        }
    }

    private RunResult execute(LoadedModel model, List<InputMapping> mapping, List<Map<String, Object>> rows, long started) {
        Analysis analysis = model.analysis();
        if (!analysis.usable()) {
            throw new ApiException(HttpStatus.CONFLICT, "The uploaded model cannot be run. Check the model analysis first.");
        }

        List<Feature> features = resolveFeatures(analysis, mapping);
        int n = features.size();
        List<Object> baseline = features.stream().map(f -> coerceValue(f, f.baseline())).toList();
        double baselineScore = Double.NaN;

        List<CaseResult> results = new ArrayList<>();
        try {
            for (int r = 0; r < rows.size(); r++) {
                List<Object> actual = new ArrayList<>();
                for (int i = 0; i < n; i++) {
                    actual.add(coerce(features.get(i), model.specs().get(i), rows.get(r).get(features.get(i).name()), r + 1));
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
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "The model failed to run: " + firstLine(e.getMessage()));
        }
        long elapsed = (System.nanoTime() - started) / 1_000_000;
        return new RunResult(analysis.scoreOutput(), elapsed, baselineScore, results);
    }

    /** Pairs every model input, in model order, with the feature chosen for it. */
    private List<Feature> resolveFeatures(Analysis analysis, List<InputMapping> mapping) {
        List<Analysis.Input> inputs = analysis.inputs();
        if (mapping.size() != inputs.size()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "The mapping must cover all " + inputs.size() + " model inputs.");
        }
        Set<String> seenInputs = new HashSet<>();
        for (InputMapping m : mapping) {
            if (!seenInputs.add(m.input())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Input \"" + m.input() + "\" appears more than once in the mapping.");
            }
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

    private static Object coerce(Feature f, LoadedModel.TensorSpec spec, Object raw, int row) {
        if (raw == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Test case " + row + ": \"" + f.name() + "\" needs a value.");
        }
        Object value;
        try {
            value = coerceValue(f, raw);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Test case " + row + ": " + e.getMessage());
        }
        if (spec.type() == OnnxJavaType.INT32 && value instanceof Long l && (l < Integer.MIN_VALUE || l > Integer.MAX_VALUE)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Test case " + row + ": \"" + f.name() + "\" is outside the range this model accepts (-2147483648 to 2147483647).");
        }
        return value;
    }

    private static Object coerceValue(Feature f, Object raw) {
        return switch (f.kind()) {
            case BOOLEAN -> {
                if (raw instanceof Boolean b) yield b;
                throw new IllegalArgumentException("\"" + f.name() + "\" must be true or false.");
            }
            case INTEGER -> toLong(f, raw);
            case STRING -> {
                if (!(raw instanceof String s) || s.isBlank()) {
                    throw new IllegalArgumentException("\"" + f.name() + "\" must be text.");
                }
                if (s.length() > MAX_TEXT_LENGTH) {
                    throw new IllegalArgumentException("\"" + f.name() + "\" is longer than " + MAX_TEXT_LENGTH + " characters.");
                }
                yield s;
            }
        };
    }

    private static long toLong(Feature f, Object raw) {
        String whole = "\"" + f.name() + "\" must be a whole number.";
        String range = "\"" + f.name() + "\" is too large. Use a whole number that fits in 64 bits.";
        try {
            if (raw instanceof Byte || raw instanceof Short || raw instanceof Integer || raw instanceof Long) {
                return ((Number) raw).longValue();
            }
            if (raw instanceof BigInteger b) return b.longValueExact();
            if (raw instanceof BigDecimal d) return d.toBigIntegerExact().longValueExact();
            if (raw instanceof Double || raw instanceof Float) {
                double d = ((Number) raw).doubleValue();
                if (Double.isNaN(d) || Double.isInfinite(d) || d != Math.rint(d)) throw new IllegalArgumentException(whole);
                if (Math.abs(d) > MAX_EXACT_DOUBLE) throw new IllegalArgumentException(range);
                return (long) d;
            }
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException(raw instanceof BigDecimal d && d.scale() > 0 ? whole : range);
        }
        throw new IllegalArgumentException(whole);
    }

    private static String firstLine(String s) {
        if (s == null) return "unknown error";
        int nl = s.indexOf('\n');
        return nl > 0 ? s.substring(0, nl) : s;
    }
}
