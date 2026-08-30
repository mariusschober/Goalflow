import Foundation

/// Injected clock for deterministic timer logic (no decrement-integer drift).
protocol Clock: Sendable {
    func now() -> Date
}

struct SystemClock: Clock {
    func now() -> Date { Date() }
}

struct FixedClock: Clock {
    var fixed: Date
    func now() -> Date { fixed }
}

/// Mutable clock for tests.
final class ManualClock: Clock, @unchecked Sendable {
    private var _now: Date
    private let lock = NSLock()
    init(now: Date) { self._now = now }
    func now() -> Date { lock.lock(); defer { lock.unlock() }; return _now }
    func advance(by seconds: TimeInterval) {
        lock.lock(); _now = _now.addingTimeInterval(seconds); lock.unlock()
    }
    func set(_ date: Date) {
        lock.lock(); _now = date; lock.unlock()
    }
}
