FROM node:24-alpine
ARG VERSION=1.0.0
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Matchpoint" \
      org.opencontainers.image.description="Official esports schedules, brackets and archives" \
      org.opencontainers.image.source="https://github.com/getl-x/matchpoint" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$VCS_REF
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4177 \
    MATCHPOINT_DATA_DIR=/app/data \
    TZ=Asia/Shanghai
WORKDIR /app
COPY --chown=node:node package*.json server.mjs index.html styles.css sw.js manifest.webmanifest ./
COPY --chown=node:node server/ ./server/
COPY --chown=node:node src/ ./src/
COPY --chown=node:node assets/ ./assets/
COPY --chown=node:node scripts/healthcheck.mjs ./scripts/healthcheck.mjs
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 4177
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "scripts/healthcheck.mjs"]
CMD ["node", "server.mjs"]
