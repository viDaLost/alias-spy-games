package com.vidalost.biblegames.games

import androidx.compose.runtime.Composable
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.data.CloudRepository
import com.vidalost.biblegames.model.GameKey
import com.vidalost.biblegames.model.PlayerProfile

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
    when (game) {
        GameKey.ALIAS -> AliasGame(assets, onBack)
        GameKey.COIMAGINARIUM -> CoimaginariumGame(assets, onBack)
        GameKey.GUESS -> GuessCharacterGame(assets, onBack)
        GameKey.DESCRIBE -> DescribeGame(assets, onBack)
        GameKey.SPY -> SpyGame(assets, onBack)
        GameKey.PAIRS -> MemoryGame(onBack)
        GameKey.MATCH_THREE -> BiblicalMatchThreeGame(onBack)
        GameKey.WOW -> BibleWowGame(assets, profile, onProfileChange, onBack)
        GameKey.WORD_SEARCH -> WordSearchGame(assets, profile, onProfileChange, onBack)
        GameKey.SACRED -> SacredWordGame(assets, profile, onProfileChange, onBack)
        GameKey.QUARTET -> QuartetGame(assets, cloud, userId, onRoomChanged, onBack)
        GameKey.SKETCH -> BibleSketchGame(cloud, userId, onRoomChanged, onBack)
    }
}
