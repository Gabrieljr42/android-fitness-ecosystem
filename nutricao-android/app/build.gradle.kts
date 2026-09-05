plugins {
    id("com.android.application")
    // Java-only: no kotlin.android / kapt (unlike evolucao-android which needs Room).
}

android {
    namespace = "com.nutricao.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.nutricao.app"
        minSdk = 24
        // Phase 3: targetSdk 34 = app/src/main/AndroidManifest.xml
        // (<uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34"/>),
        // aligned to build.ps1 PLATFORM android-34 / build-tools 34.0.0.
        // NOTE: build.ps1's aapt2 link step currently passes --target-sdk-version 29;
        // the manifest value (34) wins at install time for the manual APK, but the
        // Gradle cutover standardizes on 34 here. Reconcile to a single value at cutover.
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        getByName("debug") {
            // Shared debug keystore reused from the sibling project so manual
            // (build.ps1) and Gradle APKs share the same signature during migration.
            // Resolves from nutricao-android/ root to evolucao-android/_toolchain/debug.keystore.
            // Same credentials as both projects' local keystores: storePassword=android, keyAlias=ak, keyPassword=android.
            storeFile = rootProject.file("../evolucao-android/_toolchain/debug.keystore")
            storePassword = "android"
            keyAlias = "ak"
            keyPassword = "android"
            // FALLBACK (if the sibling checkout is absent): point at the local copy instead:
            //   storeFile = rootProject.file("_toolchain/debug.keystore")
            // or remove this block to let AGP fall back to ~/.android/debug.keystore.
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    // No kotlinOptions: Java-only (javac -source 8 -target 8 in build.ps1).

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    // Minimal: framework-only code (android.* + org.json, no AndroidX/Room/Work/Wearable).
    // Annotation kept for lint parity with evolucao-android; safe to drop if unused.
    implementation("androidx.annotation:annotation:1.8.2")
}
