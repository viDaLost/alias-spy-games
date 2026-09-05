# Мост между веб-частью и Android вызывается только из JavaScript.
-keepclassmembers class com.vidalost.psalmbook.NativeBridge {
    public *;
}
