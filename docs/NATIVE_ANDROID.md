# Native Android client

Goalflow now has a native Android delivery target under `android-native/`.
It is a Kotlin + Jetpack Compose application backed by Room. The target is a
single-product client: it keeps the existing Goalflow vocabulary and execution
rules while giving Android its own fast, lifecycle-safe UI instead of placing
the web app inside a WebView.

## UX contracts

- Current shows one dominant next action after the daily planning gate is satisfied.
- Planning is the only place where today’s order is changed or confirmed.
- Frogs remain first-class commitments and cannot be moved forward.
- A monthly commitment must be converted to an exact local day before execution.
- Task and goal mutations commit to the local Room database before any optional
  cloud work; a temporary network failure cannot block local execution.
- Capture opens as a focused bottom sheet and supports the Android keyboard and
  back gesture without losing the draft.

## Local development

From the repository root:

```bash
./android-native/gradlew -p android-native test
./android-native/gradlew -p android-native lint
./android-native/gradlew -p android-native assembleDebug
./android-native/gradlew -p android-native assembleRelease
```

The native wrapper delegates to the repository’s checked-in Android wrapper so
there is one Gradle distribution configuration to maintain. The debug package
uses the safe application id `com.mariusschober.goalflow.dev`; the release
package uses `com.mariusschober.goalflow` and has no private signing material
in the repository.

## Verification

The `native-android` GitHub Actions job runs native unit tests, Android lint,
debug assembly, and an unsigned release assembly. It uploads the debug APK as
`goalflow-native-debug-apk`. Emulator and device tests remain separate from
the build gate and must be reported as unavailable when no Android runtime is
provided.

The native client shares the product’s conceptual model and local-first
guarantees, but its Room schema is intentionally versioned independently from
the browser IndexedDB schema. Cloud session handoff, sync reconciliation, and
backup interchange must use explicit adapters; no fake account or admin
bypass is permitted in the native build.
