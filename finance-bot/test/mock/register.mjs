// Подменяет модули платформы `sdk` / `sdk/db` локальными заглушками для тестов.
import { register } from 'node:module';
register(new URL('./hooks.mjs', import.meta.url));
