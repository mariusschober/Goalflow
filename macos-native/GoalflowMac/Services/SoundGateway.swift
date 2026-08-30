import Foundation
import AVFoundation
protocol SoundGateway: Sendable { func tick(volume: Float); func setEnabled(_ enabled: Bool); func setVolume(_ volume: Float) }
final class NoopSoundGateway: SoundGateway, @unchecked Sendable { func tick(volume: Float) {}; func setEnabled(_ enabled: Bool) {}; func setVolume(_ volume: Float) {} }
final class TickSoundGateway: SoundGateway, @unchecked Sendable {
    private var isEnabled: Bool = true; private var volume: Float = 0.6; private let lock = NSLock()
    init() {}
    func setEnabled(_ enabled: Bool) { lock.lock(); isEnabled = enabled; lock.unlock() }
    func setVolume(_ volume: Float) { lock.lock(); self.volume = max(0, min(1, volume)); lock.unlock() }
    func tick(volume vol: Float) {
        lock.lock(); let enabled = isEnabled; let baseVol = volume; lock.unlock()
        guard enabled else { return }
        let v = baseVol * max(0, vol); guard v > 0.01 else { return }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in self?.playTick(volume: v) }
    }
    private func playTick(volume: Float) {
        let sampleRate: Double = 44_100; let duration: Double = 0.05
        let frames = AVAudioFrameCount(sampleRate * duration)
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return }
        buf.frameLength = frames
        let ptr = buf.floatChannelData![0]
        for i in 0..<Int(frames) {
            let noise = Float.random(in: -1...1)
            let t = Float(i) / Float(sampleRate)
            let band = sin(2 * .pi * 1500 * t) * 0.5
            let envelope: Float = (i < Int(frames) * 4 / 5) ? 1.0 : exp(-Float(i - Int(frames)*4/5) * 0.02)
            ptr[i] = (noise * 0.3 + band * 0.7) * envelope * volume * 0.18
        }
        let engine = AVAudioEngine(); let player = AVAudioPlayerNode()
        engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: format)
        do { try engine.start(); player.play(); player.scheduleBuffer(buf, at: nil, options: .interrupts, completionHandler: { engine.stop() }); Thread.sleep(forTimeInterval: duration + 0.02) } catch {}
    }
}
