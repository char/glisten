typedef map<string, list<other.Record>> (cpp.template = "Table") Records
const list<i64> DEFAULT_IDS = [1, 2, 3]

@compat.Wrapper{name = Options{value = "nested"}}
struct Request {
  1: required list cpp_type "std::vector" <other.Record> records (go.name = "Items")
  optional i32 count = 7
  3: string string
}

service Search extends other.Base {
  Records find(1: Request request, 2: optional i32 limit = 10)
    throws (1: other.Failure cause) (trace.enabled = "yes")
}

interaction Session {
  stream<other.Record> follow(1: Request request)
}
