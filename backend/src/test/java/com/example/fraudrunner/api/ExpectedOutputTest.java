package com.example.fraudrunner.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.fraudrunner.Fixtures;
import com.jayway.jsonpath.JsonPath;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.ResultMatcher;

/** Each test case carries an expected score, and a tolerance decides whether the model's score matches it. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestStoreConfig.class)
@TestPropertySource(properties = "app.storage.provider=memory")
class ExpectedOutputTest {

    @Autowired MockMvc mvc;
    @Autowired InMemoryModelStore store;

    private static final String MAPPING = """
            "mapping":[{"input":"amount_cents","feature":"amount_cents"},{"input":"is_international","feature":"is_international"},{"input":"country","feature":"country_code"}]""";

    // the sample model scores this case at 0.8966
    private static String row(String expected) {
        return "{\"values\":{\"amount_cents\":89900,\"is_international\":true,\"country_code\":\"NG\"},\"expected\":" + expected + "}";
    }

    /** A number in the response, compared with a tolerance (the JSON reader may hand back a BigDecimal or a Double). */
    private static ResultMatcher numberAt(String path, double expected) {
        return result -> assertThat(((Number) JsonPath.read(result.getResponse().getContentAsString(), path)).doubleValue())
                .isCloseTo(expected, within(0.001));
    }

    @BeforeEach
    void model() {
        store.put(Fixtures.sample());
    }

    private ResultActions run(String tolerance, String... rows) throws Exception {
        String body = "{" + MAPPING + (tolerance == null ? "" : ",\"tolerance\":" + tolerance) + ",\"rows\":[" + String.join(",", rows) + "]}";
        return mvc.perform(post("/api/model/test-run").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void aScoreWithinTheToleranceOfTheExpectedScorePasses() throws Exception {
        run("0.05", row("0.90"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tolerance", is(0.05)))
                .andExpect(jsonPath("$.results[0].passed", is(true)))
                .andExpect(jsonPath("$.results[0].expected", is(0.9)))
                .andExpect(numberAt("$.results[0].delta", -0.0034));
    }

    @Test
    void aScoreOutsideTheToleranceFailsAndReportsHowFarOffItIs() throws Exception {
        run("0.05", row("0.50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].passed", is(false)))
                .andExpect(numberAt("$.results[0].delta", 0.3966))
                .andExpect(jsonPath("$.results[0].contributions.length()", is(3)));
    }

    @Test
    void theToleranceDecidesTheOutcome() throws Exception {
        run("0.5", row("0.50")).andExpect(jsonPath("$.results[0].passed", is(true)));
        run("0.3", row("0.50")).andExpect(jsonPath("$.results[0].passed", is(false)));
        run("0", row("0.90")).andExpect(jsonPath("$.results[0].passed", is(false)));   // exact match needed
    }

    @Test
    void theEdgeOfTheToleranceStillPasses() throws Exception {
        // 0.8966 is 0.0966 above 0.80 (to float32 precision), so a tolerance of 0.0967 passes and 0.0965 fails
        run("0.0967", row("0.80")).andExpect(jsonPath("$.results[0].passed", is(true)));
        run("0.0965", row("0.80")).andExpect(jsonPath("$.results[0].passed", is(false)));
    }

    @Test
    void eachCaseIsJudgedOnItsOwn() throws Exception {
        run("0.05", row("0.90"), row("0.10"), row("0.90"))
                .andExpect(jsonPath("$.results[0].passed", is(true)))
                .andExpect(jsonPath("$.results[1].passed", is(false)))
                .andExpect(jsonPath("$.results[2].passed", is(true)));
    }

    @Test
    void anExpectedScoreAndAToleranceAreRequired() throws Exception {
        run("0.05", "{\"values\":{\"amount_cents\":1,\"is_international\":true,\"country_code\":\"US\"}}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", containsString("expected")));
        run(null, row("0.9")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", containsString("tolerance")));
        run("0.05", row("null")).andExpect(status().isBadRequest());
        run("0.05", row("\"high\"")).andExpect(status().isBadRequest());
    }

    @Test
    void aNegativeToleranceIsRefused() throws Exception {
        run("-0.1", row("0.90")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", containsString("tolerance")));
    }
}
