package com.example.fraudrunner.onnx;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class OnnxHeaderReaderTest {

    @Test
    void readsTheSampleModelHeader() throws IOException {
        byte[] bytes = new ClassPathResource("fraud-risk-demo.onnx").getContentAsByteArray();
        OnnxHeader header = OnnxHeaderReader.read(bytes);
        assertThat(header.irVersion()).isEqualTo(9);
        assertThat(header.producerName()).isEqualTo("fraud-runner-samples");
        assertThat(header.graphName()).isEqualTo("fraud_risk_demo");
        assertThat(header.opsets()).extracting(OnnxHeader.Opset::domain).contains("", "ai.onnx.ml");
    }

    @Test
    void rejectsRandomBytes() {
        assertThatThrownBy(() -> OnnxHeaderReader.read("this is not an onnx file".getBytes()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
