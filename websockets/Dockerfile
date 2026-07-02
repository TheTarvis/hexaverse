FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum files
COPY go.mod ./
COPY go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -v -o websocket-server

# Use a minimal alpine image for the final container
FROM alpine:3.18

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/websocket-server .

# Expose the port the server will listen on
EXPOSE 8080

# Run the server
CMD ["./websocket-server"] 