// Phase 3 SDK/AGP alignment: AGP pinned at 8.4.2 (deferred bump to 8.13.x).
// Deferred because Room 2.6.1 (runtime/compiler/testing + room-ktx 2.6.1 in :wear) +
// work-runtime 2.9.1 (:app) / work-runtime-ktx 2.9.1 (:wear) +
// play-services-wearable 18.2.0 + :wear (compileSdk/targetSdk 34) / :protocol library
// (compileSdk 34, no targetSdk) still need verification against AGP 8.13.x
// (Gradle 8.13, JDK 17, namespace/BuildConfig behavior changes). Coach already runs
// AGP 8.13.2 for compileSdk 36. Do NOT bump Evolucao compileSdk/targetSdk to 35/36
// here — see docs/configuration.md deferred-bump plan.
buildscript {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.24")
    }
}
