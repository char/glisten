namespace * example.catalog
include "common.thrift"
cpp_include "catalog_types.h"

typedef i64 ItemId
const i32 LIMIT = 25

/** Catalog operations. */
struct Item {
  1: required ItemId id,
  2: optional string name = "untitled",
  3: map<string, list<i32>> scores
}

exception NotFound {
  1: string message
}

service Catalog extends common.Base {
  Item get(1: ItemId id) throws (1: NotFound problem),
  oneway void refresh(1: list<ItemId> ids)
}
