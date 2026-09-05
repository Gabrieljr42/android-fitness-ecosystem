plugins {
    // 8.13.2: required by androidx.health.connect:connect-client:1.1.0 (needs AGP >= 8.9.1)
    // and supports compileSdk 36 required by current androidx stable artifacts.
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
