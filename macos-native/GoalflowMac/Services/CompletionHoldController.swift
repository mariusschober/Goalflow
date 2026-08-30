import Foundation
final class CompletionHoldController: @unchecked Sendable {
    let duration: TimeInterval
    private var startedAt: Date?
    private let clock: any Clock
    private let lock = NSLock()
    init(isFrog: Bool, clock: any Clock = SystemClock()) { self.duration = isFrog ? 5.0 : 3.0; self.clock = clock }
    func start(at date: Date? = nil) { lock.lock(); startedAt = date ?? clock.now(); lock.unlock() }
    func cancel() { lock.lock(); startedAt = nil; lock.unlock() }
    func progress(at date: Date? = nil) -> Double {
        lock.lock(); guard let s = startedAt else { lock.unlock(); return 0 }; lock.unlock()
        let now = date ?? clock.now(); let elapsed = now.timeIntervalSince(s)
        return max(0, min(1, elapsed / duration))
    }
    func isCompleted(at date: Date? = nil) -> Bool { progress(at: date) >= 1.0 }
    var isHolding: Bool { lock.lock(); defer { lock.unlock() }; return startedAt != nil }
}
