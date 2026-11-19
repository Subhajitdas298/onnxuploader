package com.example.fraudrunner.onnx;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.fraudrunner.Fixtures;
import com.example.fraudrunner.feature.FeatureKind;
import org.junit.jupiter.api.Test;

/** How the analyzer describes models with unusual shapes. */
class FixtureModelsTest {

    private final ModelAnalyzer analyzer = new ModelAnalyzer();

    private Analysis analyze(String name) {
        return analyzer.load("v", Fixtures.fixture(name)).analysis();
    }

    @Test
    void allTenFeaturesKeepTheModelOrderAndMixedIntegerWidths() {
        Analysis a = analyze("all_features");
        assertThat(a.usable()).isTrue();
        assertThat(a.inputs()).extracting(Analysis.Input::name).containsExactly(
                "channel", "currency", "country_code", "txn_count_24h", "merchant_category_code",
                "account_age_days", "amount_cents", "is_card_present", "is_new_device", "is_international");
        assertThat(a.inputs()).extracting(Analysis.Input::tensorType)
                .containsExactly("string", "string", "string", "int32", "int64", "int64", "int64", "bool", "bool", "bool");
        assertThat(a.inputs()).extracting(Analysis.Input::kind).containsExactly(
                FeatureKind.STRING, FeatureKind.STRING, FeatureKind.STRING, FeatureKind.INTEGER, FeatureKind.INTEGER,
                FeatureKind.INTEGER, FeatureKind.INTEGER, FeatureKind.BOOLEAN, FeatureKind.BOOLEAN, FeatureKind.BOOLEAN);
    }

    @Test
    void aFloatInputIsReportedAsNotSupported() {
        Analysis a = analyze("float_input");
        assertThat(a.valid()).isTrue();
        assertThat(a.usable()).isFalse();
        Analysis.Input amount = a.inputs().get(0);
        assertThat(amount.supported()).isFalse();
        assertThat(amount.kind()).isNull();
        assertThat(amount.problem()).contains("not supported");
        assertThat(a.inputs().get(1).supported()).isTrue();
    }

    @Test
    void anInputHoldingSeveralValuesIsReportedAsNotSupported() {
        Analysis a = analyze("vector_input");
        assertThat(a.usable()).isFalse();
        assertThat(a.inputs().get(0).kind()).isEqualTo(FeatureKind.INTEGER);
        assertThat(a.inputs().get(0).supported()).isFalse();
        assertThat(a.inputs().get(0).problem()).contains("single value");
    }

    @Test
    void aModelWithoutAFloatOutputIsNotUsable() {
        Analysis a = analyze("int_output");
        assertThat(a.valid()).isTrue();
        assertThat(a.scoreOutput()).isNull();
        assertThat(a.problems()).anyMatch(p -> p.contains("float output"));
        assertThat(a.usable()).isFalse();
    }

    @Test
    void aModelWithoutInputsIsNotUsable() {
        Analysis a = analyze("no_inputs");
        assertThat(a.valid()).isTrue();
        assertThat(a.problems()).contains("The model has no inputs.");
        assertThat(a.usable()).isFalse();
    }

    @Test
    void riskScoreWinsOverAnEarlierFloatOutput() {
        Analysis a = analyze("two_outputs");
        assertThat(a.outputs()).extracting(Analysis.Output::name).containsExactly("debug", "risk_score");
        assertThat(a.scoreOutput()).isEqualTo("risk_score");
    }

    @Test
    void aDoubleOutputWithAnyNameIsAccepted() {
        Analysis a = analyze("double_output");
        assertThat(a.scoreOutput()).isEqualTo("score");
        assertThat(a.usable()).isTrue();
    }

    @Test
    void dynamicAndScalarShapesAreSingleValues() {
        assertThat(analyze("dynamic_dims").usable()).isTrue();
        assertThat(analyze("scalar_input").usable()).isTrue();
        assertThat(analyze("scalar_input").inputs().get(0).shape()).isEmpty();
    }

    @Test
    void truncatedAndCorruptedFilesAreInvalidRatherThanFailing() {
        byte[] good = Fixtures.sample();
        byte[] truncated = java.util.Arrays.copyOf(good, good.length / 2);
        assertThat(analyzer.load("v", truncated).analysis().valid()).isFalse();

        byte[] corrupted = good.clone();
        for (int i = 40; i < 140; i++) corrupted[i] = (byte) 0xFF;
        assertThat(analyzer.load("v", corrupted).analysis().valid()).isFalse();

        assertThat(analyzer.load("v", new byte[] {0x08, 0x09}).analysis().valid()).isFalse();
        assertThat(analyzer.load("v", "{\"json\": true}".getBytes()).analysis().valid()).isFalse();
    }
}
