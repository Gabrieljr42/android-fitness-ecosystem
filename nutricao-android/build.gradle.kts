// NutriTrack — root build script (SCAFFOLD ONLY, Phase 4).
// Side-by-side with the canonical manual build (build.ps1). Not yet wired to CI.
// AGP version intentionally matches evolucao-android (8.4.2) as the starting baseline.
// Phase 3: deferred bump to 8.13.x — keep in lockstep with evolucao-android after its
// Room/Wearable/Work dep verification passes (this module is Java-only so low risk,
// but lockstep avoids toolchain skew). See docs/configuration.md deferred-bump plan.
buildscript {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.2")
        // Java-only project (3 .java files, no Kotlin, no Room/Wear).
        // Add org.jetbrains.kotlin:kotlin-gradle-plugin only if Kotlin sources are introduced later.
    }
}
