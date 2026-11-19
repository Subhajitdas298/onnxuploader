package com.example.fraudrunner.onnx;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Minimal protobuf reader for the ONNX ModelProto header (ir_version, producer, opset imports, graph name).
 * ONNX Runtime does not expose these, and reading them also gives a fast "is this even an ONNX file" check.
 */
final class OnnxHeaderReader {

    private OnnxHeaderReader() {}

    static OnnxHeader read(byte[] data) {
        Reader r = new Reader(data);
        Long ir = null;
        Long modelVersion = null;
        String producer = null;
        String producerVersion = null;
        String domain = null;
        String doc = null;
        String graphName = null;
        List<OnnxHeader.Opset> opsets = new ArrayList<>();
        boolean sawGraph = false;

        while (r.hasMore()) {
            long tag = r.varint();
            int field = (int) (tag >>> 3);
            int wire = (int) (tag & 7);
            switch (wire) {
                case 0 -> {
                    long v = r.varint();
                    if (field == 1) ir = v;
                    else if (field == 5) modelVersion = v;
                }
                case 1 -> r.skip(8);
                case 5 -> r.skip(4);
                case 2 -> {
                    byte[] body = r.bytes();
                    switch (field) {
                        case 2 -> producer = text(body);
                        case 3 -> producerVersion = text(body);
                        case 4 -> domain = text(body);
                        case 6 -> doc = text(body);
                        case 7 -> {
                            sawGraph = true;
                            graphName = graphName(body);
                        }
                        case 8 -> opsets.add(opset(body));
                        default -> { }
                    }
                }
                default -> throw new IllegalArgumentException("Unsupported protobuf wire type " + wire);
            }
        }
        if (!sawGraph) {
            throw new IllegalArgumentException("The file has no model graph.");
        }
        return new OnnxHeader(ir, producer, producerVersion, domain, modelVersion, doc, graphName, opsets);
    }

    private static String graphName(byte[] graph) {
        Reader r = new Reader(graph);
        while (r.hasMore()) {
            long tag = r.varint();
            int field = (int) (tag >>> 3);
            int wire = (int) (tag & 7);
            switch (wire) {
                case 0 -> r.varint();
                case 1 -> r.skip(8);
                case 5 -> r.skip(4);
                case 2 -> {
                    byte[] body = r.bytes();
                    if (field == 2) return text(body);
                }
                default -> throw new IllegalArgumentException("Unsupported protobuf wire type " + wire);
            }
        }
        return null;
    }

    private static OnnxHeader.Opset opset(byte[] msg) {
        Reader r = new Reader(msg);
        String domain = "";
        long version = 0;
        while (r.hasMore()) {
            long tag = r.varint();
            int field = (int) (tag >>> 3);
            int wire = (int) (tag & 7);
            switch (wire) {
                case 0 -> {
                    long v = r.varint();
                    if (field == 2) version = v;
                }
                case 1 -> r.skip(8);
                case 5 -> r.skip(4);
                case 2 -> {
                    byte[] body = r.bytes();
                    if (field == 1) domain = text(body);
                }
                default -> throw new IllegalArgumentException("Unsupported protobuf wire type " + wire);
            }
        }
        return new OnnxHeader.Opset(domain, version);
    }

    private static String text(byte[] b) {
        return new String(b, StandardCharsets.UTF_8);
    }

    private static final class Reader {
        private final byte[] data;
        private int pos;

        Reader(byte[] data) {
            this.data = data;
        }

        boolean hasMore() {
            return pos < data.length;
        }

        long varint() {
            long result = 0;
            for (int shift = 0; shift < 70; shift += 7) {
                if (pos >= data.length) throw new IllegalArgumentException("Unexpected end of file.");
                byte b = data[pos++];
                result |= (long) (b & 0x7F) << shift;
                if ((b & 0x80) == 0) return result;
            }
            throw new IllegalArgumentException("Malformed number in file.");
        }

        byte[] bytes() {
            long len = varint();
            if (len < 0 || len > data.length - pos) throw new IllegalArgumentException("Unexpected end of file.");
            byte[] out = new byte[(int) len];
            System.arraycopy(data, pos, out, 0, out.length);
            pos += out.length;
            return out;
        }

        void skip(int n) {
            if (n > data.length - pos) throw new IllegalArgumentException("Unexpected end of file.");
            pos += n;
        }
    }
}
