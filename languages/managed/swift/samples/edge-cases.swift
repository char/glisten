/* outer /* nested */ still outer */
#if canImport(Foundation)
@available(macOS 14, *)
func describe<T>(_ value: T?) -> some CustomStringConvertible {
    let get = 1
    let any = get / 2
    let text = ##"wrong quote "# stays; \#(plain) and \##(get + 1)"##
    return text
}
#endif

struct Sample {
    var amount: Int {
        get { storage }
        set(newValue) { storage = newValue }
    }
    var storage = 0 {
        willSet { print(newValue) }
        didSet { print(oldValue) }
    }
}
let macro = #stringify(1 + 2)
let available = #available(macOS 14, *)
protocol Readable { var id: Int { get } }
let values = (0..<5).map { $0 }
let result = object.default
