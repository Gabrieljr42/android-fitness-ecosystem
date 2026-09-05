package com.coach.app.domain

enum class MetricStatus {
    OBSERVED,
    INFORMED,
    ESTIMATED,
    ABSENT
}

enum class DataSource(val isDemo: Boolean) {
    HEALTH_CONNECT(false),
    EVOLUCAO(false),
    NUTRITRACK(false),
    STRAVA(false),
    CHECK_IN(false),
    LOCAL_ESTIMATE(false),
    DEMO_HEALTH_CONNECT(true),
    DEMO_CHECK_IN(true),
    DEMO_ESTIMATE(true)
}
