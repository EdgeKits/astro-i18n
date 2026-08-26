```
npm run i18n:seed
git checkout .i18n-hashes.json      # вернуть коммитнутый baseline — seed его переписывает
npx astro dev stop                  # убить демона, не просто Ctrl+C
rm -rf .wrangler/state/v3/cache     # выбросить локальный edge-кэш
npm run dev
```
