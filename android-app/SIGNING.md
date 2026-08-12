# BibleGames Android release signing

Пакет: `com.vidalost.biblegames`  
Постоянный release-сертификат SHA-256: `11:DF:F1:37:98:D2:09:55:DB:D0:93:01:68:3F:95:97:AB:C0:FE:F0:B9:6B:BB:D6:6B:AD:CC:F2:09:75:D6:38`

Приватный файл `biblegames-release.jks` **не хранится в Git**. Он передаётся в GitHub Actions только через repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Release-сборка специально падает без полного набора production credentials и не имеет fallback на Android Debug key. Все будущие пользовательские APK/AAB должны использовать один и тот же постоянный ключ.

Перед распространением APK проверяйте сертификат через `apksigner verify --verbose --print-certs` и сравнивайте SHA-256 с указанным выше.
