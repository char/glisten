#ifndef GLISTEN_SAMPLE_H
#define GLISTEN_SAMPLE_H

#include <stddef.h>
#include "local/config.h"

#define BUFFER_SIZE 0x100u
#define MINIMUM(a, b) ((a) < (b) ? (a) : (b))
#define LOG_PAIR(name, value) \
    log_pair((name), (value))

#if defined(ENABLE_TRACE) && ENABLE_TRACE > 0
#define TRACE(message) log_message(message)
#elif defined(QUIET)
#define TRACE(message) ((void)0)
#else
#define TRACE(message) log_message("fallback: " message)
#endif

/* A header with a directive inside an aggregate. */
typedef struct Buffer {
    unsigned char *data;
    size_t length;
#ifdef ENABLE_TRACE
    const char *name;
#endif
} Buffer;

static inline size_t buffer_size(const Buffer *buffer) {
    return MINIMUM(buffer->length, BUFFER_SIZE);
}

// The café message is deliberately UTF-8.
static const char *greeting = u8"Hello, café!\n";
_Static_assert(BUFFER_SIZE > 0, "buffer must not be empty");

#endif /* GLISTEN_SAMPLE_H */
