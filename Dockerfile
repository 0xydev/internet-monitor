FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum files
COPY go.mod ./
COPY go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o internet-monitor ./cmd/server

# Use a minimal alpine image for the final container
FROM alpine:3.18

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/internet-monitor /app/
# Copy web files
COPY --from=builder /app/web /app/web

# Create data directory
RUN mkdir -p /app/data

# Expose the port
EXPOSE 8080

# Set environment variables
ENV PORT=8080
ENV TARGET=8.8.8.8
ENV INTERVAL=5
ENV DATA_DIR=/app/data
ENV STATIC_DIR=/app/web/static
ENV TEMPLATES_DIR=/app/web/templates

# Run the application
ENTRYPOINT ["/app/internet-monitor"]
CMD ["-port", "8080", "-target", "8.8.8.8", "-interval", "5", "-data-dir", "/app/data", "-static-dir", "/app/web/static", "-templates-dir", "/app/web/templates"] 