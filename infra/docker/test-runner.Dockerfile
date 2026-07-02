FROM golang:1.26.2

# Install Java (required for Firebase emulators), Node.js, PostgreSQL client, and Firebase tools
RUN apt-get update && apt-get install -y \
    default-jre-headless \
    postgresql-client \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g firebase-tools \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Go security tools
RUN go install golang.org/x/vuln/cmd/govulncheck@latest

# Verify installations
RUN java -version && firebase --version && go version && node --version && npm --version && psql --version && govulncheck -version

# Set working directory
WORKDIR /workspace

# Print versions for debugging
CMD ["sh", "-c", "echo 'Go:' && go version && echo 'Node:' && node --version && echo 'Firebase:' && firebase --version"]
