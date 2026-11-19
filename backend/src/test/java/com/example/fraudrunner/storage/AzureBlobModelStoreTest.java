package com.example.fraudrunner.storage;

import static org.assertj.core.api.Assertions.assertThat;

import com.azure.storage.blob.BlobServiceClientBuilder;
import com.example.fraudrunner.config.AppProperties;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** SAS link generation is a local signing step, so it can be checked without any Azure account. */
class AzureBlobModelStoreTest {

    // A made-up account key: only used to sign, never sent anywhere.
    private static final String CONNECTION = "DefaultEndpointsProtocol=https;AccountName=teststorage;"
            + "AccountKey=" + java.util.Base64.getEncoder().encodeToString("not-a-real-key-not-a-real-key-123".getBytes())
            + ";EndpointSuffix=core.windows.net";

    private static AzureBlobModelStore store() {
        var storage = new AppProperties.Storage("azure", CONNECTION, "", "models", "model.onnx", Duration.ofMinutes(15), 26_214_400, false, false);
        var props = new AppProperties(storage, new AppProperties.Cors(List.of()), new AppProperties.Run(50));
        return new AzureBlobModelStore(new BlobServiceClientBuilder().connectionString(CONNECTION).buildClient(), props);
    }

    private static Map<String, String> query(String url) {
        return Arrays.stream(URI.create(url).getRawQuery().split("&"))
                .map(p -> p.split("=", 2))
                .collect(Collectors.toMap(p -> p[0], p -> URLDecoder.decode(p[1], StandardCharsets.UTF_8)));
    }

    @Test
    void theUploadLinkTargetsOneBlobAndCanOnlyCreateAndWrite() {
        var link = store().createUploadLink();
        assertThat(link.blobName()).isEqualTo("model.onnx");
        assertThat(link.url()).startsWith("https://teststorage.blob.core.windows.net/models/model.onnx?");

        Map<String, String> q = query(link.url());
        assertThat(q.get("sr")).isEqualTo("b");                     // one blob, not the container
        assertThat(q.get("sp")).isEqualTo("cw");                    // create + write, no read, delete or list
        assertThat(q.get("spr")).isEqualTo("https");
        assertThat(q).containsKey("sig");
    }

    @Test
    void theLinkExpiresAfterAboutFifteenMinutes() {
        var link = store().createUploadLink();
        Instant now = Instant.now();
        assertThat(link.expiresAt()).isBetween(now.plus(Duration.ofMinutes(14)), now.plus(Duration.ofMinutes(16)));
        assertThat(Instant.parse(query(link.url()).get("se"))).isEqualTo(link.expiresAt().truncatedTo(java.time.temporal.ChronoUnit.SECONDS));
    }

    @Test
    void everyLinkIsFreshlySigned() {
        var s = store();
        assertThat(s.createUploadLink().url()).isNotEmpty();
        assertThat(query(s.createUploadLink().url()).get("sig")).isNotBlank();
    }
}
