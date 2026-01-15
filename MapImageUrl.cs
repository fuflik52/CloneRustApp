using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using Oxide.Game.Rust.Cui;

namespace Oxide.Plugins
{
    [Info("MapImageUrl", "testmap", "1.0.0")]
    class MapImageUrl : RustPlugin
    {
        private string gridCrc = null;

        void OnServerInitialized() => ServerMgr.Instance.StartCoroutine(GenerateMap());

        [ConsoleCommand("mapurl")]
        void GetMapUrl(ConsoleSystem.Arg arg)
        {
            string originalUrl = MapUploader.ImageUrl;
            
            if (!string.IsNullOrEmpty(originalUrl))
                arg.ReplyWith($"Original Map URL: {originalUrl}");
            
            if (string.IsNullOrEmpty(gridCrc))
            {
                arg.ReplyWith("Generating map with grid & players...");
                ServerMgr.Instance.StartCoroutine(GenerateMap());
            }
            else
            {
                arg.ReplyWith($"Grid Map CRC (for UI): {gridCrc}");
                
                if (arg.Player() != null)
                {
                    ShowMap(arg.Player());
                    arg.ReplyWith("Map opened in UI!");
                }
                else
                {
                    arg.ReplyWith("Run from game to see map UI");
                }
            }
        }

        [ChatCommand("map")]
        void ShowMapCmd(BasePlayer player) => ShowMap(player);

        void ShowMap(BasePlayer player)
        {
            if (string.IsNullOrEmpty(gridCrc)) return;

            var ui = new CuiElementContainer();
            ui.Add(new CuiPanel
            {
                Image = { Color = "0 0 0 0.95" },
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1" },
                CursorEnabled = true
            }, "Overlay", "MapPanel");

            ui.Add(new CuiElement
            {
                Parent = "MapPanel",
                Components =
                {
                    new CuiRawImageComponent { Png = gridCrc },
                    new CuiRectTransformComponent { AnchorMin = "0.1 0.1", AnchorMax = "0.9 0.9" }
                }
            });

            ui.Add(new CuiButton
            {
                Button = { Color = "0.8 0.2 0.2 0.9", Close = "MapPanel" },
                Text = { Text = "CLOSE", FontSize = 20, Align = TextAnchor.MiddleCenter },
                RectTransform = { AnchorMin = "0.45 0.02", AnchorMax = "0.55 0.07" }
            }, "MapPanel");

            CuiHelper.AddUi(player, ui);
        }

        IEnumerator GenerateMap()
        {
            string url = MapUploader.ImageUrl;
            if (string.IsNullOrEmpty(url)) yield break;

            UnityWebRequest req = UnityWebRequestTexture.GetTexture(url);
            yield return req.SendWebRequest();
            if (req.isNetworkError || req.isHttpError) yield break;

            Texture2D map = DownloadHandlerTexture.GetContent(req);
            Texture2D result = DrawGridAndPlayers(map);
            byte[] png = result.EncodeToPNG();
            
            UnityEngine.Object.Destroy(map);
            UnityEngine.Object.Destroy(result);

            gridCrc = FileStorage.server.Store(png, FileStorage.Type.png, CommunityEntity.ServerInstance.net.ID).ToString();
            Puts($"Map generated. CRC: {gridCrc}");
        }

        Texture2D DrawGridAndPlayers(Texture2D orig)
        {
            int w = orig.width, h = orig.height;
            Texture2D tex = new Texture2D(w, h);
            tex.SetPixels(orig.GetPixels());

            float cell = 146.28572f;
            int grid = Mathf.FloorToInt(World.Size / cell + 0.001f);
            float ppc = (float)w / grid;

            // Сетка
            for (int i = 0; i <= grid; i++)
            {
                int x = Mathf.RoundToInt(i * ppc);
                for (int y = 0; y < h; y++) if (x < w) { tex.SetPixel(x, y, Color.white); if (x > 0) tex.SetPixel(x - 1, y, Color.white); }
            }
            for (int i = 0; i <= grid; i++)
            {
                int y = Mathf.RoundToInt(i * ppc);
                for (int x = 0; x < w; x++) if (y < h) { tex.SetPixel(x, y, Color.white); if (y > 0) tex.SetPixel(x, y - 1, Color.white); }
            }

            // Игроки
            foreach (var p in BasePlayer.activePlayerList)
            {
                Vector3 pos = p.transform.position;
                int px = Mathf.RoundToInt((pos.x + World.Size / 2f) / World.Size * w);
                int py = Mathf.RoundToInt((World.Size / 2f - pos.z) / World.Size * h);
                for (int dx = -3; dx <= 3; dx++)
                    for (int dy = -3; dy <= 3; dy++)
                    {
                        int x = px + dx, y = py + dy;
                        if (x >= 0 && x < w && y >= 0 && y < h && dx * dx + dy * dy <= 9)
                            tex.SetPixel(x, y, Color.red);
                    }
            }

            tex.Apply();
            return tex;
        }
    }
}
