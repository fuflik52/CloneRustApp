using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using Oxide.Core;
using Newtonsoft.Json;

namespace Oxide.Plugins
{
    [Info("MapSync", "PanRust", "1.0.1")]
    [Description("Синхронизирует карту и позиции игроков с веб-панелью")]
    class MapSync : RustPlugin
    {
        private string apiUrl = "http://localhost:3001/api";
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
            Puts($"API URL: {apiUrl}");
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
                ["worldSize"] = World.Size,
                ["hostname"] = ConVar.Server.hostname
            };

            string json = JsonConvert.SerializeObject(data);
            
            var headers = new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json"
            };

            Puts($"Sending map URL to: {apiUrl}/map-url");

            webrequest.Enqueue(
                $"{apiUrl}/map-url",
                json,
                (code, response) =>
                {
                    if (code == 200)
                    {
                        Puts("Map URL sent successfully");
                    }
                    else if (code == 0)
                    {
                        PrintError($"Connection failed! Check API URL: {apiUrl}");
                        PrintError("Make sure the web server is running and accessible");
                    }
                    else
                    {
                        PrintWarning($"Failed to send map URL: {code} - {response}");
                    }
                },
                this,
                Oxide.Core.Libraries.RequestMethod.POST,
                headers
            );
        }

        void SendPlayerPositions()
        {
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
                    ["online"] = true,
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

            var headers = new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json"
            };

            webrequest.Enqueue(
                $"{apiUrl}/state",
                json,
                (code, response) =>
                {
                    if (code == 200)
                    {
                        // Успешно - не спамим в лог
                    }
                    else if (code == 0)
                    {
                        PrintError($"Connection failed! Check if web server is running at: {apiUrl}");
                    }
                    else
                    {
                        PrintWarning($"Failed to update player positions: {code} - {response}");
                    }
                },
                this,
                Oxide.Core.Libraries.RequestMethod.POST,
                headers
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
            Puts($"API URL changed to: {apiUrl}");
        }

        // Команда для проверки статуса
        [ConsoleCommand("mapsync.status")]
        void StatusCommand(ConsoleSystem.Arg arg)
        {
            arg.ReplyWith($"MapSync Status:");
            arg.ReplyWith($"API URL: {apiUrl}");
            arg.ReplyWith($"Map URL: {mapImageUrl ?? "Not available"}");
            arg.ReplyWith($"World Size: {World.Size}");
            arg.ReplyWith($"Online Players: {BasePlayer.activePlayerList.Count}");
        }
    }
}
