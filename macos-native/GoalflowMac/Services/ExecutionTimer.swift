import Foundation
import Combine

/// Reference-time-derived timer engine.
/// Never stores a decrementing integer; always computes `now - startedAt`.
@MainActor
final class ExecutionTimer: ObservableObject {
    @Published private(set) var remainingSeconds: Int
    @Published private(set) var isActive: Bool = false

    private var state: ExecutionState?
    private var clock: any Clock
    private var cancellable: AnyCancellable?

    init(clock: any Clock = SystemClock()) {
        self.clock = clock
        self.remainingSeconds = 0
    }

    func configure(state: ExecutionState?, clock: any Clock) {
        self.state = state
        self.clock = clock
        if let s = state, s.isActive {
            remainingSeconds = s.remainingSeconds(now: clock.now())
            isActive = true
            startTicker()
        } else if let s = state {
            remainingSeconds = s.plannedDurationSeconds
            isActive = false
            stopTicker()
        } else {
            remainingSeconds = 0
            isActive = false
            stopTicker()
        }
    }

    func start(state: ExecutionState) {
        self.state = state
        self.remainingSeconds = state.remainingSeconds(now: clock.now())
        self.isActive = true
        startTicker()
    }

    func stop() {
        state = nil
        remainingSeconds = 0
        isActive = false
        stopTicker()
    }

    /// Tick recomputes from reference time.
    func tick() {
        guard let s = state, s.isActive else { return }
        remainingSeconds = s.remainingSeconds(now: clock.now())
        if remainingSeconds <= 0 {
            // Hold at zero for v1 (expiry handling in milestone B). Keep ticker alive at 0.
            remainingSeconds = 0
        }
    }

    private func startTicker() {
        stopTicker()
        cancellable = Timer.publish(every: 1.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                Task { @MainActor in self?.tick() }
            }
    }

    private func stopTicker() {
        cancellable?.cancel()
        cancellable = nil
    }

    var formattedRemaining: String {
        let m = remainingSeconds / 60
        let s = remainingSeconds % 60
        return String(format: "%02d:%02d", m, s)
    }

    /// For non-@MainActor inspection in tests.
    nonisolated func remainingForTest(state: ExecutionState, now: Date) -> Int {
        state.remainingSeconds(now: now)
    }
}
