package com.example.fraudrunner.api;

import com.example.fraudrunner.feature.FeatureKind;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Request and response shapes of the HTTP API. */
public final class Dtos {

    private Dtos() {}

    public record FeatureDto(String name, FeatureKind kind, String category, String description, Object baseline) {}

    public record ModelInfoResponse(boolean exists, Long sizeBytes, Instant lastModified, String version) {}

    public record UploadLinkResponse(String url, Instant expiresAt, String blobName) {}

    public record AnalysisResponse(
            boolean valid,
            String error,
            String version,
            Header header,
            List<InputDto> inputs,
            List<OutputDto> outputs,
            List<String> problems,
            boolean usable) {}

    public record Header(
            String graphName,
            String producer,
            String producerVersion,
            String domain,
            Long irVersion,
            Long modelVersion,
            String description,
            List<OpsetDto> opsets) {}

    public record OpsetDto(String domain, long version) {}

    public record InputDto(int index, String name, String tensorType, FeatureKind kind, List<Long> shape, boolean supported, String problem) {}

    public record OutputDto(String name, String tensorType, List<Long> shape, boolean score) {}

    public record TestRunRequest(
            @NotEmpty List<@Valid InputMappingDto> mapping,
            @NotNull @DecimalMin("0") Double tolerance,
            @NotEmpty List<@Valid TestRowDto> rows) {}

    public record InputMappingDto(@NotBlank String input, @NotBlank String feature) {}

    public record TestRowDto(@NotNull Map<String, Object> values, @NotNull Double expected) {}

    public record TestRunResponse(String output, long elapsedMs, double baselineScore, double tolerance, List<TestCaseResult> results) {}

    public record TestCaseResult(double score, double expected, double delta, boolean passed, List<ContributionDto> contributions) {}

    public record ContributionDto(String feature, Object value, double contribution) {}
}
