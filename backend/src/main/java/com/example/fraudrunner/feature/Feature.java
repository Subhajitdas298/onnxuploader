package com.example.fraudrunner.feature;

/** One of the fixed features the system can feed to a model. */
public record Feature(String name, FeatureKind kind, String category, String description, Object baseline) {}
