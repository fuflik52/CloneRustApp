using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Libraries.Covalence;
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("PanRust", "PanRust.io", "1.1.0")]
    public class PanRust : RustPlugin
    {
        private static PanRust _instance;
        private static Configuration _config;
        private static MetaInfo _metaInfo;
        private static PlayerStatsData _statsData;

        private const string API_URL = "http://app.bublickrust.ru/api";

        // Очереди для отправки данных
        private List<ChatMessageDto> _chatQueue = new List<ChatMessageDto>();
        private List<KillEventDto> _killsQueue = new List<KillEventDto>();
        private Dictionary<string, HitRecord> _woundedHits = new Dictionary<string, HitRecord>();

        // Сессии игроков для подсчёта времени
        private Dictionary<string, DateTime> _playerSessions = new Dictionary<string, DateTime>();

        #region Data Classes

        // Структура для хранения информации о попадании
        private struct HitRecord
        {
            public BasePlayer InitiatorPlayer;
            public string Weapon;
            public float Distance;
            public bool IsHeadshot;
            public string Bone;

            public HitRecord(HitInfo info)
            {
                InitiatorPlayer = info?.InitiatorPlayer;
                Weapon = info?.Weapon?.GetItem()?.info?.displayName?.english ?? 
                         info?.WeaponPrefab?.ShortPrefabName ?? "unknown";
                Distance = info?.ProjectileDistance ?? 0f;
                IsHeadshot = info?.isHeadshot ?? false;
                Bone = info?.boneName ?? "";
            }
        }

        // Статистика игрока
        public class PlayerStats
        {
            public int kills = 0;
            public int deaths = 0;
            public int headshots = 0;
            public int bodyshots = 0;
            public int limbshots = 0;
            public double playtime_seconds = 0; // Общее время на сервере в секундах
            public int reports_count = 0;
            public long first_seen = 0;
            public long last_seen = 0;
            public List<SessionRecord> sessions = new List<SessionRecord>();
        }

        public class SessionRecord
        {
            public long start_time;
            public long end_time;
            public double duration_seconds;
        }

        // Хранилище статистики всех игроков
        public class PlayerStatsData
        {
            public Dictionary<string, PlayerStats> players = new Dictionary<string, PlayerStats>();

            public static PlayerStatsData Read()
            {
                if (!Interface.Oxide.DataFileSystem.ExistsDatafile("PanRust_Stats"))
                {
                    return new PlayerStatsData();
                }
                return Interface.Oxide.DataFileSystem.ReadObject<PlayerStatsData>("PanRust_Stats");
            }

            public static void Write(PlayerStatsData data)
            {
                Interface.Oxide.DataFileSystem.WriteObject("PanRust_Stats", data);
            }
        }

        // DTO для отправки убийств
        public class KillEventDto
        {
            public string killer_steam_id;
            public string victim_steam_id;
            public string weapon;
            public float distance;
            public bool is_headshot;
            public string bone;
            public long timestamp;
        }

        #endregion

        #region Meta (хранит секретный ключ)
        private class MetaInfo
        {
            public string SecretKey = "";

            public static MetaInfo Read()
            {
                if (!Interface.Oxide.DataFileSystem.ExistsDatafile("PanRust_Meta"))
                {
                    return new MetaInfo();
                }
                return Interface.Oxide.DataFileSystem.ReadObject<MetaInfo>("PanRust_Meta");
            }

            public static void Write(MetaInfo meta)
            {
                Interface.Oxide.DataFileSystem.WriteObject("PanRust_Meta", meta);
            }
        }
        #endregion

        #region Configuration
        private class Configuration
        {
            [JsonProperty("Update Interval (seconds)")]
            public float UpdateInterval = 5f;

            [JsonProperty("Chat Update Interval (seconds)")]
            public float ChatUpdateInterval = 1f;

            [JsonProperty("Kills Update Interval (seconds)")]
            public float KillsUpdateInterval = 5f;

            [JsonProperty("Stats Save Interval (seconds)")]
            public float StatsSaveInterval = 60f;
        }

        protected override void LoadConfig()
        {
            base.LoadConfig();
            try { _config = Config.ReadObject<Configuration>(); }
            catch { LoadDefaultConfig(); }
            SaveConfig();
        }

        protected override void LoadDefaultConfig() => _config = new Configuration();
        protected override void SaveConfig() => Config.WriteObject(_config);
        #endregion

        #region DTO Classes
        private class PlayerDto
        {
            public string steam_id;
            public string name;
            public string ip;
            public int ping;
            public bool online;
            public string position;
            public string server;
        }

        private class ChatMessageDto
        {
            public string steam_id;
            public string name;
            public string message;
            public bool is_team;
            public long timestamp;
        }

        private class StatePayload
        {
            public string hostname = ConVar.Server.hostname;
            public int port = ConVar.Server.port;
            public int online = BasePlayer.activePlayerList.Count;
            public int max_players = ConVar.Server.maxplayers;
            public List<PlayerDto> players = new List<PlayerDto>();
        }

        private class StatsPayload
        {
            public string steam_id;
            public PlayerStats stats;
        }
        #endregion

        #region Hooks
        private void OnServerInitialized()
        {
            _instance = this;
            _metaInfo = MetaInfo.Read();
            _statsData = PlayerStatsData.Read();

            if (string.IsNullOrEmpty(_metaInfo.SecretKey))
            {
                Puts("========================================");
                Puts("PanRust: Сервер не подключен!");
                Puts("1. Создайте сервер в панели: http://app.bublickrust.ru");
                Puts("2. Скопируйте Secret Key");
                Puts("3. Введите в консоль: panrust.pair ВАШ_SECRET_KEY");
                Puts("========================================");
            }
            else
            {
                Puts("PanRust: Подключен к панели");
                
                timer.Once(2f, () => SyncAllPlayers());
                
                timer.Every(_config.UpdateInterval, () => SendStateUpdate());
                timer.Every(_config.ChatUpdateInterval, () => SendChatMessages());
                timer.Every(_config.KillsUpdateInterval, () => SendKillsData());
                timer.Every(_config.StatsSaveInterval, () => SaveStats());
                timer.Every(1f, () => FetchCommands());
            }
        }

        private void Unload()
        {
            // Завершаем все активные сессии
            foreach (var session in _playerSessions.ToList())
            {
                EndPlayerSession(session.Key);
            }
            SaveStats();
            _instance = null;
        }

        private void OnNewSave(string filename)
        {
            // При вайпе можно сбросить статистику или оставить
            Puts("PanRust: Обнаружен вайп сервера");
        }
        #endregion

        #region Player Connection Hooks
        private void OnPlayerConnected(BasePlayer player)
        {
            StartPlayerSession(player.UserIDString);
            
            // Обновляем first_seen если это первый вход
            var stats = GetOrCreateStats(player.UserIDString);
            if (stats.first_seen == 0)
            {
                stats.first_seen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            }
            stats.last_seen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            
            timer.Once(1f, () => SendStateUpdate());
        }

        private void OnPlayerDisconnected(BasePlayer player, string reason)
        {
            EndPlayerSession(player.UserIDString);
            
            var stats = GetOrCreateStats(player.UserIDString);
            stats.last_seen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            
            timer.Once(1f, () => SendStateUpdate());
        }

        private void StartPlayerSession(string steamId)
        {
            if (!_playerSessions.ContainsKey(steamId))
            {
                _playerSessions[steamId] = DateTime.UtcNow;
            }
        }

        private void EndPlayerSession(string steamId)
        {
            if (_playerSessions.TryGetValue(steamId, out var startTime))
            {
                var duration = (DateTime.UtcNow - startTime).TotalSeconds;
                var stats = GetOrCreateStats(steamId);
                stats.playtime_seconds += duration;
                
                // Добавляем запись сессии
                stats.sessions.Add(new SessionRecord
                {
                    start_time = new DateTimeOffset(startTime).ToUnixTimeMilliseconds(),
                    end_time = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    duration_seconds = duration
                });

                // Ограничиваем количество сессий (последние 100)
                if (stats.sessions.Count > 100)
                {
                    stats.sessions = stats.sessions.Skip(stats.sessions.Count - 100).ToList();
                }

                _playerSessions.Remove(steamId);
            }
        }
        #endregion

        #region Combat Hooks
        private void OnPlayerWound(BasePlayer victim, HitInfo info)
        {
            if (info?.InitiatorPlayer == null || info.InitiatorPlayer == victim)
                return;

            // Сохраняем информацию о попадании для случая если игрок умрёт
            _woundedHits[victim.UserIDString] = new HitRecord(info);
        }

        private void OnPlayerRespawn(BasePlayer player)
        {
            _woundedHits.Remove(player.UserIDString);
        }

        private void OnPlayerRecovered(BasePlayer player)
        {
            _woundedHits.Remove(player.UserIDString);
        }

        private void OnPlayerDeath(BasePlayer victim, HitInfo info)
        {
            if (victim == null) return;

            var hitRecord = GetRealHitInfo(victim, info);
            
            // Обновляем статистику жертвы
            var victimStats = GetOrCreateStats(victim.UserIDString);
            victimStats.deaths++;

            // Если убийца - игрок
            if (hitRecord.InitiatorPlayer != null && hitRecord.InitiatorPlayer != victim)
            {
                var killerStats = GetOrCreateStats(hitRecord.InitiatorPlayer.UserIDString);
                killerStats.kills++;

                // Определяем часть тела
                var bodyPart = GetBodyPart(hitRecord.Bone);
                switch (bodyPart)
                {
                    case "head":
                        killerStats.headshots++;
                        break;
                    case "body":
                        killerStats.bodyshots++;
                        break;
                    case "limb":
                        killerStats.limbshots++;
                        break;
                }

                // Добавляем в очередь для отправки
                _killsQueue.Add(new KillEventDto
                {
                    killer_steam_id = hitRecord.InitiatorPlayer.UserIDString,
                    victim_steam_id = victim.UserIDString,
                    weapon = hitRecord.Weapon,
                    distance = hitRecord.Distance,
                    is_headshot = hitRecord.IsHeadshot,
                    bone = hitRecord.Bone,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
            }

            _woundedHits.Remove(victim.UserIDString);
        }

        private HitRecord GetRealHitInfo(BasePlayer victim, HitInfo info)
        {
            // Если игрок был ранен и добит, используем информацию о ранении
            if ((info?.InitiatorPlayer == null || info.InitiatorPlayer == victim) &&
                _woundedHits.TryGetValue(victim.UserIDString, out var woundedHit))
            {
                return woundedHit;
            }
            return new HitRecord(info);
        }

        private string GetBodyPart(string bone)
        {
            if (string.IsNullOrEmpty(bone)) return "body";
            
            bone = bone.ToLower();
            
            if (bone.Contains("head") || bone.Contains("jaw") || bone.Contains("eye") || bone.Contains("neck"))
                return "head";
            
            if (bone.Contains("hand") || bone.Contains("arm") || bone.Contains("finger") ||
                bone.Contains("leg") || bone.Contains("foot") || bone.Contains("toe") || bone.Contains("knee"))
                return "limb";
            
            return "body";
        }
        #endregion

        #region Chat Hooks
        private void OnPlayerChat(BasePlayer player, string message, ConVar.Chat.ChatChannel channel)
        {
            if (string.IsNullOrEmpty(_metaInfo.SecretKey)) return;
            if (string.IsNullOrEmpty(message)) return;

            if (channel != ConVar.Chat.ChatChannel.Team && channel != ConVar.Chat.ChatChannel.Global)
                return;

            _chatQueue.Add(new ChatMessageDto
            {
                steam_id = player.UserIDString,
                name = player.displayName,
                message = message,
                is_team = channel == ConVar.Chat.ChatChannel.Team,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            });
        }
        #endregion

        #region Report Hooks
        private void OnPlayerReported(BasePlayer reporter, string targetName, string targetId, string subject, string message, string type)
        {
            if (!ulong.TryParse(targetId, out _)) return;
            
            var stats = GetOrCreateStats(targetId);
            stats.reports_count++;
        }
        #endregion

        #region Helper Methods
        private PlayerStats GetOrCreateStats(string steamId)
        {
            if (!_statsData.players.TryGetValue(steamId, out var stats))
            {
                stats = new PlayerStats();
                _statsData.players[steamId] = stats;
            }
            return stats;
        }

        private void SaveStats()
        {
            // Обновляем время активных сессий
            foreach (var session in _playerSessions)
            {
                var stats = GetOrCreateStats(session.Key);
                // Не добавляем к playtime_seconds здесь, только при завершении сессии
            }
            PlayerStatsData.Write(_statsData);
        }

        private string GetPlayerIP(BasePlayer player)
        {
            var ip = player.Connection?.ipaddress;
            if (string.IsNullOrEmpty(ip)) return "";
            var idx = ip.IndexOf(':');
            return idx > 0 ? ip.Substring(0, idx) : ip;
        }

        private double GetCurrentPlaytime(string steamId)
        {
            var stats = GetOrCreateStats(steamId);
            var total = stats.playtime_seconds;
            
            // Добавляем время текущей сессии если игрок онлайн
            if (_playerSessions.TryGetValue(steamId, out var startTime))
            {
                total += (DateTime.UtcNow - startTime).TotalSeconds;
            }
            
            return total;
        }
        #endregion

        #region API Methods
        private void SyncAllPlayers()
        {
            var allPlayers = new List<object>();

            foreach (var player in BasePlayer.activePlayerList)
            {
                var stats = GetOrCreateStats(player.UserIDString);
                allPlayers.Add(new
                {
                    steam_id = player.UserIDString,
                    name = player.displayName,
                    ip = GetPlayerIP(player),
                    ping = Network.Net.sv.GetAveragePing(player.Connection),
                    online = true,
                    position = player.transform.position.ToString(),
                    server = ConVar.Server.hostname,
                    stats = new
                    {
                        kills = stats.kills,
                        deaths = stats.deaths,
                        headshots = stats.headshots,
                        bodyshots = stats.bodyshots,
                        limbshots = stats.limbshots,
                        playtime_hours = Math.Round(GetCurrentPlaytime(player.UserIDString) / 3600, 2),
                        reports_count = stats.reports_count,
                        kd = stats.deaths > 0 ? Math.Round((double)stats.kills / stats.deaths, 2) : stats.kills
                    }
                });
            }

            foreach (var sleeper in BasePlayer.sleepingPlayerList)
            {
                var stats = GetOrCreateStats(sleeper.UserIDString);
                allPlayers.Add(new
                {
                    steam_id = sleeper.UserIDString,
                    name = sleeper.displayName,
                    ip = "",
                    ping = 0,
                    online = false,
                    position = sleeper.transform.position.ToString(),
                    server = ConVar.Server.hostname,
                    stats = new
                    {
                        kills = stats.kills,
                        deaths = stats.deaths,
                        headshots = stats.headshots,
                        bodyshots = stats.bodyshots,
                        limbshots = stats.limbshots,
                        playtime_hours = Math.Round(GetCurrentPlaytime(sleeper.UserIDString) / 3600, 2),
                        reports_count = stats.reports_count,
                        kd = stats.deaths > 0 ? Math.Round((double)stats.kills / stats.deaths, 2) : stats.kills
                    }
                });
            }

            var payload = new
            {
                hostname = ConVar.Server.hostname,
                port = ConVar.Server.port,
                players = allPlayers
            };

            var json = JsonConvert.SerializeObject(payload);
            
            webrequest.Enqueue($"{API_URL}/sync", json, (code, response) =>
            {
                if (code != 200)
                    Puts($"PanRust: Ошибка синхронизации: {code} - {response}");
            }, this, Oxide.Core.Libraries.RequestMethod.POST, GetHeaders());
        }

        private void SendStateUpdate()
        {
            if (string.IsNullOrEmpty(_metaInfo.SecretKey)) return;

            var players = new List<object>();
            foreach (var player in BasePlayer.activePlayerList)
            {
                var stats = GetOrCreateStats(player.UserIDString);
                players.Add(new
                {
                    steam_id = player.UserIDString,
                    name = player.displayName,
                    ip = GetPlayerIP(player),
                    ping = Network.Net.sv.GetAveragePing(player.Connection),
                    online = true,
                    position = player.transform.position.ToString(),
                    server = ConVar.Server.hostname,
                    stats = new
                    {
                        kills = stats.kills,
                        deaths = stats.deaths,
                        headshots = stats.headshots,
                        bodyshots = stats.bodyshots,
                        limbshots = stats.limbshots,
                        playtime_hours = Math.Round(GetCurrentPlaytime(player.UserIDString) / 3600, 2),
                        reports_count = stats.reports_count,
                        kd = stats.deaths > 0 ? Math.Round((double)stats.kills / stats.deaths, 2) : stats.kills
                    }
                });
            }

            var payload = new
            {
                hostname = ConVar.Server.hostname,
                port = ConVar.Server.port,
                online = BasePlayer.activePlayerList.Count,
                max_players = ConVar.Server.maxplayers,
                players = players
            };

            var json = JsonConvert.SerializeObject(payload);
            webrequest.Enqueue($"{API_URL}/state", json, (code, response) =>
            {
                if (code != 200) Puts($"API Error: {code} - {response}");
            }, this, Oxide.Core.Libraries.RequestMethod.POST, GetHeaders());
        }

        private void SendChatMessages()
        {
            if (string.IsNullOrEmpty(_metaInfo.SecretKey)) return;
            if (_chatQueue.Count == 0) return;

            var messages = new List<ChatMessageDto>(_chatQueue);
            _chatQueue.Clear();

            var payload = new { messages = messages, server = ConVar.Server.hostname };
            var json = JsonConvert.SerializeObject(payload);

            webrequest.Enqueue($"{API_URL}/chat", json, (code, response) =>
            {
                if (code != 200)
                {
                    Puts($"Chat API Error: {code} - {response}");
                    _chatQueue.AddRange(messages);
                }
            }, this, Oxide.Core.Libraries.RequestMethod.POST, GetHeaders());
        }

        private void SendKillsData()
        {
            if (string.IsNullOrEmpty(_metaInfo.SecretKey)) return;
            if (_killsQueue.Count == 0) return;

            var kills = new List<KillEventDto>(_killsQueue);
            _killsQueue.Clear();

            var payload = new { kills = kills, server = ConVar.Server.hostname };
            var json = JsonConvert.SerializeObject(payload);

            webrequest.Enqueue($"{API_URL}/kills", json, (code, response) =>
            {
                if (code != 200)
                {
                    Puts($"Kills API Error: {code} - {response}");
                    _killsQueue.AddRange(kills);
                }
            }, this, Oxide.Core.Libraries.RequestMethod.POST, GetHeaders());
        }

        private void FetchCommands()
        {
            if (string.IsNullOrEmpty(_metaInfo.SecretKey)) return;

            webrequest.Enqueue($"{API_URL}/commands", null, (code, response) =>
            {
                if (code != 200) return;

                try
                {
                    var data = JsonConvert.DeserializeObject<CommandsResponse>(response);
                    if (data?.commands == null) return;

                    foreach (var cmd in data.commands)
                    {
                        ProcessCommand(cmd);
                    }
                }
                catch (Exception ex)
                {
                    Puts($"Commands parse error: {ex.Message}");
                }
            }, this, Oxide.Core.Libraries.RequestMethod.GET, GetHeaders());
        }

        private void ProcessCommand(CommandDto cmd)
        {
            if (cmd.type == "chat_message")
            {
                if (cmd.is_global)
                {
                    foreach (var player in BasePlayer.activePlayerList)
                    {
                        SendReply(player, $"<color=#84cc16>[Админ]</color> {cmd.message}");
                    }
                }
                else if (!string.IsNullOrEmpty(cmd.target_steam_id))
                {
                    var target = BasePlayer.Find(cmd.target_steam_id);
                    if (target != null && target.IsConnected)
                    {
                        SendReply(target, $"<color=#84cc16>[ЛС от Админа]</color> {cmd.message}");
                    }
                }
            }
        }

        private Dictionary<string, string> GetHeaders()
        {
            return new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json",
                ["Authorization"] = $"Bearer {_metaInfo.SecretKey}"
            };
        }

        private class CommandsResponse
        {
            public List<CommandDto> commands;
        }

        private class CommandDto
        {
            public string id;
            public string type;
            public string target_steam_id;
            public string message;
            public bool is_global;
        }
        #endregion

        #region Console Commands
        [ConsoleCommand("panrust.pair")]
        private void CmdPair(ConsoleSystem.Arg args)
        {
            if (args.Connection != null) return;

            if (args.Args == null || args.Args.Length == 0)
            {
                Puts("Использование: panrust.pair ВАШ_SECRET_KEY");
                return;
            }

            var secretKey = args.Args[0];
            _metaInfo.SecretKey = secretKey;
            MetaInfo.Write(_metaInfo);

            Puts("PanRust: Secret Key сохранён! Перезагрузите плагин: oxide.reload PanRust");
        }

        [ConsoleCommand("panrust.status")]
        private void CmdStatus(ConsoleSystem.Arg args)
        {
            if (args.Connection != null) return;

            if (string.IsNullOrEmpty(_metaInfo.SecretKey))
            {
                Puts("PanRust: Не подключен. Используйте panrust.pair SECRET_KEY");
            }
            else
            {
                Puts($"PanRust: Подключен | API: {API_URL}");
                Puts($"Игроков в базе: {_statsData.players.Count}");
            }
        }

        [ConsoleCommand("panrust.reset")]
        private void CmdReset(ConsoleSystem.Arg args)
        {
            if (args.Connection != null) return;
            _metaInfo.SecretKey = "";
            MetaInfo.Write(_metaInfo);
            Puts("PanRust: Настройки сброшены.");
        }

        [ConsoleCommand("panrust.sync")]
        private void CmdSync(ConsoleSystem.Arg args)
        {
            if (args.Connection != null) return;
            if (string.IsNullOrEmpty(_metaInfo.SecretKey))
            {
                Puts("PanRust: Сначала подключитесь через panrust.pair SECRET_KEY");
                return;
            }
            SyncAllPlayers();
            Puts("PanRust: Синхронизация запущена");
        }

        [ConsoleCommand("panrust.stats")]
        private void CmdStats(ConsoleSystem.Arg args)
        {
            if (args.Connection != null) return;
            
            if (args.Args == null || args.Args.Length == 0)
            {
                Puts("Использование: panrust.stats <steam_id>");
                return;
            }

            var steamId = args.Args[0];
            if (_statsData.players.TryGetValue(steamId, out var stats))
            {
                Puts($"Статистика игрока {steamId}:");
                Puts($"  Убийств: {stats.kills}");
                Puts($"  Смертей: {stats.deaths}");
                Puts($"  K/D: {(stats.deaths > 0 ? Math.Round((double)stats.kills / stats.deaths, 2) : stats.kills)}");
                Puts($"  Хедшотов: {stats.headshots}");
                Puts($"  В тело: {stats.bodyshots}");
                Puts($"  В конечности: {stats.limbshots}");
                Puts($"  Время на сервере: {Math.Round(GetCurrentPlaytime(steamId) / 3600, 2)} ч.");
                Puts($"  Репортов: {stats.reports_count}");
            }
            else
            {
                Puts($"Статистика для {steamId} не найдена");
            }
        }

        [ConsoleCommand("panrust.resetstats")]
        private void CmdResetStats(ConsoleSystem.Arg args)
        {
            if (args.Connection != null) return;
            _statsData = new PlayerStatsData();
            PlayerStatsData.Write(_statsData);
            Puts("PanRust: Статистика сброшена");
        }
        #endregion
    }
}
