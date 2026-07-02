FROM node:20-slim

# Install build dependencies for Next.js and native npm packages
# - git: required by some npm packages
# - curl: for health checks and downloads
# - python3, make, g++: for building native npm packages
# - libvips-dev: for Sharp (Next.js image optimization)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    make \
    g++ \
    libvips-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Vercel CLI globally
RUN npm install -g vercel@latest

# Verify installations
RUN node --version && npm --version && vercel --version

# Set working directory
WORKDIR /workspace

CMD ["sh"]