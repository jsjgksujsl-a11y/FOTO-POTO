import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ approved: false, message: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ approved: false, message: "Сначала войди в аккаунт." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return json({ approved: false, message: "Модерация пока не настроена. Публикация временно недоступна." }, 503);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return json({ approved: false, message: "Не удалось проверить аккаунт." }, 401);

  let body: { imageBase64?: string; mimeType?: string };
  try { body = await req.json(); } catch { return json({ approved: false, message: "Некорректный запрос." }, 400); }
  const mimeType = body.mimeType || "";
  const imageBase64 = body.imageBase64 || "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType) || !imageBase64 || imageBase64.length > 7_000_000) {
    return json({ approved: false, message: "Поддерживаются JPG, PNG и WEBP до 5 МБ." }, 400);
  }

  const prompt = `You are a narrow image safety classifier for a general-audience photo-sharing website.
Inspect the image and decide ONLY whether it contains pornography, explicit sexual activity, or clearly sexualized nudity.
Return exactly JSON: {"explicit": boolean, "reason": "short neutral reason"}.
Set explicit=true for pornographic imagery, visible sexual acts, or clearly explicit sexual nudity.
Set explicit=false for ordinary clothed people, friends, families, couples, ordinary affection, swimwear, sports, art, memes, animals, landscapes, and non-sexual everyday photos.
Do not treat a person's sexual orientation, gender identity, relationship, or the presence of same-gender couples as sexual content. Do not infer anything about people from identity.
If the image is ambiguous or cannot be assessed confidently, set explicit=true with a neutral reason so it can be reviewed rather than published.
Do not describe the image in detail.`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 128,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!response.ok) {
      console.error("Gemini moderation error:", response.status, await response.text());
      return json({ approved: false, message: "Сервис проверки временно недоступен. Попробуй позже." }, 503);
    }
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
    const parsed = JSON.parse(text);
    if (typeof parsed.explicit !== "boolean") throw new Error("Invalid moderation response");
    if (parsed.explicit) return json({ approved: false, message: "Фото не прошло проверку: порнография и откровенный сексуальный контент запрещены." });
    return json({ approved: true });
  } catch (error) {
    console.error("Moderation failed:", error);
    return json({ approved: false, message: "Не удалось проверить фото. Для безопасности публикация остановлена." }, 503);
  }
});
