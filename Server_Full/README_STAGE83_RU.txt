HERO'S LAND 3.12.7 — STAGE 83 — DEATH / MAINHALL / RE-ENTER
Исходная база: SERVER_STAGE82_NATIVE_HERO_PASSIVES_SLIME.zip.
Оригинальный клиент: HeroLand_Full_Client.z01–z12 + HeroLand_Full_Client.zip,
сборка от 22.02.2024; SHA-256 original assets/main/index.js:
5e26e97b06bf03ae0b60de7f2b318e6b2b7b51513d35b2bbc7ce0f3eea62304b
Оригинальный клиент и Index.js НЕ изменены.

ОБНАРУЖЕННАЯ ПРОБЛЕМА
Сервер Stage82 на запрос client exitBattle выполнял leave(), отправляя
дополнительную команду toMain. Оригинальный клиент 3.12 сам выполняет
переход mainHall после exitBattle и отправляет onPlayerRestartGame.
Повторная server-to-client команда toMain могла запустить второй release
игровой сцены и нарушить следующий вход (пропали actor/mobs).
Кроме того, server route onPlayerRestartGame был пустым no-op, поэтому
в сценарии notify без предварительного exitBattle старая world-сессия
оставалась активной.

КОНКРЕТНЫЕ ИЗМЕНЕНИЯ
Server_Full/Server/lib/world.js
1) Клиентский exitBattle: сохраняется IOGameLogoutRsp, settlement, сброс
   активной сессии, отправка updatePlayer, НО без дополнительного toMain.
2) onPlayerRestartGame (IOGameRestartNty): идемпотентная очистка world,
   результатов боя и временных серверных VFX, если exitBattle не пришёл.
   Повторный notify не сбрасывает аккаунт и не запускает второй переход.
3) При новом Play создаётся чистый actor, новый room snapshot,
   с самого начала city streaming queue и visibility cache.
4) Успешное окончание tutorial skip по-прежнему отправляет toMain,
   поскольку это серверное завершение учебного сценария, не client exit.
5) Создание и синхронизация hero initSelfBuff на новой игровой сущности
   после выхода/возвращения проверены тестом. Ранее реализованные пассивы
   Stage82 сохранены без изменения механик/формул.

ЭТАЛОН КЛИЕНТА
В оригинальном assets/main/index.js:
* около смещения 3354973: экран итогов отправляет exitBattle и
  onPlayerRestartGame и вызывает освобождение сцены;
* около смещения 7233930: dead-panel возвращает в mainHall тем же путём;
* около смещения 14053496: отдельный UI-выход отправляет
  onPlayerRestartGame и выполняет локальный scene release.
Смещения байтов относятся именно к указанному SHA-256 клиента.

ПРОВЕРЕНО ЛОКАЛЬНЫМИ ТЕСТАМИ
- Смерть → результат → exitBattle → onPlayerRestartGame → Play.
- Client notify БЕЗ exitBattle: очистка world-состояния.
- Повторный notify после удаления scene без лишнего расчёта награды.
- Различие client exitBattle и server guide skip.
- Повторное подключение WebSocket со свежей сущностью игрока.
- Потоки map2: свежие мобы передаются при приближении игрока к ним;
  у born главного города их закономерно нет в начальном радиусе 1850.
- Пассив Ниндзя 752 повторно создаётся уже на новом персонаже после
  достижения игрового условия lvl 10, без повторного использования старой ссылки.
- Полный набор stage1–82, в том числе боевые навыки и passives.

ОГРАНИЧЕНИЯ
Доказаны серверный цикл и реальные WebSocket-пакеты, а не отрисовка
в запущенном клиенте Windows. Если клиент после Stage83 всё ещё теряет
персонажа, нужны: DevTools Console, серверные метки [GAME ROUTE],
[WORLD] assigned, [WORLD LOAD], [CITY WORLD], [WORLD LOAD STALLED] и
/diagnostics/world непосредственно после повторного Play.
Система навыков всех 26 героев по-прежнему НЕ завершена 1:1.
Нельзя считать безусловно восстановленными все active/passive/
weapon-use/VFX/skin/star механики по одним только тестам протокола.
Постройки, в том числе уровни/визуалы, остаются в отложенном списке.
PVPBoard не изменён.

УСТАНОВКА
1. Остановить сервер и игру. Создать резервную копию
   D:\HeroLand_Local\Server_Full\Server\data, файла .env и своих конфигов.
2. Распаковать Stage83 ZIP в D:\HeroLand_Local\ с объединением папок.
   НЕ УДАЛЯТЬ сохранения игроков, не копировать из ZIP пустую папку data
   поверх заполненной базы.
3. Запускать D:\HeroLand_Local\Server_Full\START_SERVER.bat
   либо: cd /d D:\HeroLand_Local\Server_Full && node server.js
4. Сценарий проверки: Play → умереть → MainHall → Play → побегать за
   городом к мобам → выйти из клиента → снова войти → повторить.
5. Проверять, что в логах каждый новый Play содержит [WORLD] assigned,
   [WORLD LOAD] phase=enter и phase=loginLoadingFinish.
