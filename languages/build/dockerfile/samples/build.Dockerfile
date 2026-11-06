# syntax=docker/dockerfile:1
ARG GO_VERSION=1.23
ARG TARGETOS
# escape=`
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download && \
    # This line is removed before the shell sees the command.
    # So is this one.
    printf '%s\n' "building ${TARGETOS:-linux}"
RUN printf '%s\n' "joined \
    # A comment inside an open shell quote is still removed.
    value"
COPY . .
RUN <<BUILD
set -eu
go build -o /out/app ./cmd/app
BUILD
RUN <<-SCRIPT
	echo "tab-stripped terminator"
	SCRIPT
ONBUILD RUN echo "building a downstream image"

FROM alpine:3.20 AS runtime
COPY --from=build /out/app /usr/local/bin/app
ENV PORT=8080 LOG_LEVEL=info
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/app"]
CMD ["--serve"]
