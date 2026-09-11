import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3010);
const host = process.env.HOST || "0.0.0.0";
const discordGuildId = "1503682182936399902";
const discordRoleId = "1503927606360150169";
const discordLogChannelId = "1503938380126490674";
const jsonHeaders = {"Content-Type": "application/json; charset=utf-8"};
async function discordRequest(url, options = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured.");
  return fetch(`https://discord.com/api/v10${url}`, {
    ...options,
    headers: {...options.headers, Authorization: `Bot ${token}`}
  });
}
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/discord-status") {
    (async () => {
      try {
        const [bot, guild, role, channel] = await Promise.all([
          discordRequest("/users/@me"),
          discordRequest(`/guilds/${discordGuildId}`),
          discordRequest(`/guilds/${discordGuildId}/roles/${discordRoleId}`),
          discordRequest(`/channels/${discordLogChannelId}`)
        ]);
        const statuses = [bot, guild, role, channel];
        if (statuses.some(response => !response.ok)) {
          res.writeHead(502, {"Content-Type": "application/json; charset=utf-8"});
          return res.end(JSON.stringify({error: "تعذر التحقق من أحد موارد Discord.", statuses: statuses.map(response => response.status)}));
        }
        const [botData, guildData, roleData, channelData] = await Promise.all(statuses.map(response => response.json()));
        res.writeHead(200, {"Content-Type": "application/json; charset=utf-8"});
        return res.end(JSON.stringify({bot: botData.username, guild: guildData.name, role: roleData.name, logChannel: channelData.name}));
      } catch (error) {
        res.writeHead(503, {"Content-Type": "application/json; charset=utf-8"});
        return res.end(JSON.stringify({error: error.message}));
      }
    })();
    return;
  }
  if (req.method === "POST" && req.url === "/api/assign-role") {
    let body = "";
    let tooLarge = false;
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2048) tooLarge = true;
    });
    req.on("end", async () => {
      try {
        if (tooLarge) {
          res.writeHead(413, jsonHeaders);
          return res.end(JSON.stringify({error: "حجم الطلب كبير جدًا."}));
        }
        const { userId } = JSON.parse(body);
        const token = process.env.DISCORD_BOT_TOKEN;
        if (!token || !/^\d{17,20}$/.test(userId)) {
          res.writeHead(400, jsonHeaders);
          return res.end(JSON.stringify({error: "بيانات Discord أو إعداد توكن البوت غير صحيحة."}));
        }
        const discordResponse = await discordRequest(`/guilds/${discordGuildId}/members/${userId}/roles/${discordRoleId}`, {
          method: "PUT",
        });
        if (!discordResponse.ok) {
          await discordResponse.text();
          res.writeHead(discordResponse.status, jsonHeaders);
          return res.end(JSON.stringify({error: "تعذر منح الرتبة من Discord.", details: discordResponse.statusText}));
        }
        const logResponse = await discordRequest(`/channels/${discordLogChannelId}/messages`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({embeds: [{title: "اجتياز التدريب ومنح رتبة", color: 13111342, fields: [
            {name: "معرّف Discord", value: userId, inline: true},
            {name: "الرتبة", value: discordRoleId, inline: true},
            {name: "الحالة", value: "تم منح الرتبة بنجاح", inline: false}
          ], timestamp: new Date().toISOString()}]})
        });
        if (!logResponse.ok) {
          const details = await logResponse.text();
          res.writeHead(502, jsonHeaders);
          return res.end(JSON.stringify({error: "تم منح الرتبة لكن تعذر إرسال سجل Discord.", details}));
        }
        res.writeHead(204);
        return res.end();
      } catch (error) {
        res.writeHead(400, jsonHeaders);
        return res.end(JSON.stringify({error: "تعذر معالجة طلب منح الرتبة."}));
      }
    });
    return;
  }
  const requestPath = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  const file = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const target = path.resolve(root, file);
  const relativeTarget = path.relative(root, target);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
    return res.end("Not found");
  }
  const types = {".html": "text/html", ".css": "text/css", ".js": "text/javascript"};
  res.writeHead(200, {"Content-Type": `${types[path.extname(target)] || "application/octet-stream"}; charset=utf-8`});
  res.end(fs.readFileSync(target));
});
server.listen(port, host, () => console.log(`Red Crescent Training listening on http://${host}:${port}`));
