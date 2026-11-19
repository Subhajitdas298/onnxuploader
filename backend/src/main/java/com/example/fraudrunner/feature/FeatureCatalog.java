package com.example.fraudrunner.feature;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

import static com.example.fraudrunner.feature.FeatureKind.BOOLEAN;
import static com.example.fraudrunner.feature.FeatureKind.INTEGER;
import static com.example.fraudrunner.feature.FeatureKind.STRING;

/**
 * The fixed set of 10 supported features. The baseline is the value of a typical transaction and is used as the
 * reference when explaining which features contributed to a score.
 */
@Component
public class FeatureCatalog {

    public static final String TRANSACTION = "Transaction";
    public static final String ACCOUNT = "Account behavior";
    public static final String DEVICE = "Device and channel";
    public static final String LOCATION = "Location";

    private final List<Feature> features = List.of(
            new Feature("amount_cents", INTEGER, TRANSACTION, "Transaction amount in minor units, 12999 = 129.99", 2500L),
            new Feature("merchant_category_code", INTEGER, TRANSACTION, "ISO 18245 merchant category code, for example 5411", 5411L),
            new Feature("currency", STRING, TRANSACTION, "ISO 4217 currency code, for example EUR", "USD"),
            new Feature("account_age_days", INTEGER, ACCOUNT, "Days since the account was opened", 365L),
            new Feature("txn_count_24h", INTEGER, ACCOUNT, "Transactions on this account in the last 24 hours", 1L),
            new Feature("is_new_device", BOOLEAN, DEVICE, "First transaction seen from this device", false),
            new Feature("is_card_present", BOOLEAN, DEVICE, "Card was physically present at the terminal", true),
            new Feature("channel", STRING, DEVICE, "WEB, MOBILE, POS or ATM", "WEB"),
            new Feature("is_international", BOOLEAN, LOCATION, "Card country differs from the merchant country", false),
            new Feature("country_code", STRING, LOCATION, "ISO 3166 alpha-2 merchant country, for example US", "US"));

    private final Map<String, Feature> byName = new LinkedHashMap<>();

    public FeatureCatalog() {
        features.forEach(f -> byName.put(f.name(), f));
    }

    public List<Feature> all() {
        return features;
    }

    public Optional<Feature> find(String name) {
        return Optional.ofNullable(byName.get(name));
    }
}
