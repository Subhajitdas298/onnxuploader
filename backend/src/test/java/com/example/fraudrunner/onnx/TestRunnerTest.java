package com.example.fraudrunner.onnx;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import com.example.fraudrunner.InMemoryModelStore;
import com.example.fraudrunner.api.ApiException;
import com.example.fraudrunner.config.AppProperties;
import com.example.fraudrunner.feature.FeatureCatalog;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class TestRunnerTest {

    private static final List<TestRunner.InputMapping> MAPPING = List.of(
            new TestRunner.InputMapping("amount_cents", "amount_cents"),
            new TestRunner.InputMapping("is_international", "is_international"),
            new TestRunner.InputMapping("country", "country_code"));

    private InMemoryModelStore store;
    private TestRunner runner;

    @BeforeEach
    void setUp() throws IOException {
        store = new InMemoryModelStore();
        store.put(new ClassPathResource("fraud-risk-demo.onnx").getContentAsByteArray());
        var props = new AppProperties(null, new AppProperties.Cors(List.of()), new AppProperties.Run(50));
        runner = new TestRunner(new ModelRegistry(store, new ModelAnalyzer()), new Inference(), new FeatureCatalog(), props);
    }

    private static double reference(long cents, boolean intl, String country) {
        double z = -3.2 + 0.7 * Math.log(1 + cents / 100.0 / 50) + (intl ? 1.8 : 0) + (List.of("NG", "RU", "KP", "IR").contains(country) ? 1.5 : 0);
        return 1 / (1 + Math.exp(-z));
    }

    @Test
    void scoresMatchTheModelFormula() {
        var result = runner.run(MAPPING, List.of(
                Map.of("amount_cents", 1250, "is_international", false, "country_code", "US"),
                Map.of("amount_cents", 89900, "is_international", true, "country_code", "NG"),
                Map.of("amount_cents", 45000, "is_international", true, "country_code", "GB")));

        assertThat(result.output()).isEqualTo("risk_score");
        assertThat(result.results()).hasSize(3);
        assertThat(result.results().get(0).score()).isCloseTo(reference(1250, false, "US"), within(1e-5));
        assertThat(result.results().get(1).score()).isCloseTo(reference(89900, true, "NG"), within(1e-5));
        assertThat(result.results().get(2).score()).isCloseTo(reference(45000, true, "GB"), within(1e-5));
    }

    @Test
    void contributionsAreSortedAndReconcileWithTheScore() {
        var result = runner.run(MAPPING, List.of(Map.of("amount_cents", 45000, "is_international", true, "country_code", "GB")));
        var r = result.results().get(0);

        assertThat(r.contributions()).hasSize(3);
        double sum = r.contributions().stream().mapToDouble(TestRunner.Contribution::contribution).sum();
        assertThat(result.baselineScore() + sum).isCloseTo(r.score(), within(1e-6));
        for (int i = 1; i < r.contributions().size(); i++) {
            assertThat(Math.abs(r.contributions().get(i - 1).contribution()))
                    .isGreaterThanOrEqualTo(Math.abs(r.contributions().get(i).contribution()));
        }
        // GB is not a high-risk country, so it should contribute nothing; the other two raise the risk
        assertThat(r.contributions().get(2).feature()).isEqualTo("country_code");
        assertThat(r.contributions().get(2).contribution()).isCloseTo(0.0, within(1e-6));
        assertThat(r.contributions().get(0).contribution()).isPositive();
    }

    @Test
    void rejectsAFeatureOfTheWrongType() {
        var bad = List.of(
                new TestRunner.InputMapping("amount_cents", "is_international"),
                new TestRunner.InputMapping("is_international", "amount_cents"),
                new TestRunner.InputMapping("country", "country_code"));
        assertThatThrownBy(() -> runner.run(bad, List.of(Map.of())))
                .isInstanceOf(ApiException.class).hasMessageContaining("needs");
    }

    @Test
    void rejectsADuplicateFeature() {
        var bad = List.of(
                new TestRunner.InputMapping("amount_cents", "amount_cents"),
                new TestRunner.InputMapping("is_international", "is_international"),
                new TestRunner.InputMapping("country", "currency"),
                new TestRunner.InputMapping("country", "country_code"));
        assertThatThrownBy(() -> runner.run(bad, List.of(Map.of()))).isInstanceOf(ApiException.class);
    }

    @Test
    void rejectsMissingOrWrongValues() {
        assertThatThrownBy(() -> runner.run(MAPPING, List.of(Map.of("amount_cents", 1, "is_international", true))))
                .isInstanceOf(ApiException.class).hasMessageContaining("country_code");
        assertThatThrownBy(() -> runner.run(MAPPING, List.of(Map.of("amount_cents", 1.5, "is_international", true, "country_code", "US"))))
                .isInstanceOf(ApiException.class).hasMessageContaining("whole number");
    }

    @Test
    void needsAtLeastOneTestCase() {
        assertThatThrownBy(() -> runner.run(MAPPING, List.of()))
                .isInstanceOf(ApiException.class).hasMessageContaining("at least one");
    }

    @Test
    void pickingUpANewUploadReloadsTheModel() throws IOException {
        runner.run(MAPPING, List.of(Map.of("amount_cents", 1, "is_international", true, "country_code", "US")));
        store.put("garbage".getBytes());
        assertThatThrownBy(() -> runner.run(MAPPING, List.of(Map.of("amount_cents", 1, "is_international", true, "country_code", "US"))))
                .isInstanceOf(ApiException.class).hasMessageContaining("cannot be run");
    }
}
