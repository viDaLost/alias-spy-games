# Лера, уровень 28

Поздравление с днём рождения в виде мемного квеста: капча, «найди отличия»,
камень-ножницы-бумага, мемы, медкомиссия, битва с боссом, убегающая кнопка
и письмо с тортом в финале.

- `public/index.html` — вся страница (CSS и JS внутри, шрифты с Google Fonts).
- `public/img/` — фотографии, уменьшенные до 1100 px по длинной стороне.

## Развёртывание

Workflow `.github/workflows/deploy-lera-birthday-cloudflare.yml` выкладывает
`public/` на Cloudflare Workers как `alias-spy-games-lera-birthday` при пуше
в `main`, если менялась эта папка, или вручную через «Run workflow».
Нужны те же секреты, что и у остальных превью: `CLOUDFLARE_API_TOKEN`
и `CLOUDFLARE_ACCOUNT_ID`.

Адрес после деплоя: `https://alias-spy-games-lera-birthday.<поддомен>.workers.dev`.

## Локально

```sh
cd cloudflare/lera-birthday
npm install
npx wrangler dev
```

Или просто открыть `public/index.html` в браузере.
