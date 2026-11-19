package com.example.fraudrunner.storage;

import static org.assertj.core.api.Assertions.assertThat;

import com.azure.storage.blob.BlobServiceClientBuilder;
import com.example.fraudrunner.Fixtures;
import com.example.fraudrunner.config.AppProperties;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Talks to a real blob endpoint. Set AZURITE_CONNECTION_STRING (the local emulator) to run it:
 * it uploads through the SAS link exactly like the browser does and checks overwrite behaviour.
 */
@EnabledIfEnvironmentVariable(named = "AZURITE_CONNECTION_STRING", matches = ".+")
class AzuriteStoreIT {

    private final HttpClient http = HttpClient.newHttpClient();

    private AzureBlobModelStore newStore() {
        String connection = System.getenv("AZURITE_CONNECTION_STRING");
        var storage = new AppProperties.Storage("azure", connection, "", "it-" + UUID.randomUUID().toString().substring(0, 8),
                "model.onnx", Duration.ofMinutes(15), 26_214_400, true, false);
        var props = new AppProperties(storage, new AppProperties.Cors(List.of()), new AppProperties.Run(50));
        var store = new AzureBlobModelStore(new BlobServiceClientBuilder().connectionString(connection).buildClient(), props);
        store.prepare();
        return store;
    }

    private int put(String url, byte[] body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url)).header("x-ms-blob-type", "BlockBlob")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(body)).build();
        return http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    @Test
    void uploadThroughTheLinkThenOverwrite() throws Exception {
        var store = newStore();
        assertThat(store.info()).isEmpty();

        byte[] first = Fixtures.sample();
        assertThat(put(store.createUploadLink().url(), first)).isEqualTo(201);
        var info1 = store.info().orElseThrow();
        assertThat(info1.sizeBytes()).isEqualTo(first.length);
        assertThat(store.download().bytes()).isEqualTo(first);

        byte[] second = Fixtures.fixture("all_features");
        assertThat(put(store.createUploadLink().url(), second)).isEqualTo(201);   // same blob name: overwrite, not a new file
        var info2 = store.info().orElseThrow();
        assertThat(info2.version()).isNotEqualTo(info1.version());
        assertThat(info2.sizeBytes()).isEqualTo(second.length);
        assertThat(store.download().bytes()).isEqualTo(second);
    }

    @Test
    void theLinkCannotReadTheModelBack() throws Exception {
        var store = newStore();
        String url = store.createUploadLink().url();
        assertThat(put(url, Fixtures.sample())).isEqualTo(201);
        var get = HttpRequest.newBuilder(URI.create(url)).GET().build();
        assertThat(http.send(get, HttpResponse.BodyHandlers.discarding()).statusCode()).isIn(403, 404);
    }

    @Test
    void aTamperedLinkIsRefused() throws Exception {
        var store = newStore();
        String url = store.createUploadLink().url();
        assertThat(put(url.replace("sp=cw", "sp=racwdl"), Fixtures.sample())).isEqualTo(403);
        assertThat(put(url.replace("/model.onnx", "/other.onnx"), Fixtures.sample())).isEqualTo(403);
    }

    @Test
    void downloadingBeforeAnyUploadIsANotFound() {
        var store = newStore();
        org.junit.jupiter.api.Assertions.assertThrows(com.example.fraudrunner.api.ApiException.class, store::download);
    }
}
