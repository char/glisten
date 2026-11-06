#include <stdint.h>
#include <stdio.h>

/* Store a reading and its origin. */
enum Source { SOURCE_LOCAL, SOURCE_REMOTE };
union Value {
    long integer;
    double real;
};
struct Reading {
    enum Source source;
    union Value value;
    unsigned flags, count;
    char label[32];
};

typedef struct Reading reading_t;
static const double SCALE = 1.25e-3;

static int print_reading(const reading_t *item) {
    if (item == NULL) goto missing;
    printf("%s: %ld\n", item->label, item->value.integer);
    for (unsigned i = 0; i < item->count; ++i) {
        switch (item->flags & (1u << i)) {
        case 0: continue;
        default: putchar('\x2a'); break;
        }
    }
    return 0;
missing:
    return -1;
}

int main(void) {
    reading_t sample = { .source = SOURCE_LOCAL, .value.integer = 42,
                         .flags = 03, .count = 2, .label = "温度" };
    float a = 0x1.fp+2f, b = .5F;
    wchar_t wide = L'\u03bb';
    (void)a; (void)b; (void)wide; (void)SCALE;
    return print_reading(&sample);
}
