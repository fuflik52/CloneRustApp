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

        #region Configuration
        private class Configuration
        {
            [JsonProperty("API URL")]
            public string ApiUrl = "http://localhost:3001/api";
            
            [JsonProperty("API Secret Key")]
            public string SecretKey = "";
            
            [JsonProperty("Update Interval (seconds)")]
            public float UpdateInterval = 5f;
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
            timer.Every(_config.UpdateInterval, () => SendStateUpdate());
        }

        private void OnPlayerConnected(BasePlayer player) => timer.Once(1f, () => SendStateUpdate());

        private void OnPlayerDisconnected(BasePlayer player, string reason) => timer.Once(1f, () => SendStateUpdate());

        private void Unload() => _instance = null;
        #endregion

        #region API Methods
        private void SendStateUpdate()
        {
            if (string.IsNullOrEmpty(_config.SecretKey)) return;

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
            webrequest.Enqueue($"{_config.ApiUrl}/state", json, (code, response) =>
            {
                if (code != 200) Puts($"API Error: {code}");
            }, this, Oxide.Core.Libraries.RequestMethod.POST, new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json",
                ["Authorization"] = $"Bearer {_config.SecretKey}"
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
