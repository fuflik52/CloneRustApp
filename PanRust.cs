using Newtonsoft.Json;
using Oxide.Core;
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
        readonly Dictionary<ulong, HitData> _wounds = new Dictionary<ulong, HitData>();
        readonly Dictionary<ulong, float> _sessions = new Dictionary<ulong, float>();
        readonly Dictionary<ulong, List<HitRecord>> _hitHistory = new Dictionary<ulong, List<HitRecord>>();
        readonly Dictionary<ulong, MuteData> _mutes = new Dictionary<ulong, MuteData>();

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
            public float UpdateInt = 5f, ChatInt = 1f, KillsInt = 5f, SaveInt = 60f;
        }

        class ChatMsg { public string si, n, m; public bool t; public long ts; }

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
            timer.Once(2f, Sync);
            timer.Every(_config.UpdateInt, SendState);
            timer.Every(_config.ChatInt, SendChat);
            timer.Every(_config.KillsInt, SendKills);
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

        void OnPlayerChat(BasePlayer p, string m, ConVar.Chat.ChatChannel c)
        {
            if (string.IsNullOrEmpty(_meta.Key) || string.IsNullOrEmpty(m)) return;
            if (c != ConVar.Chat.ChatChannel.Team && c != ConVar.Chat.ChatChannel.Global) return;
            
            // Проверяем мут
            if (_mutes.TryGetValue(p.userID, out var mute))
            {
                var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if (mute.expired_at == 0 || mute.expired_at > now)
                {
                    var leftTime = mute.expired_at == 0 ? "навсегда" : GetTimeLeft(mute.expired_at - now);
                    SendReply(p, $"<color=#ef4444>Вы замьючены!</color>\n<size=12>Причина: {mute.reason}\nОсталось: {leftTime}</size>");
                    return;
                }
                else
                {
                    _mutes.Remove(p.userID);
                }
            }
            
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
        void Sync()
        {
            var pl = new List<object>();
            foreach (var p in BasePlayer.activePlayerList) pl.Add(MakePlayer(p, true));
            foreach (var p in BasePlayer.sleepingPlayerList) pl.Add(MakePlayer(p, false));
            var json = JsonConvert.SerializeObject(new { hostname = ConVar.Server.hostname, port = ConVar.Server.port, players = pl });
            webrequest.Enqueue($"{API}/sync", json, (c, r) => { if (c != 200) Puts($"Sync err: {c}"); }, this, Oxide.Core.Libraries.RequestMethod.POST, Headers());
        }

        void SendState()
        {
            if (string.IsNullOrEmpty(_meta.Key)) return;
            var pl = new List<object>();
            foreach (var p in BasePlayer.activePlayerList) pl.Add(MakePlayer(p, true));
            var json = JsonConvert.SerializeObject(new { hostname = ConVar.Server.hostname, port = ConVar.Server.port, online = BasePlayer.activePlayerList.Count, max_players = ConVar.Server.maxplayers, players = pl });
            webrequest.Enqueue($"{API}/state", json, (c, r) => { }, this, Oxide.Core.Libraries.RequestMethod.POST, Headers());
        }

        object MakePlayer(BasePlayer p, bool on)
        {
            var s = GetStats(p.UserIDString);
            return new
            {
                steam_id = p.UserIDString, name = p.displayName, ip = on ? GetIP(p) : "", ping = on ? Network.Net.sv.GetAveragePing(p.Connection) : 0,
                online = on, position = p.transform.position.ToString(), server = ConVar.Server.hostname,
                stats = new { kills = s.k, deaths = s.d, headshots = s.hs, bodyshots = s.bs, limbshots = s.ls, playtime_hours = Math.Round(GetPlaytime(p.UserIDString) / 3600, 2), reports_count = s.rp, kd = s.d > 0 ? Math.Round((double)s.k / s.d, 2) : s.k }
            };
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
            webrequest.Enqueue($"{API}/commands", null, (c, r) =>
            {
                if (c != 200) return;
                try
                {
                    var d = JsonConvert.DeserializeObject<CmdResp>(r);
                    if (d?.commands == null) return;
                    foreach (var cmd in d.commands)
                    {
                        switch (cmd.type)
                        {
                            case "chat_message":
                                if (cmd.is_global) 
                                { 
                                    foreach (var p in BasePlayer.activePlayerList) 
                                        SendReply(p, $"<color=#84cc16>[Админ]</color> {cmd.message}"); 
                                }
                                else 
                                { 
                                    var t = BasePlayer.Find(cmd.target_steam_id); 
                                    if (t?.IsConnected == true) 
                                        SendReply(t, $"<color=#84cc16>[ЛС]</color> {cmd.message}"); 
                                }
                                break;
                                
                            case "mute":
                                if (!string.IsNullOrEmpty(cmd.target_steam_id) && ulong.TryParse(cmd.target_steam_id, out var muteId))
                                {
                                    _mutes[muteId] = new MuteData
                                    {
                                        reason = cmd.reason ?? "Нарушение правил чата",
                                        expired_at = cmd.expired_at,
                                        created_at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                                    };
                                    var target = BasePlayer.Find(cmd.target_steam_id);
                                    if (target?.IsConnected == true)
                                    {
                                        var duration = cmd.expired_at == 0 ? "навсегда" : GetTimeLeft(cmd.expired_at - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                                        SendReply(target, $"<color=#ef4444>Вы получили мут в чате!</color>\n<size=12>Причина: {cmd.reason}\nДлительность: {duration}</size>");
                                    }
                                    if (cmd.broadcast)
                                    {
                                        foreach (var p in BasePlayer.activePlayerList)
                                            SendReply(p, $"<color=#ef4444>[Мут]</color> Игрок <color=#fcd34d>{target?.displayName ?? cmd.target_steam_id}</color> замьючен. Причина: {cmd.reason}");
                                    }
                                    Puts($"[Mute] {cmd.target_steam_id} - {cmd.reason}");
                                }
                                break;
                                
                            case "unmute":
                                if (!string.IsNullOrEmpty(cmd.target_steam_id) && ulong.TryParse(cmd.target_steam_id, out var unmuteId))
                                {
                                    if (_mutes.Remove(unmuteId))
                                    {
                                        var target = BasePlayer.Find(cmd.target_steam_id);
                                        if (target?.IsConnected == true)
                                            SendReply(target, "<color=#22c55e>Ваш мут в чате снят!</color>");
                                        Puts($"[Unmute] {cmd.target_steam_id}");
                                    }
                                }
                                break;
                        }
                    }
                } catch { }
            }, this, Oxide.Core.Libraries.RequestMethod.GET, Headers());
        }

        class CmdResp { public List<Cmd> commands; }
        class Cmd 
        { 
            public string type, target_steam_id, message, reason; 
            public bool is_global, broadcast; 
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
