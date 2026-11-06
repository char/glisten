// Lexical probes; this file is intentionally not a translation unit.
#define continued(x) ((x) + \
    1) // directive continuation
#define iffy 12
  #include <missing-header
int after_header = 1;
/* comment before directive */ #define NOT_AT_START 2
  /* first */ /* second */ #include <after-comments.h>
int before_comment; /* not a directive */ #define NO 1
/* crosses
   lines */ #define AFTER_COMMENT 3
int prior /* crosses
   lines */ #define AFTER_PRIOR 4
typedef unsigned long Counter, *CounterPtr;
typedef enum { FIRST, SECOND } Choice;
typedef union { enum { SMALL, LARGE } size; int count; } Sized;
typedef int Callback(int argument, int other);

int iffy = 0, return_value = 1, while2 = 2;
int _Atomicity = 3, sizeof_value = 4;
struct Odd {
    int (*callback)(int arg);
    unsigned bits : 3;
    int first, second[2];
};
void probe(struct Odd *p) {
    p->callback(1);
    p /* comment */ -> first = 0b1010;
    if (iffy) { retry: ++iffy; }
    goto /* comment */ retry;
    const char *s = "quote: \" slash: \\ tab: \t";
    const char *escapes = "\x123abcZ \u00e9f \U0001F6420 \1x \12x \1234";
    const char *broken = "unterminated
    int recovered = 0x1p-2;
    char bad = '\q';
    double dots = 1..2;
    // a continued comment \
    still a comment
    recovered++;
}
// Deliberately left open at end of file:
/* unfinished comment, café
