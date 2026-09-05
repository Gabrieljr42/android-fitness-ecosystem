package com.evolucao.treino.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.wear.ambient.AmbientLifecycleObserver
import com.evolucao.treino.wear.ui.EvolucaoWearApp
import com.evolucao.treino.wear.ui.WearWorkoutViewModel

class MainActivity : ComponentActivity() {
    private val viewModel: WearWorkoutViewModel by viewModels()

    private val ambientCallbacks = object : AmbientLifecycleObserver.AmbientLifecycleCallback {
        override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
            viewModel.setAmbient(true)
        }

        override fun onExitAmbient() {
            viewModel.setAmbient(false)
        }

        override fun onUpdateAmbient() {
            viewModel.setAmbient(true)
        }
    }
    private val ambientObserver by lazy { AmbientLifecycleObserver(this, ambientCallbacks) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycle.addObserver(ambientObserver)
        requestNotificationPermission()
        setContent { EvolucaoWearApp(viewModel) }
    }

    override fun onDestroy() {
        lifecycle.removeObserver(ambientObserver)
        super.onDestroy()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 424)
        }
    }
}
