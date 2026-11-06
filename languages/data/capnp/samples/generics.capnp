@0xaad48d5c192f3571;

annotation obsolete(field, method) :Text;
const maxEntries :UInt32 = 0x400;
const defaults :List(Int32) = [0, -1, 075, 250];
const rate :Float64 = 2.5e2;

struct Pair(First, Second) {
  first @0 :First;
  second @1 :Second;
}
struct Message {
  pair @0 :Pair(Text, UInt64);
  details :group {
    label @1 :Text $obsolete("use pair");
    enabled @2 :Bool = true;
  }
}
