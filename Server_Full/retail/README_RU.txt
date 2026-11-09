STAGE41: сначала прочитайте release-notes/README_STAGE41_RU.txt.
Полное восстановление 1:1 ещё не завершено.

STAGE40: сначала прочитайте release-notes/README_STAGE40_RU.txt.
Полное восстановление 1:1 ещё не завершено.

STAGE39: сначала прочитайте release-notes/README_STAGE39_RU.txt.
Полное восстановление 1:1 ещё не завершено.

HeroLand Local Server (3.12.7) — каталог retail, Stage 29
===========================================================

Папка retail предназначена ТОЛЬКО для материалов изучения и анализа.
Сервер при обычном запуске не загружает файлы отсюда.

СТРУКТУРА
npcs/
  ALL_NPCS_3127.json             Список известных NPC и сведения о моделях.
  ALL_NPCS_3127.csv              Краткая таблица NPC.
  ALL_NPCS_PLACEMENTS_3127.csv   Справочная таблица текущих NPC и координат.

audits/
  COVERAGE_STAGE11_226.json      Старый отчёт о покрытии маршрутов клиента.
  MAP2_GIFT_STAGE25_AUDIT.json   Отчёт по картам и Gift (Stage 25).
  MAP2_STAGE26_AUDIT.json        Проверка города Stage 26.
  STAGE27_AUDIT.json             Отчёт Stage 27.
  STAGE28_AUDIT.json             Отчёт Stage 28.

client-reference/
  PROTO_TYPES_FROM_CLIENT_3127.json   Справочник имён protobuf-сообщений.
  client-native-assets-3127.json     Справочный перечень ассетов клиента.

release-notes/
  README_STAGE25_RU.txt
  README_STAGE26_RU.txt
  README_STAGE27_RU.txt
  README_STAGE28_RU.txt          История предыдущих этапов.

FILE_MANIFEST.json                Список перенесённых файлов и старых путей.

ЧТО НЕ ПЕРЕНОСИТЬ В RETAIL
- server.js, lib/, config/schemes/, config/world-content-3127.json.
- config/map2-native-npcs-3127.json — НАСТОЯЩИЕ NPC и координаты.
- config/city-main-3127.json, config/map2-verified-prefabs-3127.json — карта.
- CLIENT_CONTRACT_3127.json — используется server.js и lib/codec.js.
- CLIENT_ENUMS_3127.json — используется lib/world.js.
- CLIENT_ROUTES_3127.json — используется lib/coverage-3127.js.
- tests/ — исполняемые проверки, запускаются через npm test; не справочник.
- tools/ — исполняемые инструменты администрирования и установки.
- data/ — сохранения пользователей, НЕ УДАЛЯТЬ и не заменять.

ВАЖНО
Файлы CSV/JSON из retail НЕ являются игровыми настройками. Менять
позицию NPC в ALL_NPCS_PLACEMENTS_3127.csv бесполезно для сервера.
Для изменения NPC редактируйте config/map2-native-npcs-3127.json.

Файлы Stage25–28 оставлены как исторические отчёты. Указанные в них
старые пути справочных файлов теперь начинаются с retail/.

УСТАНОВКА НА СУЩЕСТВУЮЩИЙ STAGE28
1. Остановить сервер и сделать резервную копию Server_Full.
2. Распаковать PATCH_STAGE29_RETAIL.zip, скопировать Server_Full поверх
   существующей папки Server_Full с заменой, не удаляя data/.
3. Запустить tools\APPLY_RETAIL_STAGE29.bat — переносит/удаляет старые
   справочные копии из корня и config/ после установки новых файлов.
   Если старая копия отличается от новой, она сохраняется в
   retail\previous_root_files\. При конфликте существующая копия не удаляется.
4. Запустить START_SERVER.bat или node server.js.

Полный архив SERVER_FULL_STAGE29_RETAIL.zip уже содержит готовую структуру.
Он НЕ включает пользовательскую data/; не удаляйте свою текущую data/.

STAGE30: Все рабочие файлы находятся в Server/, справочные остаются здесь.
Инструкция: retail/README_STAGE30_LAYOUT_RU.txt
