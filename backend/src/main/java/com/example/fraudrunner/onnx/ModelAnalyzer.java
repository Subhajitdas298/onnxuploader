package com.example.fraudrunner.onnx;

import ai.onnxruntime.NodeInfo;
import ai.onnxruntime.OnnxJavaType;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.TensorInfo;
import ai.onnxruntime.ValueInfo;
import com.example.fraudrunner.feature.FeatureKind;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Validates an ONNX file and describes its inputs and outputs. */
@Component
public class ModelAnalyzer {

    private static final String PREFERRED_OUTPUT = "risk_score";

    private final OrtEnvironment env = OrtEnvironment.getEnvironment();

    public LoadedModel load(String version, byte[] bytes) {
        OnnxHeader header;
        try {
            header = OnnxHeaderReader.read(bytes);
        } catch (RuntimeException e) {
            return new LoadedModel(version, Analysis.invalid(version, "This is not an ONNX file. " + e.getMessage()), null, List.of());
        }

        OrtSession session;
        try (OrtSession.SessionOptions options = new OrtSession.SessionOptions()) {
            session = env.createSession(bytes, options);
        } catch (OrtException e) {
            return new LoadedModel(version, Analysis.invalid(version, "The model could not be loaded: " + clean(e.getMessage())), null, List.of());
        }

        try {
            List<Analysis.Input> inputs = new ArrayList<>();
            List<LoadedModel.TensorSpec> specs = new ArrayList<>();
            int index = 0;
            for (Map.Entry<String, NodeInfo> e : session.getInputInfo().entrySet()) {
                inputs.add(describeInput(index++, e.getKey(), e.getValue().getInfo()));
                specs.add(spec(e.getKey(), e.getValue().getInfo()));
            }

            List<Analysis.Output> outputs = new ArrayList<>();
            List<String> problems = new ArrayList<>();
            String scoreOutput = pickScoreOutput(session, outputs, problems);
            if (inputs.isEmpty()) {
                problems.add("The model has no inputs.");
            }
            Analysis analysis = new Analysis(true, null, version, header, inputs, outputs, scoreOutput, problems);
            return new LoadedModel(version, analysis, session, specs);
        } catch (OrtException e) {
            try {
                session.close();
            } catch (OrtException ignored) {
                // already failing; nothing more to release
            }
            return new LoadedModel(version, Analysis.invalid(version, "The model could not be inspected: " + clean(e.getMessage())), null, List.of());
        }
    }

    private static Analysis.Input describeInput(int index, String name, ValueInfo info) {
        if (!(info instanceof TensorInfo t)) {
            return new Analysis.Input(index, name, "non-tensor", null, List.of(), false, "Only tensor inputs are supported.");
        }
        String tensorType = typeName(t.type);
        List<Long> shape = shape(t.getShape());
        FeatureKind kind = switch (t.type) {
            case BOOL -> FeatureKind.BOOLEAN;
            case INT32, INT64 -> FeatureKind.INTEGER;
            case STRING -> FeatureKind.STRING;
            default -> null;
        };
        if (kind == null) {
            return new Analysis.Input(index, name, tensorType, null, shape, false,
                    "tensor(" + tensorType + ") is not supported. Inputs must be bool, int32, int64 or string.");
        }
        if (elementCount(t.getShape()) != 1) {
            return new Analysis.Input(index, name, tensorType, kind, shape, false,
                    "Each input must hold a single value, but this one has shape " + shape + ".");
        }
        return new Analysis.Input(index, name, tensorType, kind, shape, true, null);
    }

    private static LoadedModel.TensorSpec spec(String name, ValueInfo info) {
        if (info instanceof TensorInfo t) {
            long[] shape = t.getShape().clone();
            for (int i = 0; i < shape.length; i++) {
                if (shape[i] < 0) shape[i] = 1;
            }
            return new LoadedModel.TensorSpec(name, t.type, shape);
        }
        return new LoadedModel.TensorSpec(name, OnnxJavaType.UNKNOWN, new long[0]);
    }

    private static String pickScoreOutput(OrtSession session, List<Analysis.Output> outputs, List<String> problems) throws OrtException {
        String chosen = null;
        List<Object[]> raw = new ArrayList<>();
        for (Map.Entry<String, NodeInfo> e : session.getOutputInfo().entrySet()) {
            String type = "non-tensor";
            List<Long> shape = List.of();
            boolean candidate = false;
            if (e.getValue().getInfo() instanceof TensorInfo t) {
                type = typeName(t.type);
                shape = shape(t.getShape());
                candidate = (t.type == OnnxJavaType.FLOAT || t.type == OnnxJavaType.DOUBLE) && elementCount(t.getShape()) == 1;
            }
            raw.add(new Object[] {e.getKey(), type, shape, candidate});
            if (candidate && (chosen == null || PREFERRED_OUTPUT.equals(e.getKey()))) {
                chosen = e.getKey();
            }
        }
        for (Object[] o : raw) {
            @SuppressWarnings("unchecked")
            List<Long> shape = (List<Long>) o[2];
            outputs.add(new Analysis.Output((String) o[0], (String) o[1], shape, o[0].equals(chosen)));
        }
        if (chosen == null) {
            problems.add("The model needs one float output holding a single risk score.");
        }
        return chosen;
    }

    private static long elementCount(long[] shape) {
        long n = 1;
        for (long d : shape) n *= d < 0 ? 1 : d;
        return n;
    }

    private static List<Long> shape(long[] shape) {
        List<Long> out = new ArrayList<>();
        for (long d : shape) out.add(d);
        return out;
    }

    private static String typeName(OnnxJavaType t) {
        return t == OnnxJavaType.BOOL ? "bool" : t.name().toLowerCase(Locale.ROOT);
    }

    private static String clean(String message) {
        if (message == null) return "unknown error";
        int nl = message.indexOf('\n');
        return nl > 0 ? message.substring(0, nl) : message;
    }
}
