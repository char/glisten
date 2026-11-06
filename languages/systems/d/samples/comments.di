module example.comments;

/** Documentation block, not nested. */
int parse(string input);

/++ Documentation with a /+ nested comment +/ inside. +/
int nested();

/+ outer
   /+ inner +/
   still outer
+/
auto hexFloat = 0x1.fp+3L;
auto binary = 0b1010_0101u;
auto complexValue = 3.5fi;
// Ordinary comment with /+ not nested +/
alias Callback = void function(int);
