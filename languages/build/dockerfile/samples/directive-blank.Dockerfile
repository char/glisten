
# escape=`
FROM scratch
ARG MESSAGE=hello
RUN echo one \
    && echo two
RUN \
    # Before the first shell token.
    printf '%s\n' ready
ONBUILD COPY ["package.json", "/app/package.json"]
