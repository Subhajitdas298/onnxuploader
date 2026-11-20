package com.example.fraudrunner.onnx;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import com.example.fraudrunner.Fixtures;
import com.example.fraudrunner.InMemoryModelStore;
import com.example.fraudrunner.api.ApiException;
import com.example.fraudrunner.config.AppProperties;
import com.example.fraudrunner.feature.FeatureCatalog;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Running models with unusual shapes and awkward values. */
class TestRunnerFixturesTest {

    private InMemoryModelStore store;
    private TestRunner runner;

    @BeforeEach
    void setUp() {
        store = new InMemoryModelStore();
        var props = new AppProperties(null, new AppProperties.Cors(List.of()), new AppProperties.Run(50));
        runner = new TestRunner(new ModelRegistry(store, new ModelAnalyzer()), new Inference(), new FeatureCatalog(), props);
    }

    private static List<TestRunner.InputMapping> map(String... inputAndFeature) {
        List<TestRunner.InputMapping> m = new ArrayList<>();
        for (int i = 0; i < inputAndFeature.length; i += 2) m.add(new TestRunner.InputMapping(inputAndFeature[i], inputAndFeature[i + 1]));
        return m;
    }

    private static final List<TestRunner.InputMapping> ALL_TEN = map(
            "channel", "channel", "currency", "currency", "country_code", "country_code", "txn_count_24h", "txn_count_24h",
            "merchant_category_code", "merchant_category_code", "account_age_days", "account_age_days", "amount_cents", "amount_cents",
            "is_card_present", "is_card_present", "is_new_device", "is_new_device", "is_international", "is_international");

    private static Map<String, Object> allTenRow() {
        Map<String, Object> row = new HashMap<>();
        row.put("channel", "ATM");
        row.put("currency", "BTC");
        row.put("country_code", "NG");
        row.put("txn_count_24h", 5);
        row.put("merchant_category_code", 6011);
        row.put("account_age_days", 10);
        row.put("amount_cents", 100000);
        row.put("is_card_present", false);
        row.put("is_new_device", true);
        row.put("is_international", true);
        return row;
    }


    /** Runs rows without caring about the expected score: expected 0 with a tolerance that always passes. */
    private TestRunner.RunResult runRows(List<TestRunner.InputMapping> mapping, List<Map<String, Object>> rows) {
        return runner.run(mapping, 1e9, rows.stream().map(r -> new TestRunner.TestCase(r, 0.0)).toList());
    }

    @Test
    void allTenFeaturesGiveExactContributionsForAnAdditiveModel() {
        store.put(Fixtures.fixture("all_features"));
        var result = runRows(ALL_TEN, List.of(allTenRow()));
        var r = result.results().get(0);

        // The model is a plain sum, so each feature's contribution is (its term) - (its term at the baseline value).
        Map<String, Double> expected = Map.of(
                "channel", 0.1, "currency", 0.3, "country_code", 0.25, "txn_count_24h", 0.04, "merchant_category_code", 0.006,
                "account_age_days", -0.0355, "amount_cents", 0.975, "is_card_present", 0.05, "is_new_device", 0.1, "is_international", 0.2);
        assertThat(r.contributions()).hasSize(10);
        for (var c : r.contributions()) {
            assertThat(c.contribution()).as(c.feature()).isCloseTo(expected.get(c.feature()), within(1e-4));
        }
        for (int i = 1; i < 10; i++) {
            assertThat(Math.abs(r.contributions().get(i - 1).contribution())).isGreaterThanOrEqualTo(Math.abs(r.contributions().get(i).contribution()));
        }
        assertThat(r.contributions().get(0).feature()).isEqualTo("amount_cents");
        assertThat(r.contributions().get(9).feature()).isEqualTo("merchant_category_code");
        double sum = r.contributions().stream().mapToDouble(TestRunner.Contribution::contribution).sum();
        assertThat(result.baselineScore() + sum).isCloseTo(r.score(), within(1e-4));
    }

    @Test
    void mappingOrderInTheRequestDoesNotMatter() {
        store.put(Fixtures.fixture("all_features"));
        List<TestRunner.InputMapping> shuffled = new ArrayList<>(ALL_TEN);
        java.util.Collections.reverse(shuffled);
        var a = runRows(ALL_TEN, List.of(allTenRow())).results().get(0).score();
        var b = runRows(shuffled, List.of(allTenRow())).results().get(0).score();
        assertThat(b).isEqualTo(a);
    }

    @Test
    void fiftyRowsOfTenFeaturesFinishInReasonableTime() {
        store.put(Fixtures.fixture("all_features"));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            Map<String, Object> row = allTenRow();
            row.put("amount_cents", 1000 * (i + 1));
            rows.add(row);
        }
        long t = System.nanoTime();
        var result = runRows(ALL_TEN, rows);
        long ms = (System.nanoTime() - t) / 1_000_000;
        System.out.println("50 rows x 10 features = 51,200 model runs in " + ms + " ms");
        assertThat(result.results()).hasSize(50);
        assertThat(ms).isLessThan(60_000);
    }

    @Test
    void int32InputsRejectValuesOutsideTheirRange() {
        store.put(Fixtures.fixture("int32_input"));
        var mapping = map("txn_count_24h", "txn_count_24h");
        assertThat(runRows(mapping, List.of(Map.of("txn_count_24h", 2_147_483_647L))).results()).hasSize(1);
        assertThat(runRows(mapping, List.of(Map.of("txn_count_24h", -2_147_483_648L))).results()).hasSize(1);
        assertThatThrownBy(() -> runRows(mapping, List.of(Map.of("txn_count_24h", 2_147_483_648L))))
                .isInstanceOf(ApiException.class).hasMessageContaining("outside the range");
        assertThatThrownBy(() -> runRows(mapping, List.of(Map.of("txn_count_24h", -3_000_000_000L))))
                .isInstanceOf(ApiException.class).hasMessageContaining("Test case 1");
    }

    @Test
    void hugeAndOddNumbersAreRejectedInsteadOfWrappingAround() {
        store.put(Fixtures.fixture("two_outputs"));
        var mapping = map("amount_cents", "amount_cents");
        assertThatThrownBy(() -> run(mapping, new BigInteger("99999999999999999999"))).isInstanceOf(ApiException.class).hasMessageContaining("too large");
        assertThatThrownBy(() -> run(mapping, new BigDecimal("1e30"))).isInstanceOf(ApiException.class).hasMessageContaining("too large");
        assertThatThrownBy(() -> run(mapping, 1e30)).isInstanceOf(ApiException.class).hasMessageContaining("too large");
        assertThatThrownBy(() -> run(mapping, 12.5)).isInstanceOf(ApiException.class).hasMessageContaining("whole number");
        assertThatThrownBy(() -> run(mapping, Double.NaN)).isInstanceOf(ApiException.class).hasMessageContaining("whole number");
        assertThatThrownBy(() -> run(mapping, "100")).isInstanceOf(ApiException.class).hasMessageContaining("whole number");
        assertThatThrownBy(() -> run(mapping, true)).isInstanceOf(ApiException.class).hasMessageContaining("whole number");
        // whole numbers written as 100.0 or 1e2 are fine
        assertThat(run(mapping, 100.0)).isNotNull();
        assertThat(run(mapping, new BigDecimal("1E+2"))).isNotNull();
        assertThat(run(mapping, new BigInteger("100"))).isNotNull();
        assertThat(run(mapping, 0)).isNotNull();
        assertThat(run(mapping, -5)).isNotNull();
        assertThat(run(mapping, Long.MAX_VALUE / 2048)).isNotNull();
    }

    private TestRunner.RunResult run(List<TestRunner.InputMapping> mapping, Object amount) {
        return runRows(mapping, List.of(Map.of("amount_cents", amount)));
    }

    @Test
    void textValuesAreCheckedAndUnicodeIsFine() {
        store.put(Fixtures.sample());
        var mapping = map("amount_cents", "amount_cents", "is_international", "is_international", "country", "country_code");
        java.util.function.Function<Object, Map<String, Object>> row =
                country -> Map.of("amount_cents", 100, "is_international", true, "country_code", country);
        assertThat(runRows(mapping, List.of(row.apply("日本"))).results()).hasSize(1);
        assertThat(runRows(mapping, List.of(row.apply("N'G\"; DROP TABLE"))).results()).hasSize(1);
        assertThat(runRows(mapping, List.of(row.apply("x".repeat(256)))).results()).hasSize(1);
        assertThatThrownBy(() -> runRows(mapping, List.of(row.apply("x".repeat(257)))))
                .isInstanceOf(ApiException.class).hasMessageContaining("longer than");
        assertThatThrownBy(() -> runRows(mapping, List.of(row.apply("   ")))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> runRows(mapping, List.of(row.apply(42)))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> runRows(mapping, List.of(Map.of("amount_cents", 100, "is_international", "true", "country_code", "US"))))
                .isInstanceOf(ApiException.class).hasMessageContaining("true or false");
    }

    @Test
    void theOutputNamedRiskScoreIsUsedEvenWhenItIsNotFirst() {
        store.put(Fixtures.fixture("two_outputs"));
        var result = runRows(map("amount_cents", "amount_cents"), List.of(Map.of("amount_cents", 100000)));
        assertThat(result.output()).isEqualTo("risk_score");
        assertThat(result.results().get(0).score()).isCloseTo(100.0, within(1e-3)); // 100000 * 0.001, not the 7x debug output
    }

    @Test
    void doubleOutputsAndDynamicAndScalarShapesRun() {
        for (String fixture : List.of("double_output", "dynamic_dims", "scalar_input")) {
            store.put(Fixtures.fixture(fixture));
            var result = runRows(map("amount_cents", "amount_cents"), List.of(Map.of("amount_cents", 5000)));
            assertThat(result.results().get(0).score()).as(fixture).isCloseTo(5.0, within(1e-4));
        }
    }

    @Test
    void unusableModelsAreRefusedWithAConflict() {
        for (String fixture : List.of("float_input", "vector_input", "int_output", "no_inputs")) {
            store.put(Fixtures.fixture(fixture));
            assertThatThrownBy(() -> runRows(map("amount_cents", "amount_cents"), List.of(Map.of("amount_cents", 1))))
                    .as(fixture).isInstanceOf(ApiException.class).hasMessageContaining("cannot be run");
        }
    }

    @Test
    void mappingProblemsAreReportedClearly() {
        store.put(Fixtures.sample());
        var rows = List.<Map<String, Object>>of(Map.of("amount_cents", 1, "is_international", true, "country_code", "US"));
        assertThatThrownBy(() -> runRows(map("amount_cents", "amount_cents", "is_international", "is_international", "nope", "country_code"), rows))
                .isInstanceOf(ApiException.class).hasMessageContaining("has no feature");
        assertThatThrownBy(() -> runRows(map("amount_cents", "amount_cents", "is_international", "is_international", "country", "not_a_feature"), rows))
                .isInstanceOf(ApiException.class).hasMessageContaining("Unknown feature");
        assertThatThrownBy(() -> runRows(map("amount_cents", "amount_cents"), rows))
                .isInstanceOf(ApiException.class).hasMessageContaining("cover all 3");
        assertThatThrownBy(() -> runRows(map("amount_cents", "amount_cents", "amount_cents", "amount_cents", "country", "country_code"), rows))
                .isInstanceOf(ApiException.class).hasMessageContaining("more than once");
    }

    @Test
    void tooManyRowsAreRefused() {
        store.put(Fixtures.sample());
        var mapping = map("amount_cents", "amount_cents", "is_international", "is_international", "country", "country_code");
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < 51; i++) rows.add(Map.of("amount_cents", 1, "is_international", true, "country_code", "US"));
        assertThatThrownBy(() -> runRows(mapping, rows)).isInstanceOf(ApiException.class).hasMessageContaining("at most 50");
    }

    @Test
    void runsKeepWorkingWhileTheModelIsReplacedUnderneath() throws Exception {
        byte[] sample = Fixtures.sample();
        store.put(sample);
        var mapping = map("amount_cents", "amount_cents", "is_international", "is_international", "country", "country_code");
        var rows = List.<Map<String, Object>>of(
                Map.of("amount_cents", 89900, "is_international", true, "country_code", "NG"),
                Map.of("amount_cents", 1250, "is_international", false, "country_code", "US"));

        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<Double>> futures = new ArrayList<>();
            for (int t = 0; t < 8; t++) {
                futures.add(pool.submit((Callable<Double>) () -> {
                    double last = 0;
                    for (int i = 0; i < 40; i++) last = runRows(mapping, rows).results().get(0).score();
                    return last;
                }));
            }
            // A new upload (a new ETag) every few milliseconds, each one forcing a reload while runs are in flight.
            for (int i = 0; i < 150; i++) {
                store.put(sample);
                Thread.sleep(3);
            }
            for (Future<Double> f : futures) {
                assertThat(f.get(60, TimeUnit.SECONDS)).isCloseTo(0.8966, within(1e-3));
            }
        } finally {
            pool.shutdownNow();
        }
    }
}
