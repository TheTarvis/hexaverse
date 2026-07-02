FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Pre-install common test dependencies to speed up CI
RUN uv pip install --system \
    pytest \
    pytest-asyncio \
    pytest-cov \
    httpx \
    ruff

# Verify installations
RUN python --version && uv --version && ruff --version

# Set working directory
WORKDIR /workspace

CMD ["bash"]