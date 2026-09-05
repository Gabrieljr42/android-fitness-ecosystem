package com.evolucao.treino.wear

import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 26)
class WearEmptyStateUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun smallRoundEmptyStateHasUsefulActionAndLargeTouchTarget() {
        compose.onNodeWithText("Treino de hoje").assertIsDisplayed()
        compose.onNodeWithText("Nenhum treino recebido").assertIsDisplayed()
        compose.onNodeWithText("Tentar sincronizar")
            .assertIsDisplayed()
            .assertHasClickAction()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test fun userInterfaceNeverExposesProtocolIdentifiersOrJson() {
        compose.onAllNodesWithText("eventId", substring = true).fetchSemanticsNodes().let {
            check(it.isEmpty())
        }
        compose.onAllNodesWithText("protocolVersion", substring = true).fetchSemanticsNodes().let {
            check(it.isEmpty())
        }
    }
}
