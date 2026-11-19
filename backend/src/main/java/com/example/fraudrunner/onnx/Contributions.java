package com.example.fraudrunner.onnx;

/** Exact Shapley values for a small number of features, given the score of every feature subset. */
final class Contributions {

    private Contributions() {}

    /**
     * @param subsetScores score of the model when only the features in the subset (a bit mask) carry the real value
     *                     and the rest are set to the baseline. Length must be 2^n.
     * @return each feature's average effect on the score compared with the all-baseline score
     */
    static double[] shapley(double[] subsetScores, int n) {
        double[] fact = new double[n + 1];
        fact[0] = 1;
        for (int i = 1; i <= n; i++) fact[i] = fact[i - 1] * i;

        double[] phi = new double[n];
        for (int i = 0; i < n; i++) {
            double total = 0;
            for (int mask = 0; mask < (1 << n); mask++) {
                if ((mask >> i & 1) == 1) continue;
                int k = Integer.bitCount(mask);
                double weight = fact[k] * fact[n - k - 1] / fact[n];
                total += weight * (subsetScores[mask | (1 << i)] - subsetScores[mask]);
            }
            phi[i] = total;
        }
        return phi;
    }
}
