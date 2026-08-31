package com.mariusschober.goalflow.nativeapp.time

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class GoalflowTimeTest {
    @Test
    fun `today stays a local calendar date at both sides of UTC`() {
        val instant = Instant.parse("2024-02-29T23:59:59.999Z")
        val expected = mapOf(
            "Etc/GMT+12" to "2024-02-29",
            "America/Los_Angeles" to "2024-02-29",
            "UTC" to "2024-02-29",
            "Europe/Berlin" to "2024-03-01",
            "Atlantic/Canary" to "2024-02-29",
            "Pacific/Kiritimati" to "2024-03-01"
        )

        expected.forEach { (zone, date) ->
            val provider = FixedGoalflowTimeProvider(
                Clock.fixed(instant, ZoneId.of("UTC")),
                ZoneId.of(zone)
            )
            assertEquals(zone, LocalDate.parse(date), provider.today())
        }
    }

    @Test
    fun `DST transition and leap day remain valid local dates`() {
        val provider = FixedGoalflowTimeProvider(
            Clock.fixed(Instant.parse("2024-03-10T08:00:00Z"), ZoneId.of("UTC")),
            ZoneId.of("America/Los_Angeles")
        )
        assertEquals(LocalDate.parse("2024-03-10"), provider.today())

        val leap = LocalDate.parse("2024-02-29")
        assertEquals(leap, datePickerMillisToLocalDate(localDateToDatePickerMillis(leap)))
    }

    @Test
    fun `date picker conversion is zone independent`() {
        val date = LocalDate.parse("2030-12-31")
        val millis = localDateToDatePickerMillis(date)
        listOf("Etc/GMT+12", "America/Los_Angeles", "UTC", "Europe/Berlin", "Pacific/Kiritimati")
            .forEach { zone ->
                assertEquals(date, millis.let(::datePickerMillisToLocalDate))
                assertEquals(zone, ZoneId.of(zone).id)
            }
    }
}
