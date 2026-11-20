package com.example.fraudrunner.api;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.fraudrunner.InMemoryModelStore;
import com.example.fraudrunner.TestStoreConfig;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestStoreConfig.class)
@TestPropertySource(properties = "app.storage.provider=memory")
class ModelControllerTest {

    @Autowired MockMvc mvc;
    @Autowired InMemoryModelStore store;

    @BeforeEach
    void reset() {
        store.clear();
    }

    @Test
    void listsTenFeaturesWithThreeTypes() throws Exception {
        mvc.perform(get("/api/features"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(10)))
                .andExpect(jsonPath("$[?(@.kind=='BOOLEAN')]", hasSize(3)))
                .andExpect(jsonPath("$[?(@.kind=='INTEGER')]", hasSize(4)))
                .andExpect(jsonPath("$[?(@.kind=='STRING')]", hasSize(3)));
    }

    @Test
    void reportsWhenNoModelExists() throws Exception {
        mvc.perform(get("/api/model")).andExpect(status().isOk()).andExpect(jsonPath("$.exists", is(false)));
        mvc.perform(get("/api/model/analysis")).andExpect(status().isNotFound());
    }

    @Test
    void createsAnUploadLink() throws Exception {
        mvc.perform(post("/api/upload-link"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blobName", is("model.onnx")))
                .andExpect(jsonPath("$.url").isNotEmpty());
    }

    @Test
    void analyzesAndRunsTheSampleModel() throws Exception {
        store.put(new ClassPathResource("fraud-risk-demo.onnx").getContentAsByteArray());

        mvc.perform(get("/api/model/analysis"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid", is(true)))
                .andExpect(jsonPath("$.usable", is(true)))
                .andExpect(jsonPath("$.header.irVersion", is(9)))
                .andExpect(jsonPath("$.inputs", hasSize(3)))
                .andExpect(jsonPath("$.inputs[0].name", is("amount_cents")))
                .andExpect(jsonPath("$.inputs[2].kind", is("STRING")));

        String body = """
                {"mapping":[{"input":"amount_cents","feature":"amount_cents"},
                            {"input":"is_international","feature":"is_international"},
                            {"input":"country","feature":"country_code"}],
                 "tolerance":0.05,
                 "rows":[{"values":{"amount_cents":89900,"is_international":true,"country_code":"NG"},"expected":0.90}]}""";
        mvc.perform(post("/api/model/test-run").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results", hasSize(1)))
                .andExpect(jsonPath("$.results[0].score").value(org.hamcrest.Matchers.closeTo(0.8966, 0.001)))
                .andExpect(jsonPath("$.results[0].contributions", hasSize(3)));
    }

    @Test
    void reportsAnInvalidUpload() throws Exception {
        store.put("not an onnx file".getBytes());
        mvc.perform(get("/api/model/analysis"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid", is(false)))
                .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void rejectsAnEmptyRunRequest() throws Exception {
        mvc.perform(post("/api/model/test-run").contentType(MediaType.APPLICATION_JSON).content("{\"mapping\":[],\"rows\":[]}"))
                .andExpect(status().isBadRequest());
    }
}
