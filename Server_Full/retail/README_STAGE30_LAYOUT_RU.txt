STAGE 30 — Организация папок сервера HeroLand

Server_Full/
  server.js                    — единственная точка запуска
  START_SERVER.bat             — запуск сервера
  ADMIN_PANEL.bat              — доступ к админке
  SHOW_ACCOUNTS.bat            — просмотр аккаунтов
  GRANT_ITEMS.bat              — выдача предметов
  MIGRATE_STAGE30.bat          — единоразовый перенос предыдущей структуры
  package.json                 — npm start / npm test
  Server/                      — ТОЛЬКО рабочие файлы
    lib/                      — логика
    config/                   — конфиги, схемы, настройки NPC и карты
    data/                     — учётные записи и сохранения (не заменяйте!)
    local-update/             — ответы для игрового лаунчера
    tools/                    — служебные команды
    tests/                    — тесты логики
    CLIENT_*_3127.json        — контракты клиента
  retail/                      — справочная информация (сервер не загружает)

ОБНОВЛЕНИЕ С УСТАНОВЛЕННОГО STAGE 29:
1. Остановите сервер.
2. Скопируйте всю папку Server_Full в резервную копию.
3. Распакуйте PATCH_STAGE30_SERVER_LAYOUT.zip в Server_Full с заменой.
4. Запустите MIGRATE_STAGE30.bat, дождитесь сообщения об успешном переносе.
5. Запустите START_SERVER.bat.

ВАЖНО: скрипт переноса забирает существующую базу из старой папки data/,
не заменяя её пустой базой. Не удаляйте data/ вручную!

Новая установка: распакуйте SERVER_FULL_STAGE30_SERVER_LAYOUT.zip и запустите START_SERVER.bat.
Редактирование NPC: Server/config/map2-native-npcs-3127.json
Админка (офлайн): ADMIN_PANEL.bat при остановленном сервере.
