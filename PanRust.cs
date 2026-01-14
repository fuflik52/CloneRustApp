using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Libraries.Covalence;
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("PanRust", "PanRust.io", "1.0.0")]
    public class PanRust : RustPlugin
    {
        private static PanRust _instance;
        private static Configuration _config;
        private static MetaInfo _metaInfo;

        private const string API_URL = "http://app.bublickrust.ru/api";

        // Очередь сообщений чата для отправки
        private List<ChatMessageDto> _chatQueue = new List<ChatMessageDto>();

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

        #region Data Classes
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
        #endregion

        #region Hooks
        private void OnServerInitialized()
        {
            _instance = this;
            _metaInfo = MetaInfo.Read();

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
                
                // Синхронизация всех игроков (включая спящих) при запуске
                timer.Once(2f, () => SyncAllPlayers());
                
                timer.Every(_config.UpdateInterval, () => SendStateUpdate());
                timer.Every(_config.ChatUpdateInterval, () => SendChatMessages());
            }
        }

        private void SyncAllPlayers()
        {
            var allPlayers = new List<PlayerDto>();

            // Онлайн игроки
            foreach (var player in BasePlayer.activePlayerList)
            {
                allPlayers.Add(new PlayerDto
                {
                    steam_id = player.UserIDString,
                    name = player.displayName,
                    ip = GetPlayerIP(player),
                    ping = Network.Net.sv.GetAveragePing(player.Connection),
                    online = true,
                    position = player.transform.position.ToString(),
                    server = ConVar.Server.hostname
                });
            }

            // Спящие игроки
            foreach (var sleeper in BasePlayer.sleepingPlayerList)
            {
                allPlayers.Add(new PlayerDto
                {
                    steam_id = sleeper.UserIDString,
                    name = sleeper.displayName,
                    ip = "",
                    ping = 0,
                    online = false,
                    position = sleeper.transform.position.ToString(),
                    server = ConVar.Server.hostname
                });
            }

            var payload = new
            {
                hostname = ConVar.Server.hostname,
                port = ConVar.Server.port,
                players = allPlayers
            };

            var json = JsonConvert.SerializeObject(payload);
            
            Puts($"PanRust: Автосинхронизация при запуске - {allPlayers.Count} игроков ({BasePlayer.activePlayerList.Count} онлайн, {BasePlayer.sleepingPlayerList.Count} спящих)");

            webrequest.Enqueue($"{API_URL}/sync", json, (code, response) =>
            {
                if (code == 200)
                    Puts($"PanRust: Синхронизация завершена!");
                else
                    Puts($"PanRust: Ошибка синхронизации: {code} - {response}");
            }, this, Oxide.Core.Libraries.RequestMethod.POST, new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json",
                ["Authorization"] = $"Bearer {_metaInfo.SecretKey}"
            });
        }

        // Хук на сообщения в чате
        private void OnPlayerChat(BasePlayer player, string message, ConVar.Chat.ChatChannel channel)
        {
            if (string.IsNullOrEmpty(_metaInfo.SecretKey)) return;
            if (string.IsNullOrEmpty(message)) return;

            // Только глобальный и командный чат
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

        private void OnPlayerConnected(BasePlayer player) => timer.Once(1f, () => SendStateUpdate());

        private void OnPlayerDisconnected(BasePlayer player, string reason) => timer.Once(1f, () => SendStateUpdate());

        private void Unload() => _instance = null;
        #endregion

        #region Commands
        [ConsoleCommand("panrust.pair")]
        private void CmdPair(ConsoleSystem.Arg args)
        {
            if (args.Connection != null) return; // Только из серверной консоли

            if (args.Args == null || args.Args.Length == 0)
            {
                Puts("Использование: panrust.pair ВАШ_SECRET_KEY");
                Puts("Secret Key можно получить в панели при создании сервера");
                return;
            }

            var secretKey = args.Args[0];
            
            _metaInfo.SecretKey = secretKey;
            MetaInfo.Write(_metaInfo);

            Puts("========================================");
            Puts("PanRust: Secret Key сохранён!");
            Puts("Перезагрузите плагин: oxide.reload PanRust");
            Puts("========================================");
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
                Puts($"PanRust: Подключен");
                Puts($"API: {API_URL}");
                Puts($"Интервал обновления: {_config.UpdateInterval} сек");
            }
        }

        [ConsoleCommand("panrust.reset")]
        private void CmdReset(ConsoleSystem.Arg args)
        {
            if (args.Connection != null) return;

            _metaInfo.SecretKey = "";
            MetaInfo.Write(_metaInfo);
            Puts("PanRust: Настройки сброшены. Перезагрузите плагин.");
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
        }
        #endregion

        #region API Methods
        private void SendStateUpdate()
        {
            if (string.IsNullOrEmpty(_metaInfo.SecretKey)) return;

            var payload = new StatePayload();
            foreach (var player in BasePlayer.activePlayerList)
            {
                payload.players.Add(new PlayerDto
                {
                    steam_id = player.UserIDString,
                    name = player.displayName,
                    ip = GetPlayerIP(player),
                    ping = Network.Net.sv.GetAveragePing(player.Connection),
                    online = true,
                    position = player.transform.position.ToString(),
                    server = ConVar.Server.hostname
                });
            }

            var json = JsonConvert.SerializeObject(payload);
            webrequest.Enqueue($"{API_URL}/state", json, (code, response) =>
            {
                if (code != 200) Puts($"API Error: {code} - {response}");
            }, this, Oxide.Core.Libraries.RequestMethod.POST, new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json",
                ["Authorization"] = $"Bearer {_metaInfo.SecretKey}"
            });
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
                    // Возвращаем сообщения в очередь при ошибке
                    _chatQueue.AddRange(messages);
                }
            }, this, Oxide.Core.Libraries.RequestMethod.POST, new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json",
                ["Authorization"] = $"Bearer {_metaInfo.SecretKey}"
            });
        }

        private string GetPlayerIP(BasePlayer player)
        {
            var ip = player.Connection?.ipaddress;
            if (string.IsNullOrEmpty(ip)) return "";
            var idx = ip.IndexOf(':');
            return idx > 0 ? ip.Substring(0, idx) : ip;
        }
        #endregion
    }
}
