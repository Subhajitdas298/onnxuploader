package com.example.fraudrunner.api;

import com.example.fraudrunner.api.Dtos.*;
import com.example.fraudrunner.feature.FeatureCatalog;
import com.example.fraudrunner.onnx.Analysis;
import com.example.fraudrunner.onnx.ModelRegistry;
import com.example.fraudrunner.onnx.TestRunner;
import com.example.fraudrunner.storage.ModelStore;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class ModelController {

    private final FeatureCatalog catalog;
    private final ModelStore store;
    private final ModelRegistry registry;
    private final TestRunner runner;

    ModelController(FeatureCatalog catalog, ModelStore store, ModelRegistry registry, TestRunner runner) {
        this.catalog = catalog;
        this.store = store;
        this.registry = registry;
        this.runner = runner;
    }

    @GetMapping("/features")
    List<FeatureDto> features() {
        return catalog.all().stream()
                .map(f -> new FeatureDto(f.name(), f.kind(), f.category(), f.description(), f.baseline()))
                .toList();
    }

    @GetMapping("/model")
    ModelInfoResponse model() {
        return store.info()
                .map(i -> new ModelInfoResponse(true, i.sizeBytes(), i.lastModified(), i.version()))
                .orElse(new ModelInfoResponse(false, null, null, null));
    }

    @PostMapping("/upload-link")
    UploadLinkResponse uploadLink() {
        var link = store.createUploadLink();
        return new UploadLinkResponse(link.url(), link.expiresAt(), link.blobName());
    }

    @GetMapping("/model/analysis")
    AnalysisResponse analysis() {
        Analysis a = registry.analysis();
        Header header = a.header() == null ? null : new Header(
                a.header().graphName(), a.header().producerName(), a.header().producerVersion(), a.header().domain(),
                a.header().irVersion(), a.header().modelVersion(), a.header().docString(),
                a.header().opsets().stream().map(o -> new OpsetDto(o.domain(), o.version())).toList());
        return new AnalysisResponse(
                a.valid(), a.error(), a.version(), header,
                a.inputs().stream().map(i -> new InputDto(i.index(), i.name(), i.tensorType(), i.kind(), i.shape(), i.supported(), i.problem())).toList(),
                a.outputs().stream().map(o -> new OutputDto(o.name(), o.tensorType(), o.shape(), o.score())).toList(),
                a.problems(), a.usable());
    }

    @PostMapping("/model/test-run")
    TestRunResponse testRun(@Valid @RequestBody TestRunRequest request) {
        var result = runner.run(
                request.mapping().stream().map(m -> new TestRunner.InputMapping(m.input(), m.feature())).toList(),
                request.tolerance(),
                request.rows().stream().map(r -> new TestRunner.TestCase(r.values(), r.expected())).toList());
        return new TestRunResponse(
                result.output(), result.elapsedMs(), result.baselineScore(), result.tolerance(),
                result.results().stream()
                        .map(r -> new TestCaseResult(r.score(), r.expected(), r.delta(), r.passed(),
                                r.contributions().stream().map(c -> new ContributionDto(c.feature(), c.value(), c.contribution())).toList()))
                        .toList());
    }
}
