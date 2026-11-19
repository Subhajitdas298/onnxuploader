package com.example.fraudrunner.onnx;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.fraudrunner.feature.FeatureKind;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class ModelAnalyzerTest {

    private final ModelAnalyzer analyzer = new ModelAnalyzer();

    @Test
    void describesTheSampleModelInOrder() throws IOException {
        byte[] bytes = new ClassPathResource("fraud-risk-demo.onnx").getContentAsByteArray();
        LoadedModel model = analyzer.load("v1", bytes);
        Analysis a = model.analysis();

        assertThat(a.valid()).isTrue();
        assertThat(a.usable()).isTrue();
        assertThat(a.inputs()).extracting(Analysis.Input::name).containsExactly("amount_cents", "is_international", "country");
        assertThat(a.inputs()).extracting(Analysis.Input::kind)
                .containsExactly(FeatureKind.INTEGER, FeatureKind.BOOLEAN, FeatureKind.STRING);
        assertThat(a.inputs()).extracting(Analysis.Input::tensorType).containsExactly("int64", "bool", "string");
        assertThat(a.scoreOutput()).isEqualTo("risk_score");
        assertThat(a.header().graphName()).isEqualTo("fraud_risk_demo");
    }

    @Test
    void reportsAnInvalidFile() {
        Analysis a = analyzer.load("v1", "definitely not onnx".getBytes()).analysis();
        assertThat(a.valid()).isFalse();
        assertThat(a.error()).isNotBlank();
    }

    @Test
    void reportsAnEmptyFile() {
        assertThat(analyzer.load("v1", new byte[0]).analysis().valid()).isFalse();
    }
}
