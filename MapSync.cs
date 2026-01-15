using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using Oxide.Core;
using Newtonsoft.Json;

namespace Oxide.Plugins
{
    [Info("MapSync", "PanRust", "1.0.0")]
    [Description("Синхронизирует карту и позиции игроков с веб-панелью")]
    class MapSync : RustPlugin
    {
        private string apiUrl = "http://localhost:3001/api";
        private string secretKey = "YOUR_SECRET_KEY_HERE"; // Замените на ваш ключ
        private Timer updateTimer;
        private string mapImageUrl = null;

        void OnServerInitialized()
        {
            // Получаем URL карты из MapImageUrl плагина
            mapImageUrl = MapUploader.ImageUrl;
            
            if (!string.IsNullOrEmpty(mapImageUrl))
            {
                SendMapUrl();
            }
            
            // Обновляем позиции игроков каждые 5 секунд
            updateTimer = timer.Every(5f, () => SendPlayerPositions());
            
            Puts("MapSync initialized. Map URL: " + (mapImageUrl ?? "Not available"));
        }

        void Unload()
        {
            updateTimer?.Destroy();
        }

        void SendMapUrl()
        {
            var data = new Dictionary<string, object>
            {
                ["mapUrl"] = mapImageUrl,
                ["worldSize"] = World.Size
            };

            string json = JsonConvert.SerializeObject(data);
            
            webrequest.Enqueue(
                $"{apiUrl}/map-url",
                json,
                (code, response) =>
                {
                    if (code == 200)
                    {
                        Puts("Map URL sent successfully");
                    }
                    else
                    {
                        PrintWarning($"Failed to send map URL: {code}");
                    }
                },
                this,
                RequestMethod.POST,
                new Dictionary<string, string>
                {
                    ["Content-Type"] = "application/json",
                    ["Authorization"] = $"Bearer {secretKey}"
                }
            );
        }

        void SendPlayerPositions()
        {
            if (string.IsNullOrEmpty(mapImageUrl)) return;

            var players = new List<Dictionary<string, object>>();

            foreach (var player in BasePlayer.activePlayerList)
            {
                if (player == null || !player.IsConnected) continue;

                var pos = player.transform.position;
                var team = player.currentTeam != 0 ? player.currentTeam.ToString() : null;

                players.Add(new Dictionary<string, object>
                {
                    ["steam_id"] = player.UserIDString,
                    ["name"] = player.displayName,
                    ["position"] = new Dictionary<string, float>
                    {
                        ["x"] = pos.x,
                        ["y"] = pos.y,
                        ["z"] = pos.z
                    },
                    ["team"] = team
                });
            }

            // Обновляем данные через существующий endpoint /api/state
            var stateData = new Dictionary<string, object>
            {
                ["hostname"] = ConVar.Server.hostname,
                ["name"] = ConVar.Server.hostname,
                ["port"] = ConVar.Server.port,
                ["online"] = BasePlayer.activePlayerList.Count,
                ["max_players"] = ConVar.Server.maxplayers,
                ["players"] = players
            };

            string json = JsonConvert.SerializeObject(stateData);

            webrequest.Enqueue(
                $"{apiUrl}/state",
                json,
                (code, response) =>
                {
                    if (code != 200)
                    {
                        PrintWarning($"Failed to update player positions: {code}");
                    }
                },
                this,
                RequestMethod.POST,
                new Dictionary<string, string>
                {
                    ["Content-Type"] = "application/json",
                    ["Authorization"] = $"Bearer {secretKey}"
                }
            );
        }

        // Команда для ручного обновления карты
        [ConsoleCommand("mapsync.update")]
        void UpdateMapCommand(ConsoleSystem.Arg arg)
        {
            mapImageUrl = MapUploader.ImageUrl;
            
            if (!string.IsNullOrEmpty(mapImageUrl))
            {
                SendMapUrl();
                SendPlayerPositions();
                arg.ReplyWith("Map and player positions updated!");
            }
            else
            {
                arg.ReplyWith("Map URL not available. Make sure MapImageUrl plugin is loaded.");
            }
        }

        // Команда для установки API URL
        [ConsoleCommand("mapsync.seturl")]
        void SetApiUrlCommand(ConsoleSystem.Arg arg)
        {
            if (!arg.HasArgs())
            {
                arg.ReplyWith($"Current API URL: {apiUrl}");
                return;
            }

            apiUrl = arg.GetString(0);
            arg.ReplyWith($"API URL set to: {apiUrl}");
        }

        // Команда для установки секретного ключа
        [ConsoleCommand("mapsync.setkey")]
        void SetKeyCommand(ConsoleSystem.Arg arg)
        {
            if (!arg.HasArgs())
            {
                arg.ReplyWith("Usage: mapsync.setkey <secret_key>");
                return;
            }

            secretKey = arg.GetString(0);
            arg.ReplyWith("Secret key updated!");
        }
    }
}
