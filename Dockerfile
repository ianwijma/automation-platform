FROM oven/bun:1.3.9 AS bun
FROM rust:1.95.0-bookworm AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY ui/package.json ui/package.json
COPY desktop/package.json desktop/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates bash curl libstdc++6 tesseract-ocr imagemagick && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home ap && mkdir /data && chown ap:ap /data
COPY --from=build /app/dist/ap /usr/local/bin/ap
USER ap
ENV AP_HOST=0.0.0.0 AP_PORT=7480 AP_DATA_DIR=/data AP_NO_BROWSER=1
VOLUME /data
EXPOSE 7480
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://127.0.0.1:7480/api/system/info || exit 1
ENTRYPOINT ["ap"]
CMD ["serve", "--no-browser"]
