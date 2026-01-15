using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Game.Rust.Cui;
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("PanRust", "PanRust.io", "1.2.0")]
    public class PanRust : RustPlugin
    {
        static PanRust _instance;
        static Configuration _config;
        static MetaInfo _meta;
        static StatsData _stats;

        const string API = "http://app.bublickrust.ru/api";

        readonly List<ChatMsg> _chatQueue = new List<ChatMsg>(32);
        readonly List<KillDto> _killsQueue = new List<KillDto>(16);
        readonly List<PluginReportDto> _reportsQueue = new List<PluginReportDto>();
        readonly Dictionary<ulong, double> _reportCooldowns = new Dictionary<ulong, double>();
        readonly Dictionary<ulong, HitData> _wounds = new Dictionary<ulong, HitData>();
        readonly Dictionary<ulong, float> _sessions = new Dictionary<ulong, float>();
        readonly Dictionary<ulong, List<HitRecord>> _hitHistory = new Dictionary<ulong, List<HitRecord>>();
        readonly Dictionary<ulong, MuteData> _mutes = new Dictionary<ulong, MuteData>();
        
        // Map sync
        string _mapImageUrl = null;

        #region Data
        
        struct HitData
        {
            public BasePlayer Attacker;
            public string Weapon;
            public float Distance;
            public bool Headshot;
            public string Bone;
        }

        class HitRecord
        {
            public float time;
            public string attackerId, targetId, attacker, target, weapon, ammo, bone, info;
            public float distance, hpOld, hpNew;
        }

        class PlayerStats
        {
            public int k, d, hs, bs, ls, rp;
            public double pt;
            public long fs, ls_t;
        }

        class StatsData
        {
            public Dictionary<string, PlayerStats> p = new Dictionary<string, PlayerStats>();
            public static StatsData Read() => Interface.Oxide.DataFileSystem.ExistsDatafile("PanRust_Stats") 
                ? Interface.Oxide.DataFileSystem.ReadObject<StatsData>("PanRust_Stats") 
                : new StatsData();
            public static void Write(StatsData d) => Interface.Oxide.DataFileSystem.WriteObject("PanRust_Stats", d);
        }

        class KillDto
        {
            public string ki, vi, wp, bn;
            public float ds;
            public bool hs;
            public long ts;
            public List<CombatDto> h;
        }

        class CombatDto
        {
            public float t;
            public string asi, tsi, a, tg, wp, am, bn, inf;
            public float ds, ho, hn;
            public int ph, dy;
            public float pi, pt, pm;
            public bool ad;

            public CombatDto(HitRecord r, float killTime)
            {
                t = (float)Math.Round(killTime - r.time, 2);
                asi = r.attackerId ?? "";
                tsi = r.targetId ?? "";
                a = r.attacker ?? "";
                tg = r.target ?? "";
                wp = r.weapon ?? "";
                am = r.ammo ?? "";
                bn = r.bone ?? "";
                ds = (float)Math.Round(r.distance, 2);
                ho = (float)Math.Round(r.hpOld, 2);
                hn = (float)Math.Round(r.hpNew, 2);
                inf = r.info ?? "";
            }
        }

        class MetaInfo
        {
            public string Key = "";
            public static MetaInfo Read() => Interface.Oxide.DataFileSystem.ExistsDatafile("PanRust_Meta") 
                ? Interface.Oxide.DataFileSystem.ReadObject<MetaInfo>("PanRust_Meta") 
                : new MetaInfo();
            public static void Write(MetaInfo m) => Interface.Oxide.DataFileSystem.WriteObject("PanRust_Meta", m);
        }

        class Configuration
        {
            public float UpdateInt = 5f, ChatInt = 1f, KillsInt = 5f, SaveInt = 60f, ReportsInt = 5f;
            public List<string> report_ui_reasons = new List<string> { "Cheat", "Macros", "Abuse" };
            public int report_ui_cooldown = 60;
        }

        class ChatMsg { public string si, n, m; public bool t; public long ts; }
        
        class PluginReportDto
        {
            public string initiator_steam_id;
            public string target_steam_id;
            public List<string> sub_targets_steam_ids;
            public string message;
            public string reason;
        }

        class PluginReportBatchPayload
        {
            public List<PluginReportDto> reports;
        }

        class MuteData
        {
            public string reason;
            public long expired_at;
            public long created_at;
        }

        #endregion

        #region Config
        protected override void LoadConfig()
        {
            base.LoadConfig();
            try { _config = Config.ReadObject<Configuration>(); } catch { _config = new Configuration(); }
            
            // Deduplicate reasons
            if (_config.report_ui_reasons != null)
            {
                _config.report_ui_reasons = _config.report_ui_reasons.Distinct().ToList();
            }
            
            SaveConfig();
        }
        protected override void LoadDefaultConfig() => _config = new Configuration();
        protected override void SaveConfig() => Config.WriteObject(_config);
        #endregion

        #region Hooks
        void OnServerInitialized()
        {
            _instance = this;
            _meta = MetaInfo.Read();
            _stats = StatsData.Read();

            if (string.IsNullOrEmpty(_meta.Key))
            {
                Puts("PanRust: Не подключен! panrust.pair SECRET_KEY");
                return;
            }
            Puts("PanRust: Подключен");
            FetchServerIp();
            
            // Map sync
            _mapImageUrl = MapUploader.ImageUrl;
            if (!string.IsNullOrEmpty(_mapImageUrl))
            {
                Puts($"Map URL: {_mapImageUrl}");
                SendMapUrl();
            }
            
            timer.Once(2f, Sync);
            timer.Every(_config.UpdateInt, SendState);
            timer.Every(_config.ChatInt, SendChat);
            timer.Every(_config.KillsInt, SendKills);
            timer.Every(_config.ReportsInt, SendReports);
            timer.Every(_config.SaveInt, Save);
            timer.Every(1f, FetchCmd);
        }

        void Unload()
        {
            foreach (var s in _sessions.Keys.ToArray()) EndSession(s);
            Save();
            _instance = null;
        }

        void OnPlayerConnected(BasePlayer p)
        {
            var id = p.userID;
            if (!_sessions.ContainsKey(id)) _sessions[id] = Time.realtimeSinceStartup;
            var s = GetStats(p.UserIDString);
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (s.fs == 0) s.fs = now;
            s.ls_t = now;
        }

        void OnPlayerDisconnected(BasePlayer p, string r)
        {
            EndSession(p.userID);
            GetStats(p.UserIDString).ls_t = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }

        void OnPlayerWound(BasePlayer v, HitInfo i)
        {
            if (i?.InitiatorPlayer == null || i.InitiatorPlayer == v) return;
            _wounds[v.userID] = new HitData
            {
                Attacker = i.InitiatorPlayer,
                Weapon = i.Weapon?.GetItem()?.info?.displayName?.english ?? i.WeaponPrefab?.ShortPrefabName ?? "unknown",
                Distance = i.ProjectileDistance,
                Headshot = i.isHeadshot,
                Bone = i.boneName ?? ""
            };
        }

        void OnPlayerRespawn(BasePlayer p) { _wounds.Remove(p.userID); _hitHistory.Remove(p.userID); }
        void OnPlayerRecovered(BasePlayer p) { _wounds.Remove(p.userID); _hitHistory.Remove(p.userID); }

        void OnEntityTakeDamage(BaseCombatEntity entity, HitInfo info)
        {
            if (info == null) return;
            var attacker = info.InitiatorPlayer;
            if (attacker == null) return;

            ulong targetId = 0;
            string targetType = "unknown";
            string targetSteamId = "";

            if (entity is BasePlayer targetPlayer)
            {
                targetId = targetPlayer.userID;
                targetType = "player";
                targetSteamId = targetPlayer.UserIDString;
            }
            else if (entity is BaseNpc || entity is ScientistNPC || entity is NPCPlayer)
            {
                targetId = entity.net?.ID.Value ?? 0;
                targetType = entity.ShortPrefabName ?? "npc";
            }
            else return;

            if (targetId == 0) return;

            var weapon = info.Weapon?.GetItem()?.info?.displayName?.english ?? info.WeaponPrefab?.ShortPrefabName ?? "unknown";
            var ammo = info.ProjectilePrefab?.name ?? "";
            var bone = info.boneName ?? "";
            var distance = info.ProjectileDistance;
            var hpOld = entity.Health();
            var damage = info.damageTypes.Total();
            var hpNew = Math.Max(0, hpOld - damage);

            if (!_hitHistory.TryGetValue(targetId, out var list))
            {
                list = new List<HitRecord>(16);
                _hitHistory[targetId] = list;
            }

            // Очищаем старые записи (>30 сек)
            var now = Time.realtimeSinceStartup;
            list.RemoveAll(h => now - h.time > 30f);

            list.Add(new HitRecord
            {
                time = now,
                attackerId = attacker.UserIDString,
                targetId = targetSteamId,
                attacker = "player",
                target = targetType,
                weapon = weapon,
                ammo = ammo,
                bone = bone,
                distance = distance,
                hpOld = hpOld,
                hpNew = (float)hpNew,
                info = hpNew <= 0 ? "killed" : "hit"
            });
        }

        void OnPlayerDeath(BasePlayer v, HitInfo i)
        {
            if (v == null) return;
            var h = GetHit(v, i);
            var vid = v.userID;
            var vsi = v.UserIDString;
            GetStats(vsi).d++;
            _wounds.Remove(vid);

            if (h.Attacker == null || h.Attacker == v) return;
            var ksi = h.Attacker.UserIDString;
            var ks = GetStats(ksi);
            ks.k++;
            var bp = GetBodyPart(h.Bone);
            if (bp == 0) ks.hs++; else if (bp == 1) ks.bs++; else ks.ls++;

            var combatLog = GetCombatLog(vid);
            _hitHistory.Remove(vid);

            _killsQueue.Add(new KillDto
            {
                ki = ksi, vi = vsi, wp = h.Weapon, ds = h.Distance, hs = h.Headshot, bn = h.Bone,
                ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), h = combatLog
            });
        }

        // Трекинг убийств NPC/ботов
        void OnEntityDeath(BaseCombatEntity entity, HitInfo info)
        {
            if (entity == null || info == null) return;
            if (entity is BasePlayer) return; // Игроки обрабатываются в OnPlayerDeath

            var attacker = info.InitiatorPlayer;
            if (attacker == null) return;

            var targetId = entity.net?.ID.Value ?? 0;
            if (targetId == 0) return;

            var weapon = info.Weapon?.GetItem()?.info?.displayName?.english ?? info.WeaponPrefab?.ShortPrefabName ?? "unknown";
            var bone = info.boneName ?? "";
            var distance = info.ProjectileDistance;
            var isHeadshot = info.isHeadshot;
            var targetName = entity.ShortPrefabName ?? "npc";

            var ksi = attacker.UserIDString;
            var ks = GetStats(ksi);
            ks.k++;
            var bp = GetBodyPart(bone);
            if (bp == 0) ks.hs++; else if (bp == 1) ks.bs++; else ks.ls++;

            var combatLog = GetCombatLog(targetId);
            _hitHistory.Remove(targetId);

            _killsQueue.Add(new KillDto
            {
                ki = ksi, vi = targetName, wp = weapon, ds = distance, hs = isHeadshot, bn = bone,
                ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), h = combatLog
            });
        }

        // Блокировка чата для замьюченных (как в RustApp.cs)
        object OnClientCommand(Network.Connection connection, string command)
        {
            if (connection == null) return null;
            
            // Проверяем только команды чата
            if (!command.StartsWith("chat.say", StringComparison.OrdinalIgnoreCase)) return null;
            // Пропускаем команды (начинаются с /)
            if (command.StartsWith("chat.say \"/", StringComparison.OrdinalIgnoreCase) || 
                command.StartsWith("chat.say /", StringComparison.OrdinalIgnoreCase)) return null;
            
            // Проверяем мут
            if (_mutes.TryGetValue(connection.userid, out var mute))
            {
                var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if (mute.expired_at == 0 || mute.expired_at > now)
                {
                    var leftTime = mute.expired_at == 0 ? "навсегда" : GetTimeLeft(mute.expired_at - now);
                    if (connection.player is BasePlayer player)
                    {
                        SendReply(player, $"Вы замьючены!<size=12>\n- причина: {mute.reason}\n- осталось: {leftTime}</size>");
                    }
                    return false;
                }
                else
                {
                    _mutes.Remove(connection.userid);
                }
            }
            
            return null;
        }

        void OnPlayerChat(BasePlayer p, string m, ConVar.Chat.ChatChannel c)
        {
            if (string.IsNullOrEmpty(_meta.Key) || string.IsNullOrEmpty(m)) return;
            if (c != ConVar.Chat.ChatChannel.Team && c != ConVar.Chat.ChatChannel.Global) return;
            
            _chatQueue.Add(new ChatMsg { si = p.UserIDString, n = p.displayName, m = m, t = c == ConVar.Chat.ChatChannel.Team, ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        }

        void OnPlayerReported(BasePlayer r, string tn, string ti, string s, string m, string t)
        {
            if (ulong.TryParse(ti, out _)) GetStats(ti).rp++;
        }
        #endregion

        #region Methods
        void EndSession(ulong id)
        {
            if (!_sessions.TryGetValue(id, out var st)) return;
            GetStats(id.ToString()).pt += Time.realtimeSinceStartup - st;
            _sessions.Remove(id);
        }

        PlayerStats GetStats(string id)
        {
            if (!_stats.p.TryGetValue(id, out var s)) { s = new PlayerStats(); _stats.p[id] = s; }
            return s;
        }

        double GetPlaytime(string id)
        {
            var s = GetStats(id);
            var t = s.pt;
            if (_sessions.TryGetValue(ulong.Parse(id), out var st)) t += Time.realtimeSinceStartup - st;
            return t;
        }

        HitData GetHit(BasePlayer v, HitInfo i)
        {
            if ((i?.InitiatorPlayer == null || i.InitiatorPlayer == v) && _wounds.TryGetValue(v.userID, out var w)) return w;
            return new HitData
            {
                Attacker = i?.InitiatorPlayer,
                Weapon = i?.Weapon?.GetItem()?.info?.displayName?.english ?? i?.WeaponPrefab?.ShortPrefabName ?? "unknown",
                Distance = i?.ProjectileDistance ?? 0f,
                Headshot = i?.isHeadshot ?? false,
                Bone = i?.boneName ?? ""
            };
        }

        int GetBodyPart(string b)
        {
            if (string.IsNullOrEmpty(b)) return 1;
            b = b.ToLower();
            if (b.Contains("head") || b.Contains("jaw") || b.Contains("eye") || b.Contains("neck")) return 0;
            if (b.Contains("hand") || b.Contains("arm") || b.Contains("leg") || b.Contains("foot") || b.Contains("knee")) return 2;
            return 1;
        }

        List<CombatDto> GetCombatLog(ulong id)
        {
            if (!_hitHistory.TryGetValue(id, out var records) || records.Count == 0) return null;
            var killTime = Time.realtimeSinceStartup;
            var list = new List<CombatDto>(records.Count);
            for (var i = records.Count - 1; i >= 0; i--)
            {
                list.Add(new CombatDto(records[i], killTime));
            }
            return list;
        }

        void Save() => StatsData.Write(_stats);
        string GetIP(BasePlayer p) { var ip = p.Connection?.ipaddress; if (string.IsNullOrEmpty(ip)) return ""; var i = ip.IndexOf(':'); return i > 0 ? ip.Substring(0, i) : ip; }
        Dictionary<string, string> Headers() => new Dictionary<string, string> { ["Content-Type"] = "application/json", ["Authorization"] = $"Bearer {_meta.Key}" };
        
        static string HexToRustFormat(string hex)
        {
            if (string.IsNullOrEmpty(hex)) return "1 1 1 1";
            hex = hex.Replace("#", "");
            if (hex.Length == 6) hex += "FF";
            var r = int.Parse(hex.Substring(0, 2), System.Globalization.NumberStyles.HexNumber) / 255f;
            var g = int.Parse(hex.Substring(2, 2), System.Globalization.NumberStyles.HexNumber) / 255f;
            var b = int.Parse(hex.Substring(4, 2), System.Globalization.NumberStyles.HexNumber) / 255f;
            var a = int.Parse(hex.Substring(6, 2), System.Globalization.NumberStyles.HexNumber) / 255f;
            return $"{r} {g} {b} {a}";
        }

        string GetTimeLeft(long ms)
        {
            if (ms <= 0) return "0 сек";
            var ts = TimeSpan.FromMilliseconds(ms);
            var parts = new List<string>();
            if (ts.Days > 0) parts.Add($"{ts.Days} дн");
            if (ts.Hours > 0) parts.Add($"{ts.Hours} ч");
            if (ts.Minutes > 0) parts.Add($"{ts.Minutes} мин");
            if (ts.Seconds > 0 && ts.Days == 0) parts.Add($"{ts.Seconds} сек");
            return string.Join(" ", parts);
        }
        #endregion

        #region API
        string _serverIp = "";

        bool IsValidIp(string ip)
        {
            if (string.IsNullOrEmpty(ip)) return false;
            if (ip == "0.0.0.0" || ip == "127.0.0.1" || ip == "localhost") return false;
            // Проверяем что это реальный IP адрес (4 числа через точку)
            var parts = ip.Split('.');
            if (parts.Length != 4) return false;
            foreach (var part in parts)
            {
                if (!int.TryParse(part, out var num) || num < 0 || num > 255) return false;
            }
            return true;
        }

        void FetchServerIp()
        {
            // Сначала пробуем ConVar.Server.ip
            var ip = ConVar.Server.ip;
            if (IsValidIp(ip))
            {
                _serverIp = ip;
                Puts($"Server IP from config: {_serverIp}");
                return;
            }
            
            // Если не задан или невалидный - получаем внешний IP через сервис
            webrequest.Enqueue("https://api.ipify.org", null, (code, response) =>
            {
                if (code == 200 && !string.IsNullOrEmpty(response))
                {
                    _serverIp = response.Trim();
                    Puts($"Server IP detected: {_serverIp}");
                }
            }, this, Oxide.Core.Libraries.RequestMethod.GET);
        }

        string GetServerAddress() => string.IsNullOrEmpty(_serverIp) ? "" : _serverIp;

        void Sync()
        {
            var pl = new List<object>();
            foreach (var p in BasePlayer.activePlayerList) pl.Add(MakePlayer(p, true));
            foreach (var p in BasePlayer.sleepingPlayerList) pl.Add(MakePlayer(p, false));
            var json = JsonConvert.SerializeObject(new { hostname = GetServerAddress(), port = ConVar.Server.port, name = ConVar.Server.hostname, players = pl });
            webrequest.Enqueue($"{API}/sync", json, (c, r) => { if (c != 200) Puts($"Sync err: {c}"); }, this, Oxide.Core.Libraries.RequestMethod.POST, Headers());
        }

        void SendState()
        {
            if (string.IsNullOrEmpty(_meta.Key)) return;
            var pl = new List<object>();
            foreach (var p in BasePlayer.activePlayerList) pl.Add(MakePlayer(p, true));
            var json = JsonConvert.SerializeObject(new { hostname = GetServerAddress(), port = ConVar.Server.port, name = ConVar.Server.hostname, online = BasePlayer.activePlayerList.Count, max_players = ConVar.Server.maxplayers, players = pl });
            webrequest.Enqueue($"{API}/state", json, (c, r) => { }, this, Oxide.Core.Libraries.RequestMethod.POST, Headers());
        }

        object MakePlayer(BasePlayer p, bool on)
        {
            var s = GetStats(p.UserIDString);
            var pos = p.transform.position;
            return new
            {
                steam_id = p.UserIDString, name = p.displayName, ip = on ? GetIP(p) : "", ping = on ? Network.Net.sv.GetAveragePing(p.Connection) : 0,
                online = on, 
                position = new { x = pos.x, y = pos.y, z = pos.z }, // Отправляем позицию как объект
                team = p.currentTeam != 0 ? p.currentTeam.ToString() : null,
                server = ConVar.Server.hostname,
                stats = new { kills = s.k, deaths = s.d, headshots = s.hs, bodyshots = s.bs, limbshots = s.ls, playtime_hours = Math.Round(GetPlaytime(p.UserIDString) / 3600, 2), reports_count = s.rp, kd = s.d > 0 ? Math.Round((double)s.k / s.d, 2) : s.k }
            };
        }
        
        void SendMapUrl()
        {
            if (string.IsNullOrEmpty(_meta.Key) || string.IsNullOrEmpty(_mapImageUrl)) return;
            
            var data = new Dictionary<string, object>
            {
                ["mapUrl"] = _mapImageUrl,
                ["worldSize"] = World.Size,
                ["hostname"] = GetServerAddress()
            };

            string json = JsonConvert.SerializeObject(data);
            webrequest.Enqueue($"{API}/map-url", json, (c, r) => 
            { 
                if (c == 200) Puts("Map URL sent successfully");
                else if (c != 0) PrintWarning($"Failed to send map URL: {c}");
            }, this, Oxide.Core.Libraries.RequestMethod.POST, Headers());
        }

        void SendChat()
        {
            if (string.IsNullOrEmpty(_meta.Key) || _chatQueue.Count == 0) return;
            var msgs = new List<ChatMsg>(_chatQueue); _chatQueue.Clear();
            var json = JsonConvert.SerializeObject(new { messages = msgs, server = ConVar.Server.hostname });
            webrequest.Enqueue($"{API}/chat", json, (c, r) => { if (c != 200) _chatQueue.AddRange(msgs); }, this, Oxide.Core.Libraries.RequestMethod.POST, Headers());
        }

        void SendKills()
        {
            if (string.IsNullOrEmpty(_meta.Key) || _killsQueue.Count == 0) return;
            var kills = new List<KillDto>(_killsQueue); _killsQueue.Clear();
            var json = JsonConvert.SerializeObject(new { kills, server = ConVar.Server.hostname });
            webrequest.Enqueue($"{API}/kills", json, (c, r) => { if (c != 200) _killsQueue.AddRange(kills); }, this, Oxide.Core.Libraries.RequestMethod.POST, Headers());
        }

        void FetchCmd()
        {
            if (string.IsNullOrEmpty(_meta.Key)) return;
            webrequest.Enqueue($"{API}/cmd", null, (c, r) =>
            {
                if (r == null)
                {
                    // Сервер не ответил или ошибка соединения
                    return;
                }
                if (c != 200)
                {
                    if (c == 401) Puts("[FetchCmd] Unauthorized - check API key");
                    return;
                }
                if (string.IsNullOrEmpty(r) || r == "[]" || r == "null") return;
                try
                {
                    var commands = JsonConvert.DeserializeObject<List<Cmd>>(r);
                    if (commands == null || commands.Count == 0) return;
                    foreach (var cmd in commands)
                    {
                        if (cmd == null || string.IsNullOrEmpty(cmd.type)) continue;
                        
                        switch (cmd.type)
                        {
                            case "chat_message":
                                if (cmd.is_global) 
                                { 
                                    foreach (var p in BasePlayer.activePlayerList) 
                                        SendReply(p, $"<color=#84cc16>[Админ]</color> {cmd.message}"); 
                                }
                                else if (!string.IsNullOrEmpty(cmd.target_steam_id))
                                { 
                                    var t = BasePlayer.Find(cmd.target_steam_id); 
                                    if (t?.IsConnected == true) 
                                        SendReply(t, $"<color=#84cc16>[ЛС]</color> {cmd.message}"); 
                                }
                                break;
                                
                            case "mute":
                                var muteSteamId = !string.IsNullOrEmpty(cmd.target_steam_id) ? cmd.target_steam_id : cmd.steam_id;
                                if (!string.IsNullOrEmpty(muteSteamId) && ulong.TryParse(muteSteamId, out var muteId))
                                {
                                    _mutes[muteId] = new MuteData
                                    {
                                        reason = cmd.reason ?? "Нарушение правил чата",
                                        expired_at = cmd.expired_at,
                                        created_at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                                    };
                                    var target = BasePlayer.Find(muteSteamId);
                                    var duration = cmd.expired_at == 0 ? "навсегда" : GetTimeLeft(cmd.expired_at - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                                    if (target?.IsConnected == true)
                                    {
                                        SendReply(target, $"Вы замьючены!<size=12>\n- причина: {cmd.reason}\n- осталось: {duration}</size>");
                                    }
                                    if (cmd.broadcast)
                                    {
                                        foreach (var p in BasePlayer.activePlayerList)
                                            SendReply(p, $"Игрок <color=#5af>{target?.displayName ?? muteSteamId}</color> получил мут.\n<size=12>- причина: {cmd.reason}\n- срок: {duration}</size>");
                                    }
                                    Puts($"[Mute] {muteSteamId} - {cmd.reason}");
                                }
                                break;
                                
                            case "unmute":
                                var unmuteSteamId = !string.IsNullOrEmpty(cmd.target_steam_id) ? cmd.target_steam_id : cmd.steam_id;
                                if (!string.IsNullOrEmpty(unmuteSteamId) && ulong.TryParse(unmuteSteamId, out var unmuteId))
                                {
                                    if (_mutes.Remove(unmuteId))
                                    {
                                        var target = BasePlayer.Find(unmuteSteamId);
                                        if (target?.IsConnected == true)
                                            SendReply(target, "Ваш мут снят.");
                                        Puts($"[Unmute] {unmuteSteamId}");
                                    }
                                }
                                break;
                                
                            case "kick":
                                var kickSteamId = !string.IsNullOrEmpty(cmd.target_steam_id) ? cmd.target_steam_id : cmd.steam_id;
                                if (!string.IsNullOrEmpty(kickSteamId))
                                {
                                    var target = BasePlayer.Find(kickSteamId);
                                    if (target?.IsConnected == true)
                                    {
                                        var kickReason = !string.IsNullOrEmpty(cmd.reason) ? cmd.reason : "Kicked by admin";
                                        target.Kick(kickReason);
                                        Puts($"[Kick] {kickSteamId} - {kickReason}");
                                        if (cmd.broadcast)
                                        {
                                            foreach (var p in BasePlayer.activePlayerList)
                                                SendReply(p, $"Игрок <color=#5af>{target.displayName}</color> был кикнут.\n<size=12>- причина: {kickReason}</size>");
                                        }
                                    }
                                }
                                break;
                                
                            case "ban":
                                var banSteamId = !string.IsNullOrEmpty(cmd.target_steam_id) ? cmd.target_steam_id : cmd.steam_id;
                                if (!string.IsNullOrEmpty(banSteamId))
                                {
                                    var target = BasePlayer.Find(banSteamId);
                                    var banReason = !string.IsNullOrEmpty(cmd.reason) ? cmd.reason : "Banned by admin";
                                    var banDuration = cmd.expired_at > 0 
                                        ? (cmd.expired_at - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) / 1000 
                                        : 0;
                                    
                                    // Add to server ban list
                                    if (ulong.TryParse(banSteamId, out var banId))
                                    {
                                        var playerName = target?.displayName ?? banSteamId;
                                        ServerUsers.Set(banId, ServerUsers.UserGroup.Banned, playerName, banReason);
                                        ServerUsers.Save();
                                        
                                        // Kick if online
                                        if (target?.IsConnected == true)
                                        {
                                            var banMsg = banDuration > 0 
                                                ? $"Вы забанены до {DateTimeOffset.FromUnixTimeMilliseconds(cmd.expired_at).DateTime.ToString("dd.MM.yyyy HH:mm")} (МСК)\nПричина: {banReason}"
                                                : $"Вы навсегда забанены на этом сервере\nПричина: {banReason}";
                                            target.Kick(banMsg);
                                        }
                                        
                                        Puts($"[Ban] {banSteamId} - {banReason}");
                                        
                                        if (cmd.broadcast)
                                        {
                                            foreach (var p in BasePlayer.activePlayerList)
                                                SendReply(p, $"Игрок <color=#5af>{playerName}</color> был заблокирован.\n<size=12>- причина: {banReason}</size>");
                                        }
                                    }
                                }
                                break;
                                
                            case "unban":
                                var unbanSteamId = !string.IsNullOrEmpty(cmd.target_steam_id) ? cmd.target_steam_id : cmd.steam_id;
                                if (!string.IsNullOrEmpty(unbanSteamId) && ulong.TryParse(unbanSteamId, out var unbanId))
                                {
                                    ServerUsers.Remove(unbanId);
                                    ServerUsers.Save();
                                    Puts($"[Unban] {unbanSteamId}");
                                }
                                break;
                                
                            case "custom_action":
                                if (!string.IsNullOrEmpty(cmd.command))
                                {
                                    ConsoleSystem.Run(ConsoleSystem.Option.Server, cmd.command);
                                    Puts($"[CustomAction] {cmd.command}");
                                }
                                break;
                        }
                    }
                } catch (Exception ex) { Puts($"[FetchCmd Error] {ex.Message}"); }
            }, this, Oxide.Core.Libraries.RequestMethod.GET, Headers());
        }

        void SendReports()
        {
            if (string.IsNullOrEmpty(_meta.Key) || _reportsQueue.Count == 0) return;
            var reports = new List<PluginReportDto>(_reportsQueue); _reportsQueue.Clear();
            var json = JsonConvert.SerializeObject(new { reports });
            webrequest.Enqueue($"{API}/reports", json, (c, r) => { if (c != 200) _reportsQueue.AddRange(reports); }, this, Oxide.Core.Libraries.RequestMethod.POST, Headers());
        }

        #region UI Report
        const string ReportLayer = "PR_ReportLayer";

        [ChatCommand("rep")]
        void CmdChatReport(BasePlayer player, string command, string[] args)
        {
            if (_reportCooldowns.ContainsKey(player.userID) && _reportCooldowns[player.userID] > CurrentTime())
            {
                var timeLeft = Math.Ceiling(_reportCooldowns[player.userID] - CurrentTime());
                ShowNotification(player, $"Подождите {timeLeft} сек. перед следующим репортом");
                return;
            }

            DrawReportInterface(player);
        }

        void DrawReportInterface(BasePlayer player, int page = 0, string search = "", bool redraw = false)
        {
            var lineAmount = 6;
            var lineMargin = 8;
            var size = (float)(700 - lineMargin * lineAmount) / lineAmount;

            var list = BasePlayer.activePlayerList.ToList();
            var filteredList = list.FindAll(v => v.displayName.ToLower().Contains(search.ToLower()) || v.UserIDString.Contains(search) || string.IsNullOrEmpty(search));
            var finalList = filteredList.Skip(page * 18).Take(18).ToList();

            if (finalList.Count == 0 && page > 0)
            {
                DrawReportInterface(player, page - 1, search, true);
                return;
            }

            CuiElementContainer container = new CuiElementContainer();

            if (!redraw)
            {
                container.Add(new CuiPanel
                {
                    CursorEnabled = true,
                    RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMax = "0 0" },
                    Image = { Color = "0 0 0 0.8", Material = "assets/content/ui/uibackgroundblur-ingamemenu.mat" }
                }, "Overlay", ReportLayer, ReportLayer);

                container.Add(new CuiButton()
                {
                    RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMax = "0 0" },
                    Button = { Color = HexToRustFormat("#34343480"), Sprite = "assets/content/ui/ui.background.transparent.radial.psd", Close = ReportLayer },
                    Text = { Text = "" }
                }, ReportLayer);
            }
            else
            {
                CuiHelper.DestroyUi(player, ReportLayer + ".C");
            }

            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0.5 0.5", AnchorMax = "0.5 0.5", OffsetMin = "-368 -200", OffsetMax = "368 142" },
                Image = { Color = "0 0 0 0" }
            }, ReportLayer, ReportLayer + ".C", ReportLayer + ".C");

            // Navigation Panel (Right side)
            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "1 0", AnchorMax = "1 1", OffsetMin = "-36 0", OffsetMax = "0 0" },
                Image = { Color = "0 0 0 0" }
            }, ReportLayer + ".C", ReportLayer + ".R");

            // Up Button
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0 0.5", AnchorMax = "1 1", OffsetMin = "0 4", OffsetMax = "0 0" },
                Button = { Color = HexToRustFormat(page == 0 ? "#D0C6BD33" : "#D0C6BD4D"), Command = page == 0 ? "" : $"panrust.page {page - 1} {search}" },
                Text = { Text = "↑", Align = TextAnchor.MiddleCenter, Font = "robotocondensed-bold.ttf", FontSize = 24, Color = HexToRustFormat(page == 0 ? "#D0C6BD4D" : "#D0C6BD") }
            }, ReportLayer + ".R");

            // Down Button
            var hasNext = filteredList.Count > (page + 1) * 18;
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 0.5", OffsetMin = "0 0", OffsetMax = "0 -4" },
                Button = { Color = HexToRustFormat(hasNext ? "#D0C6BD4D" : "#D0C6BD33"), Command = hasNext ? $"panrust.page {page + 1} {search}" : "" },
                Text = { Text = "↓", Align = TextAnchor.MiddleCenter, Font = "robotocondensed-bold.ttf", FontSize = 24, Color = HexToRustFormat(hasNext ? "#D0C6BD" : "#D0C6BD4D") }
            }, ReportLayer + ".R");

            // Header
            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 1", AnchorMax = "1 1", OffsetMin = "0 7", OffsetMax = "0 47" },
                Text = { Text = "Выберите игрока", Font = "robotocondensed-bold.ttf", Color = HexToRustFormat("#D0C6BD"), FontSize = 24, Align = TextAnchor.MiddleLeft }
            }, ReportLayer + ".C");

            // Search Input (Simpler than RustApp but functional)
            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "1 1", AnchorMax = "1 1", OffsetMin = "-250 8", OffsetMax = "0 43" },
                Image = { Color = HexToRustFormat("#D0C6BD33") }
            }, ReportLayer + ".C", ReportLayer + ".S");

            container.Add(new CuiElement
            {
                Parent = ReportLayer + ".S",
                Components = {
                    new CuiInputFieldComponent { FontSize = 14, Font = "robotocondensed-regular.ttf", Color = HexToRustFormat("#D0C6BD80"), Align = TextAnchor.MiddleLeft, Command = "panrust.search ", NeedsKeyboard = true, Text = "Поиск..." },
                    new CuiRectTransformComponent { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "10 0", OffsetMax = "-10 0" }
                }
            });

            // Grid Container
            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "0 0", OffsetMax = "-40 0" },
                Image = { Color = "0 0 0 0" }
            }, ReportLayer + ".C", ReportLayer + ".L");

            // Players Grid (Always 18 slots)
            for (var i = 0; i < 18; i++)
            {
                var x = i % 6;
                var y = i / 6;

                var min = $"{x * size + lineMargin * x} -{(y + 1) * size + lineMargin * y}";
                var max = $"{(x + 1) * size + lineMargin * x} -{y * size + lineMargin * y}";

                var target = finalList.ElementAtOrDefault(i);
                if (target != null)
                {
                    var panelName = ReportLayer + $".{target.UserIDString}";
                    container.Add(new CuiPanel
                    {
                        RectTransform = { AnchorMin = "0 1", AnchorMax = "0 1", OffsetMin = min, OffsetMax = max },
                        Image = { Color = HexToRustFormat("#D0C6BD33") }
                    }, ReportLayer + ".L", panelName);

                    container.Add(new CuiElement
                    {
                        Parent = panelName,
                        Components = {
                            new CuiRawImageComponent { SteamId = target.UserIDString, Sprite = "assets/icons/loading.png" },
                            new CuiRectTransformComponent { AnchorMin = "0 0", AnchorMax = "1 1" }
                        }
                    });

                    container.Add(new CuiPanel
                    {
                        RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1" },
                        Image = { Sprite = "assets/content/ui/ui.background.transparent.linear.psd", Color = HexToRustFormat("#282828F2") }
                    }, panelName);

                    container.Add(new CuiLabel
                    {
                        RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "6 16", OffsetMax = "0 0" },
                        Text = { Text = target.displayName.Length > 14 ? target.displayName.Substring(0, 12) + ".." : target.displayName, Align = TextAnchor.LowerLeft, Font = "robotocondensed-bold.ttf", FontSize = 13, Color = HexToRustFormat("#D0C6BD") }
                    }, panelName);

                    container.Add(new CuiLabel
                    {
                        RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "6 5", OffsetMax = "0 0" },
                        Text = { Text = target.UserIDString, Align = TextAnchor.LowerLeft, Font = "robotocondensed-regular.ttf", FontSize = 10, Color = HexToRustFormat("#D0C6BD80") }
                    }, panelName);

                    container.Add(new CuiButton
                    {
                        RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1" },
                        Button = { Color = "0 0 0 0", Command = $"panrust.select {target.UserIDString} {min.Replace(' ', ',')} {max.Replace(' ', ',')} {x >= 3}" },
                        Text = { Text = "" }
                    }, panelName);
                }
                else
                {
                    container.Add(new CuiPanel
                    {
                        RectTransform = { AnchorMin = "0 1", AnchorMax = "0 1", OffsetMin = min, OffsetMax = max },
                        Image = { Color = HexToRustFormat("#D0C6BD33") }
                    }, ReportLayer + ".L");
                }
            }

            CuiHelper.AddUi(player, container);
        }

        [ConsoleCommand("panrust.page")]
        void CmdPage(ConsoleSystem.Arg a)
        {
            var player = a.Player();
            if (player == null || a.Args?.Length < 1) return;
            var page = int.Parse(a.Args[0]);
            var search = a.Args.Length > 1 ? a.Args[1] : "";
            DrawReportInterface(player, page, search, true);
        }

        [ConsoleCommand("panrust.search")]
        void CmdSearch(ConsoleSystem.Arg a)
        {
            var player = a.Player();
            if (player == null) return;
            var search = a.Args?.Length > 0 ? a.Args[0] : "";
            DrawReportInterface(player, 0, search, true);
        }

        [ConsoleCommand("panrust.select")]
        void CmdSelectPlayer(ConsoleSystem.Arg a)
        {
            var player = a.Player();
            if (player == null || a.Args?.Length < 4) return;

            var targetId = a.Args[0];
            var min = a.Args[1].Replace(',', ' ');
            var max = a.Args[2].Replace(',', ' ');
            var leftAlign = bool.Parse(a.Args[3]);

            DrawPlayerReportReasons(player, targetId, min, max, leftAlign);
        }

        void DrawPlayerReportReasons(BasePlayer player, string targetId, string min, string max, bool leftAlign)
        {
            BasePlayer target = BasePlayer.Find(targetId) ?? BasePlayer.FindSleeping(targetId);
            if (target == null) return;

            CuiHelper.DestroyUi(player, ReportLayer + ".T");
            CuiElementContainer container = new CuiElementContainer();

            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0 1", AnchorMax = "0 1", OffsetMin = min, OffsetMax = max },
                Image = { Color = HexToRustFormat("#84cc1633") } // Зелёный полупрозрачный как выделение
            }, ReportLayer + ".C", ReportLayer + ".T");

            container.Add(new CuiElement
            {
                Parent = ReportLayer + ".T",
                Components = {
                    new CuiOutlineComponent { Color = HexToRustFormat("#84cc16"), Distance = "1 1" }, // Зелёная рамка
                    new CuiRectTransformComponent { AnchorMin = "0 0", AnchorMax = "1 1" }
                }
            });

            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "-10 -10", AnchorMax = "10 10" },
                Button = { Color = "0 0 0 0", Close = ReportLayer + ".T" },
                Text = { Text = "" }
                }, ReportLayer + ".T");

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = leftAlign ? "0 0" : "1 0", AnchorMax = leftAlign ? "0 1" : "1 1", OffsetMin = leftAlign ? "-350 0" : "20 0", OffsetMax = leftAlign ? "-20 -5" : "350 -5" },
                Text = { Text = "Выберите причину", Font = "robotocondensed-bold.ttf", Color = "0.8 0.8 0.8 1", FontSize = 20, Align = leftAlign ? TextAnchor.UpperRight : TextAnchor.UpperLeft }
            }, ReportLayer + ".T");

            for (var i = 0; i < _config.report_ui_reasons.Count; i++)
            {
                var reason = _config.report_ui_reasons[i];
                var width = 80;
                var margin = 8;
                var offXMin = 20 + i * (width + margin);
                var offXMax = offXMin + width;

                container.Add(new CuiButton
                {
                    RectTransform = { AnchorMin = leftAlign ? "0 0" : "1 0", AnchorMax = leftAlign ? "0 0" : "1 0", OffsetMin = $"{(leftAlign ? -offXMax : offXMin)} 15", OffsetMax = $"{(leftAlign ? -offXMin : offXMax)} 45" },
                    Button = { Color = HexToRustFormat("#D0C6BD33"), Command = $"panrust.sendreport {target.UserIDString} \"{reason}\"" },
                    Text = { Text = reason, Align = TextAnchor.MiddleCenter, Color = HexToRustFormat("#D0C6BD"), Font = "robotocondensed-bold.ttf", FontSize = 14 }
                }, ReportLayer + ".T");
            }

            CuiHelper.AddUi(player, container);
        }

        [ConsoleCommand("panrust.sendreport")]
        void CmdSendReport(ConsoleSystem.Arg a)
        {
            var player = a.Player();
            if (player == null || a.Args?.Length < 2) return;

            var targetId = a.Args[0];
            var reason = a.Args[1];

            CuiHelper.DestroyUi(player, ReportLayer);
            RA_ReportSend(player.UserIDString, targetId, reason);
            
            _reportCooldowns[player.userID] = CurrentTime() + _config.report_ui_cooldown;
            ShowNotification(player, "Ваша жалоба отправлена. Спасибо!");
        }

        void RA_ReportSend(string initiator_steam_id, string target_steam_id, string reason, string message = "")
        {
            _reportsQueue.Add(new PluginReportDto
            {
                initiator_steam_id = initiator_steam_id,
                target_steam_id = target_steam_id,
                sub_targets_steam_ids = new List<string>(),
                message = message,
                reason = reason
            });
            
            // Increment local stats
            if (ulong.TryParse(target_steam_id, out _)) GetStats(target_steam_id).rp++;
        }
        #endregion

        double CurrentTime() => DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        void ShowNotification(BasePlayer player, string message, float duration = 3f)
        {
            // Проигрываем звук
            Effect.server.Run("assets/bundled/prefabs/fx/notice/loot.copy.fx.prefab", player.transform.position);
            
            // Показываем toast уведомление
            player.ShowToast(GameTip.Styles.Blue_Normal, message);
        }

        class Cmd 
        { 
            public string type; 
            public string target_steam_id;
            public string steam_id;
            public string message;
            public string reason; 
            public string command;
            public bool is_global;
            public bool broadcast; 
            public long expired_at;
        }
        #endregion

        #region Console
        [ConsoleCommand("panrust.pair")]
        void CmdPair(ConsoleSystem.Arg a)
        {
            if (a.Connection != null || a.Args?.Length == 0) return;
            _meta.Key = a.Args[0]; MetaInfo.Write(_meta);
            Puts("Key saved! oxide.reload PanRust");
        }

        [ConsoleCommand("panrust.status")]
        void CmdStatus(ConsoleSystem.Arg a)
        {
            if (a.Connection != null) return;
            Puts(string.IsNullOrEmpty(_meta.Key) ? "Not connected" : $"Connected | Players: {_stats.p.Count}");
        }
        #endregion
    }
}
