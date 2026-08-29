package com.vidalost.biblegames.games

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.data.CloudRepository
import com.vidalost.biblegames.model.GameKey
import com.vidalost.biblegames.model.PlayerProfile
import com.vidalost.biblegames.ui.GameEntryLoader
import kotlinx.coroutines.delay

@Composable
fun GameHost(
    game: GameKey,
    assets: AssetRepository,
    cloud: CloudRepository,
    userId: String,
    profile: PlayerProfile,
    onProfileChange: (PlayerProfile) -> Unit,
    onRoomChanged: (String) -> Unit,
    onBack: () -> Unit,
) {
    var entryReady by remember(game) { mutableStateOf(false) }
    LaunchedEffect(game) {
        entryReady = false
        // Web loader guarantees a visible transition instead of a one-frame flash.
        delay(620)
        entryReady = true
    }

    if (!entryReady) {
        GameEntryLoader(game, assets)
        return
    }

    when (game) {
        GameKey.ALIAS -> AliasGame(assets, onBack)
        GameKey.COIMAGINARIUM -> CoimaginariumGame(assets, onBack)
        GameKey.GUESS -> GuessCharacterGame(assets, onBack)
        GameKey.DESCRIBE -> DescribeGame(assets, onBack)
        GameKey.SPY -> SpyGame(assets, onBack)
        GameKey.PAIRS -> MemoryGame(onBack)
        GameKey.MATCH_THREE -> BiblicalMatchThreeGame(assets, profile, onProfileChange, onBack)
        GameKey.WOW -> BibleWowGame(assets, profile, onProfileChange, onBack)
        GameKey.WORD_SEARCH -> WordSearchGame(assets, profile, onProfileChange, onBack)
        GameKey.SACRED -> SacredWordGame(assets, profile, onProfileChange, onBack)
        GameKey.QUARTET -> QuartetGame(assets, cloud, userId, onRoomChanged, onBack)
        GameKey.SKETCH -> BibleSketchGame(cloud, userId, onRoomChanged, onBack)
    }
}
