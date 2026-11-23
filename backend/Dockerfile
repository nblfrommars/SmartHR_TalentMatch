FROM maven:3.9-eclipse-temurin-21 AS build
ARG SERVICE=job-service
WORKDIR /src
COPY pom.xml .
COPY common-lib common-lib
COPY job-service job-service
COPY user-cv user-cv
RUN mvn -B -ntp -pl ${SERVICE} -am package -DskipTests

FROM eclipse-temurin:21-jre
ARG SERVICE=job-service
WORKDIR /app
RUN useradd --system --no-create-home app
COPY --from=build /src/${SERVICE}/target/${SERVICE}-*.jar /app/app.jar
USER app
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
