package com.vidalost.biblegames

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.data.CloudRepository
import com.vidalost.biblegames.data.AndroidSessionStore
import com.vidalost.biblegames.ui.BibleGamesTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT,
            ),
            navigationBarStyle = SystemBarStyle.light(
                android.graphics.Color.rgb(224, 242, 254),
                android.graphics.Color.rgb(224, 242, 254),
            ),
        )
        val assets = AssetRepository(applicationContext)
        val sessionStore = AndroidSessionStore(applicationContext)
        val cloud = CloudRepository(sessionStore.load()?.token.orEmpty())
        setContent {
            BibleGamesTheme {
                AndroidParityApp(
                    assets = assets,
                    cloud = cloud,
                    sessionStore = sessionStore,
                )
            }
        }
    }
}
