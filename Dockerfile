# Debian-based (glibc) image: DuckDB's prebuilt bindings are built for glibc.
FROM oven/bun:1.3.14-slim
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY index.ts ./
COPY lib ./lib

# The database lives on a volume so it survives container restarts and rebuilds.
RUN mkdir /data && chown bun:bun /data
VOLUME /data
ENV DB_PATH=/data/oak-lounge.duckdb

USER bun
CMD ["bun", "index.ts"]
