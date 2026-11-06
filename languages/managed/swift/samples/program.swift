import Foundation

@MainActor
final class Counter {
    private(set) var value: Int = 0

    func increment(by amount: Int = 1) async throws -> Int {
        value += amount
        return value
    }
}

let counter = Counter()
let doubled = [1, 2, 3].map { $0 * 2 }
Task { print("Value: \(try await counter.increment())") }
