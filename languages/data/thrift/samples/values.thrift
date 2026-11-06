# Configuration and annotations
namespace py examples.config

enum Mode {
  OFF = 0,
  ON = 1
}

union Setting {
  1: bool enabled = true
  2: double ratio = -1.25e+2
  3: set<string> names = ["one", 'two']
}

const map<string, i32> codes = {"ok": 1, "missing": -2}
typedef string Label (example.key = "value")
