package com.mariusschober.goalflow.nativeapp

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.PI
import kotlin.math.sin

/** Small, generated confirmation tones keep the APK light and work offline. */
class GoalflowSoundController {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()

    fun playCompletion(isFrog: Boolean = false) {
        executor.execute {
            runCatching { playNotes(if (isFrog) frogNotes else completionNotes) }
        }
    }

    private fun playNotes(notes: List<Pair<Double, Int>>) {
        val sampleRate = 44_100
        val gapSamples = (sampleRate * 0.025).toInt()
        val totalSamples = notes.sumOf { (_, durationMs) -> sampleRate * durationMs / 1_000 + gapSamples }
        val pcm = ShortArray(totalSamples)
        var cursor = 0
        notes.forEach { (frequency, durationMs) ->
            val noteSamples = sampleRate * durationMs / 1_000
            repeat(noteSamples) { index ->
                val attack = (index / (sampleRate * 0.0125)).coerceAtMost(1.0)
                val release = ((noteSamples - index) / (sampleRate * 0.045)).coerceAtMost(1.0)
                val envelope = (attack * release * 0.18).coerceIn(0.0, 0.18)
                pcm[cursor + index] = (sin(2.0 * PI * frequency * index / sampleRate) * Short.MAX_VALUE * envelope).toInt().toShort()
            }
            cursor += noteSamples + gapSamples
        }
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        val track = AudioTrack(
            attributes,
            format,
            pcm.size * 2,
            AudioTrack.MODE_STATIC,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        )
        try {
            track.write(pcm, 0, pcm.size)
            track.play()
            Thread.sleep(notes.sumOf { it.second }.toLong() + 80L)
        } finally {
            track.release()
        }
    }

    private companion object {
        val completionNotes = listOf(880.0 to 180, 1_046.5 to 220)
        val frogNotes = listOf(523.25 to 130, 659.25 to 130, 783.99 to 130, 1_046.5 to 220)
    }
}
