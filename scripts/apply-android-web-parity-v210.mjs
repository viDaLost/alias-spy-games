import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    if (source.includes(after)) return source;
    throw new Error(`Patch anchor missing: ${label}`);
  }
  return source.replace(before, after);
}

// Home: same five image layers, continue card and progress summary as current web menu.
{
  const path = 'android-app/app/src/main/java/com/vidalost/biblegames/App.kt';
  let src = read(path);
  src = replaceOnce(src,
    'import androidx.compose.foundation.lazy.items\n',
    'import androidx.compose.foundation.lazy.items\nimport androidx.compose.foundation.lazy.rememberLazyListState\n',
    'App rememberLazyListState import');
  src = replaceOnce(src,
    'import com.vidalost.biblegames.ui.GlassCard\n',
    'import com.vidalost.biblegames.ui.GlassCard\nimport com.vidalost.biblegames.ui.HomeContinueCard\nimport com.vidalost.biblegames.ui.HomeParallaxBackground\nimport com.vidalost.biblegames.ui.HomeProgressSummary\n',
    'App home parity imports');
  src = replaceOnce(src,
`    val fontScale = LocalDensity.current.fontScale
    val columns = when {
        screenWidth < 380 || fontScale > 1.15f -> 1
        screenWidth >= 840 -> 4
        screenWidth >= 600 -> 3
        else -> 2
    }
    AppBackground {
        LazyColumn(
            Modifier.fillMaxSize(),`,
`    val fontScale = LocalDensity.current.fontScale
    val listState = rememberLazyListState()
    val columns = when {
        screenWidth < 380 || fontScale > 1.15f -> 1
        screenWidth >= 840 -> 4
        screenWidth >= 600 -> 3
        else -> 2
    }
    HomeParallaxBackground(assets, listState) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,`,
    'Home parallax shell');
  src = replaceOnce(src,
`            if (history.isNotEmpty()) {
                if (!recentHidden) {`,
`            history.firstOrNull()?.let(GameKey::fromRoute)?.let { latest ->
                item { HomeContinueCard(latest, assets) { onOpenGame(latest) } }
            }
            item { HomeProgressSummary(profile) }
            if (history.isNotEmpty()) {
                if (!recentHidden) {`,
    'Home continue/progress widgets');
  write(path, src);
}

// Biblical Treasures V45: web removed Ark as an in-game booster and added targeted Covenant Rainbow.
{
  const path = 'android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeEngine.kt';
  let src = read(path);
  src = replaceOnce(src,
`    ARK("Ноев ковчег", "Ковчег", "Перемешивает и даёт две особые", 8, "assets/biblical-match-three/icons-v17/ark.webp", false),`,
`    RAINBOW("Радуга Завета", "Радуга", "Превращает выбранную фишку в радужную", 8, "assets/biblical-match-three/icons-v17/covenant.webp", true),`,
    'BMT V45 booster enum');
  src = replaceOnce(src,
`            BmtBooster.ARK -> emptySet()`,
`            BmtBooster.RAINBOW -> emptySet()`,
    'BMT resolveBooster exhaustive branch');
  write(path, src);
}

{
  const path = 'android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeGame.kt';
  let src = read(path);
  src = replaceOnce(src,
`    fun useTargetBooster(index: Int) {
        val booster = targetBooster ?: return
        if (busy || result != null || boardWallet < booster.cost || board.getOrNull(index) == null) return
        updateWallet(boardWallet - booster.cost)
        targetBooster = null
        selected = null
        busy = true
        scope.launch {
            applyTurn(BmtEngine.resolveBooster(board, blockers, config, booster, index))
            delay(100)
            busy = false
            finishIfNeeded()
        }
    }

    fun chooseBooster(booster: BmtBooster) {
        if (busy || result != null || boardWallet < booster.cost) return
        if (booster == BmtBooster.ARK) {
            updateWallet(boardWallet - booster.cost)
            board = BmtEngine.reshuffle(board, config, addArkSpecials = true)
            selected = null
            hint = null
        } else targetBooster = if (targetBooster == booster) null else booster
    }`,
`    fun useTargetBooster(index: Int) {
        val booster = targetBooster ?: return
        if (busy || result != null || boardWallet < booster.cost || board.getOrNull(index) == null) return
        if (booster == BmtBooster.RAINBOW && blockers.containsKey(index)) return
        updateWallet(boardWallet - booster.cost)
        targetBooster = null
        selected = null
        hint = null
        if (booster == BmtBooster.RAINBOW) {
            val cell = board.getOrNull(index) ?: return
            board = board.toMutableList().also { it[index] = cell.copy(special = BmtSpecial.RAINBOW) }
            return
        }
        busy = true
        scope.launch {
            applyTurn(BmtEngine.resolveBooster(board, blockers, config, booster, index))
            delay(100)
            busy = false
            finishIfNeeded()
        }
    }

    fun chooseBooster(booster: BmtBooster) {
        if (busy || result != null || boardWallet < booster.cost) return
        targetBooster = if (targetBooster == booster) null else booster
    }`,
    'BMT V45 target booster behavior');
  write(path, src);
}

// Quartet server has room chat; surface the same state/action in native Android.
{
  const path = 'android-app/app/src/main/java/com/vidalost/biblegames/games/OnlineGames.kt';
  let src = read(path);
  src = replaceOnce(src,
`    var selectedTarget by rememberSaveable { mutableStateOf("") }
    var selectedCard by rememberSaveable { mutableStateOf("") }
    val state = session.state`,
`    var selectedTarget by rememberSaveable { mutableStateOf("") }
    var selectedCard by rememberSaveable { mutableStateOf("") }
    var chat by rememberSaveable { mutableStateOf("") }
    val state = session.state`,
    'Quartet chat state');
  src = replaceOnce(src,
`                    else -> LoadingCard("Получаем состояние комнаты…")
                }
            }
        }
    }
}

@Composable
private fun ConnectionStrip`,
`                    else -> LoadingCard("Получаем состояние комнаты…")
                }
            }
        }
        val chatState = state
        if (session.roomId.isNotBlank() && chatState != null) {
            Spacer(Modifier.height(10.dp))
            SketchChat(
                chatState.optJSONArray("chat").objects(),
                chatState.optJSONObject("me")?.optString("playerId").orEmpty(),
                chat,
                { chat = it.take(500) },
            ) {
                val text = chat.trim()
                if (text.isNotEmpty()) {
                    session.action("chat", JSONObject().put("text", text))
                    chat = ""
                }
            }
        }
    }
}

@Composable
private fun ConnectionStrip`,
    'Quartet chat panel');
  write(path, src);
}

console.log('Android/web parity patches applied.');
