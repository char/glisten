# escape=`
# Ordinary comments and Unicode: 雪 ☃
fRoM example.invalid/base:latest aS base
# escape=\
ARG NAME
ENV GREETING="hello ${NAME:-world}" OTHER=$NAME
RUN echo "a backslash is literal here: \\" `
    # This is a Dockerfile comment, not a Bash comment.
    && echo continued
RUN ["echo", "JSON, not shell", "escaped \"quote\""]
# Near misses and incomplete input:
RUNNING echo not-an-instruction
RUN --mount=type=cache,target=/tmp echo $UNFINISHED ${OPEN
COPY ["unterminated", "array"
