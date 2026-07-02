FROM docker:latest

# Install gcloud SDK and dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    bash \
    && curl https://sdk.cloud.google.com | bash -s -- --disable-prompts --install-dir=/ \
    && /google-cloud-sdk/bin/gcloud components install docker-credential-gcr --quiet

# Add gcloud to PATH
ENV PATH="/google-cloud-sdk/bin:${PATH}"

# Verify installation
RUN gcloud version && docker --version

WORKDIR /workspace

CMD ["sh"]