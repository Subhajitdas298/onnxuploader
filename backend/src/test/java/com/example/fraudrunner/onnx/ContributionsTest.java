package com.example.fraudrunner.onnx;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class ContributionsTest {

    @Test
    void contributionsAddUpToTheScoreDifference() {
        // 3 features, arbitrary non-additive scores for every subset
        double[] v = {0.05, 0.10, 0.30, 0.45, 0.20, 0.35, 0.60, 0.90};
        double[] phi = Contributions.shapley(v, 3);
        assertThat(phi[0] + phi[1] + phi[2]).isCloseTo(v[7] - v[0], within(1e-12));
    }

    @Test
    void anAdditiveModelGivesEachFeatureItsOwnEffect() {
        // f = 0.1 + 0.2*a + 0.3*b
        double[] v = {0.1, 0.3, 0.4, 0.6};
        double[] phi = Contributions.shapley(v, 2);
        assertThat(phi[0]).isCloseTo(0.2, within(1e-12));
        assertThat(phi[1]).isCloseTo(0.3, within(1e-12));
    }
}
