Stage 31 — Server 3.12.7 NPC / GUARD / MAIL / MOB

SERVER FILES:
Server/config/map2-native-npcs-3127.json — editable NPC locations and 3.12 IDs
Server/config/map2-verified-prefabs-3127.json — 3.12 visual sources
Server/lib/city-3127.js — native 3.12 guards can render as creatures
Server/lib/admin-content-3127.js — mail time fields in seconds, isExist=0, legacy inbox support
Server/lib/environment-3127.js — initial mob listing + larger streaming batches
Server/lib/world.js — nearby mobs in the first scene snapshot
retail/npcs/NPC_ID_FIXES_STAGE31.json — reference findings

Known limitation: God of War exact 3.12 ID not established. 412 officer is a visible provisional stand-in, not a claim of being God of War. Class change master 421 does not establish hero selection. Client visual verification is required for guards/mobs.

INSTALL PATCH: stop server, back up, extract PATCH_STAGE31_3127_NPC_MOBS_MAIL.zip to D:\HeroLand_Local\, overwrite files, DO NOT replace Server/data. Restart START_SERVER.bat / node server.js.
