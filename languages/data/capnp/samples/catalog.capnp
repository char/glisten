@0xb813f725d4a690cd;

using Go = import "/go.capnp";
$Go.package("catalog");

# A record exposed by the inventory service.
struct Item {
  id @0 :UInt64;
  name @1 :Text = "unnamed";
  tags @2 :List(Text);
  payload @3 :Data = 0x"de ad be ef";
  status :union {
    available @4 :Void;
    reserved @5 :Text;
  }
}

enum SortOrder {
  ascending @0;
  descending @1;
}

struct Listing {
  item @0 :Item = (id = 1, name = "sample");
}

interface Inventory {
  fetch @0 (id :UInt64) -> (item :Item);
  list @1 (order :SortOrder) -> (items :List(Item));
}
