# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS node-build
WORKDIR /build
COPY package*.json ./
COPY worker/package.json ./worker/package.json
RUN if [ -f package-lock.json ]; then \
      npm ci --ignore-scripts --no-audit --workspace @reposec/scanner-worker --include-workspace-root=false; \
    else \
      npm install --ignore-scripts --no-audit --workspace @reposec/scanner-worker --include-workspace-root=false; \
    fi
COPY worker/tsconfig.json ./worker/tsconfig.json
COPY worker/src ./worker/src
RUN npm run build --workspace @reposec/scanner-worker \
  && npm prune --omit=dev --ignore-scripts --workspace @reposec/scanner-worker --include-workspace-root=false

FROM golang:1.24-bookworm AS osv-build
ARG OSV_SCANNER_VERSION=2.3.8
RUN GOBIN=/out CGO_ENABLED=0 go install github.com/google/osv-scanner/v2/cmd/osv-scanner@v${OSV_SCANNER_VERSION}

FROM node:22-bookworm-slim AS runtime

ARG GITLEAKS_VERSION=8.30.1
ARG TRIVY_VERSION=0.70.0
ARG SEMGREP_VERSION=1.164.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl python3 python3-pip tini \
  && rm -rf /var/lib/apt/lists/*

RUN cd /tmp \
  && curl --fail --show-error --location \
      "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
      --output "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
  && curl --fail --show-error --location \
      "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_checksums.txt" \
      --output gitleaks_checksums.txt \
  && grep "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz$" gitleaks_checksums.txt | sha256sum --check --strict \
  && tar -xzf "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" -C /usr/local/bin gitleaks \
  && rm "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" gitleaks_checksums.txt

RUN cd /tmp \
  && curl --fail --show-error --location \
      "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
      --output "trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
  && curl --fail --show-error --location \
      "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_checksums.txt" \
      --output checksums.txt \
  && grep "trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz$" checksums.txt | sha256sum --check --strict \
  && tar -xzf "trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" -C /usr/local/bin trivy \
  && rm "trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" checksums.txt

RUN python3 -m pip install --break-system-packages --no-cache-dir "semgrep==${SEMGREP_VERSION}"
COPY --from=osv-build /out/osv-scanner /usr/local/bin/osv-scanner

WORKDIR /app
COPY --from=node-build /build/worker/dist ./dist
COPY --from=node-build /build/node_modules ./node_modules
COPY worker/package.json ./package.json
COPY worker/rules ./rules

RUN printf 'const reposecSemgrepSmoke = true;\n' > /tmp/reposec-semgrep-smoke.js \
  && semgrep scan --config=/app/rules/semgrep.yml --metrics=off --json /tmp/reposec-semgrep-smoke.js >/dev/null \
  && rm /tmp/reposec-semgrep-smoke.js

RUN groupadd --system --gid 10001 reposec \
  && useradd --system --uid 10001 --gid reposec --home-dir /var/lib/reposec --create-home reposec \
  && mkdir -p /var/lib/reposec/trivy /var/lib/reposec/semgrep /var/lib/reposec/cache /tmp/reposec \
  && chown -R reposec:reposec /var/lib/reposec /tmp/reposec /app

# Refresh scanner databases by rebuilding the image on a weekly cadence.
RUN trivy image --download-db-only --cache-dir /var/lib/reposec/trivy \
  && chown -R reposec:reposec /var/lib/reposec/trivy

ENV NODE_ENV=production \
    HOME=/var/lib/reposec \
    TRIVY_CACHE_DIR=/var/lib/reposec/trivy \
    SEMGREP_SETTINGS_FILE=/var/lib/reposec/semgrep/settings.yml \
    SEMGREP_SEND_METRICS=off \
    XDG_CACHE_HOME=/var/lib/reposec/cache \
    TMPDIR=/tmp/reposec

USER 10001:10001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
