// Serverless function (Vercel): receives the student's answers + selfie,
// asks OpenAI's image model for a caricature, returns it as base64 JPEG.
//
// Environment variables (set in Vercel → Project → Settings → Environment Variables):
//   OPENAI_API_KEY      required. Your OpenAI API key.
//   CLASS_CODE          optional. If set, the page link must include ?code=<CLASS_CODE>,
//                       so strangers who find the site can't spend your credits.
//   OPENAI_IMAGE_MODEL  optional. Default "gpt-image-1".
//   IMAGE_QUALITY       optional. "low" | "medium" | "high". Default "medium".

const MAX_ANSWER = 300;
const MAX_IMAGE_BYTES = 3_000_000;

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_ANSWER);
}

function buildPrompt(a) {
  return `Turn the person in this selfie into a fun, friendly, flattering caricature illustration.

Style: polished hand-drawn digital caricature, like a professional caricature artist at a fair:
a big expressive head (about 45% of the image) on a small body, warm colors, clean lines, soft shading.
The face must clearly look like the person in the photo: keep their real face shape, skin tone,
hair color and style, eyebrows, eye color, glasses, facial hair, accessories and smile.
Exaggerate gently and kindly. Never mock or make them look bad.

The person is an Israeli teenager getting ready for military service. Use these details from their answers
(written in Hebrew) to build the scene:
- Hobby (show them holding or doing it): ${a.hobby}
- What they love doing with friends (add a small visual hint of it): ${a.friends}
- Where they want to serve in the IDF (dress them in a fitting IDF uniform, beret color or gear for that unit or role): ${a.army}
- Their adult role model and what that person means to them (add one small symbolic touch): ${a.rolemodel}
- Their favorite place in Israel (a recognizable, simplified background of it): ${a.place}

Composition: full character, centered, vertical portrait. No text, letters, logos or watermarks anywhere in the image.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: "missing_api_key" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  const classCode = process.env.CLASS_CODE;
  if (classCode && body.code !== classCode) {
    return res.status(401).json({ error: "bad_code" });
  }

  const answers = {
    hobby: clean(body.answers?.hobby),
    friends: clean(body.answers?.friends),
    army: clean(body.answers?.army),
    rolemodel: clean(body.answers?.rolemodel),
    place: clean(body.answers?.place),
  };

  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(body.selfie || "");
  if (!m) return res.status(400).json({ error: "bad_image" });
  const bytes = Buffer.from(m[3], "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    return res.status(400).json({ error: "bad_image" });
  }

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", buildPrompt(answers));
  form.append("image", new Blob([bytes], { type: m[1] }), "selfie." + m[2]);
  form.append("size", "1024x1536");
  form.append("quality", process.env.IMAGE_QUALITY || "medium");
  form.append("output_format", "jpeg");
  form.append("output_compression", "85");
  form.append("n", "1");
  if (model === "gpt-image-1") form.append("input_fidelity", "high");

  let r, data;
  try {
    r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    data = await r.json();
  } catch (e) {
    console.error("OpenAI request failed", e);
    return res.status(502).json({ error: "upstream_error" });
  }

  if (!r.ok) {
    console.error("OpenAI error", r.status, JSON.stringify(data?.error));
    const code = data?.error?.code;
    if (code === "moderation_blocked" || code === "content_policy_violation") {
      return res.status(422).json({ error: "refused" });
    }
    if (r.status === 429) return res.status(429).json({ error: "rate_limited" });
    return res.status(502).json({ error: "upstream_error" });
  }

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return res.status(502).json({ error: "upstream_error" });
  return res.status(200).json({ image: "data:image/jpeg;base64," + b64 });
}
