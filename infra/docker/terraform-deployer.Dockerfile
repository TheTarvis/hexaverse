FROM hashicorp/terraform:latest

# Install gcloud SDK and dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    bash \
    && curl https://sdk.cloud.google.com | bash -s -- --disable-prompts --install-dir=/

# Add gcloud to PATH
ENV PATH="/google-cloud-sdk/bin:${PATH}"

# Verify installations
RUN terraform version && gcloud version

WORKDIR /workspace

CMD ["sh"]
