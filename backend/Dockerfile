# Build Go control-plane binaries (context = backend/).
#   docker build -f Dockerfile --build-arg CMD=de-sys -t de-sys:local .
ARG CMD=de-sys
FROM golang:1.24-alpine AS build
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG CMD
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/app ./cmd/${CMD}

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata curl
WORKDIR /app
COPY --from=build /out/app /app/app
EXPOSE 8100
USER nobody
ENTRYPOINT ["/app/app"]
