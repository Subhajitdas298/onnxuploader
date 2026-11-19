package com.example.fraudrunner.onnx;

import ai.onnxruntime.OnnxJavaType;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import java.nio.ByteBuffer;
import java.nio.IntBuffer;
import java.nio.LongBuffer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Runs a loaded model once for one set of input values. Values are Boolean, Long or String, in model input order. */
@Component
public class Inference {

    private final OrtEnvironment env = OrtEnvironment.getEnvironment();

    public double score(LoadedModel model, List<Object> values) throws OrtException {
        List<LoadedModel.TensorSpec> specs = model.specs();
        Map<String, OnnxTensor> tensors = new LinkedHashMap<>();
        try {
            for (int i = 0; i < specs.size(); i++) {
                tensors.put(specs.get(i).name(), tensor(specs.get(i), values.get(i)));
            }
            String output = model.analysis().scoreOutput();
            try (OrtSession.Result result = model.session().run(tensors, java.util.Set.of(output))) {
                OnnxTensor out = (OnnxTensor) result.get(0);
                return out.getInfo().type == OnnxJavaType.DOUBLE
                        ? out.getDoubleBuffer().get(0)
                        : out.getFloatBuffer().get(0);
            }
        } finally {
            tensors.values().forEach(OnnxTensor::close);
        }
    }

    private OnnxTensor tensor(LoadedModel.TensorSpec spec, Object value) throws OrtException {
        long[] shape = spec.shape();
        return switch (spec.type()) {
            case BOOL -> OnnxTensor.createTensor(env, ByteBuffer.wrap(new byte[] {(byte) ((Boolean) value ? 1 : 0)}), shape, OnnxJavaType.BOOL);
            case INT32 -> OnnxTensor.createTensor(env, IntBuffer.wrap(new int[] {Math.toIntExact((Long) value)}), shape);
            case INT64 -> OnnxTensor.createTensor(env, LongBuffer.wrap(new long[] {(Long) value}), shape);
            case STRING -> OnnxTensor.createTensor(env, new String[] {(String) value}, shape);
            default -> throw new OrtException("Unsupported input type " + spec.type());
        };
    }
}
