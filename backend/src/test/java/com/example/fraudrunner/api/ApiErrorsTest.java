package com.example.fraudrunner.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.fraudrunner.Fixtures;
import com.example.fraudrunner.InMemoryModelStore;
import com.example.fraudrunner.TestStoreConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** HTTP-level behaviour for bad requests, CORS and health. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestStoreConfig.class)
@TestPropertySource(properties = {"app.storage.provider=memory", "app.cors.allowed-origins=https://ui.example.test,http://localhost:5173"})
class ApiErrorsTest {

    @Autowired MockMvc mvc;
    @Autowired InMemoryModelStore store;

    private static final String MAPPING = """
            "mapping":[{"input":"amount_cents","feature":"amount_cents"},{"input":"is_international","feature":"is_international"},{"input":"country","feature":"country_code"}]""";

    @BeforeEach
    void model() {
        store.put(Fixtures.sample());
    }

    private org.springframework.test.web.servlet.ResultActions run(String body) throws Exception {
        return mvc.perform(post("/api/model/test-run").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void malformedJsonIsABadRequestWithAReadableMessage() throws Exception {
        run("{not json").andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", is("The request body could not be read.")));
        run("").andExpect(status().isBadRequest());
        run("[]").andExpect(status().isBadRequest());
    }

    @Test
    void wrongContentTypeIsRejected() throws Exception {
        mvc.perform(post("/api/model/test-run").contentType(MediaType.TEXT_PLAIN).content("{}")).andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void missingPartsAreNamed() throws Exception {
        run("{\"rows\":[{\"values\":{}}]}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", containsString("mapping")));
        run("{" + MAPPING + "}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", containsString("rows")));
        run("{" + MAPPING + ",\"rows\":[{}]}").andExpect(status().isBadRequest());
        run("{" + MAPPING + ",\"rows\":[{\"values\":null}]}").andExpect(status().isBadRequest());
        run("{\"mapping\":[{\"input\":\"\",\"feature\":\"x\"}],\"rows\":[{\"values\":{}}]}").andExpect(status().isBadRequest());
    }

    @Test
    void problemsWithValuesAreReportedPerTestCase() throws Exception {
        run("{" + MAPPING + ",\"tolerance\":0.05,\"rows\":[{\"values\":{\"amount_cents\":1,\"is_international\":true,\"country_code\":\"US\"},\"expected\":0.5},"
                + "{\"values\":{\"amount_cents\":\"abc\",\"is_international\":true,\"country_code\":\"US\"},\"expected\":0.5}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("Test case 2")));
        run("{" + MAPPING + ",\"tolerance\":0.05,\"rows\":[{\"values\":{\"amount_cents\":99999999999999999999999,\"is_international\":true,\"country_code\":\"US\"},\"expected\":0.5}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", containsString("too large")));
    }

    @Test
    void unknownPathsAndMethodsAreNotServerErrors() throws Exception {
        mvc.perform(get("/api/nothing")).andExpect(status().is4xxClientError());
        mvc.perform(get("/api/model/test-run")).andExpect(status().is4xxClientError());
        mvc.perform(post("/api/features")).andExpect(status().is4xxClientError());
    }

    @Test
    void theUiOriginMayCallTheApiAndOthersMayNot() throws Exception {
        mvc.perform(options("/api/model/test-run")
                        .header("Origin", "https://ui.example.test")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://ui.example.test"));
        mvc.perform(post("/api/upload-link").header("Origin", "https://ui.example.test"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://ui.example.test"));
        mvc.perform(options("/api/model/test-run")
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/upload-link").header("Origin", "https://evil.example")).andExpect(status().isForbidden());
    }

    @Test
    void healthProbesReportUp() throws Exception {
        mvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk()).andExpect(jsonPath("$.status", is("UP")));
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk()).andExpect(jsonPath("$.status", is("UP")));
        mvc.perform(get("/actuator/env")).andExpect(status().isNotFound());
    }

    @Test
    void analysisOfAnUnusableModelExplainsWhy() throws Exception {
        store.put(Fixtures.fixture("float_input"));
        mvc.perform(get("/api/model/analysis"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid", is(true)))
                .andExpect(jsonPath("$.usable", is(false)))
                .andExpect(jsonPath("$.inputs[0].supported", is(false)))
                .andExpect(jsonPath("$.inputs[0].problem", containsString("not supported")));
        run("{" + MAPPING + ",\"tolerance\":0.05,\"rows\":[{\"values\":{},\"expected\":0.5}]}").andExpect(status().isConflict());
    }

    @Test
    void anUnreadableFileIsReportedByAnalysisNotAsAServerError() throws Exception {
        store.put(new byte[0]);
        mvc.perform(get("/api/model/analysis")).andExpect(status().isOk()).andExpect(jsonPath("$.valid", is(false)));
    }
}
