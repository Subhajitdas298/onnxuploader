# Build:  docker build -t fraud-runner-api backend
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true
COPY src ./src
RUN ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:25-jre
RUN useradd --system --uid 10001 app
WORKDIR /app
COPY --from=build /src/build/libs/app.jar app.jar
USER app
EXPOSE 8080
# Small container: serial GC and a heap that follows the memory limit. Native access is needed by ONNX Runtime.
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -XX:MaxRAMPercentage=65 -XX:TieredStopAtLevel=1 --enable-native-access=ALL-UNNAMED"
ENTRYPOINT ["java", "-jar", "app.jar"]
