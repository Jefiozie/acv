import { request } from "https";

export function sendTelegram(
  token: string,
  chatId: string,
  message: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    });

    const req = request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/sendMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          const parsed = JSON.parse(data) as { ok: boolean; description?: string };
          if (parsed.ok) {
            resolve();
          } else {
            reject(new Error(`Telegram error: ${parsed.description}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
