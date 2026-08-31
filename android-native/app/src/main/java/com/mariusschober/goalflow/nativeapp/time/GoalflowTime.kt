package com.mariusschober.goalflow.nativeapp.time

import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * The single source of wall-clock truth for local calendar decisions.
 *
 * Dates are deliberately derived in the user's current zone while persisted
 * instants remain UTC-compatible. Callers that need a calendar date must use
 * [today] rather than constructing it from an instant in an arbitrary zone.
 */
interface GoalflowTimeProvider {
    val zoneId: ZoneId
    fun now(): Instant
    fun today(): LocalDate
}

class SystemGoalflowTimeProvider(
    private val clock: Clock = Clock.systemUTC(),
    private val zoneProvider: () -> ZoneId = { ZoneId.systemDefault() }
) : GoalflowTimeProvider {
    override val zoneId: ZoneId
        get() = zoneProvider()

    override fun now(): Instant = clock.instant()

    override fun today(): LocalDate = LocalDate.now(clock.withZone(zoneId))
}

/** Deterministic provider for boundary, DST, and migration tests. */
class FixedGoalflowTimeProvider(
    private val fixedClock: Clock,
    override val zoneId: ZoneId
) : GoalflowTimeProvider {
    override fun now(): Instant = fixedClock.instant()

    override fun today(): LocalDate = LocalDate.now(fixedClock.withZone(zoneId))
}

/** Material DatePicker represents a calendar date, not a local timestamp. */
fun localDateToDatePickerMillis(value: LocalDate): Long =
    value.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

fun datePickerMillisToLocalDate(value: Long): LocalDate =
    Instant.ofEpochMilli(value).atZone(ZoneOffset.UTC).toLocalDate()
