import { getGroqClient } from "../../../../../lib/groq-client";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image");
    const prompt = formData.get("prompt");

    if (!imageFile) {
      return new Response(JSON.stringify({ error: "Missing image file." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const promptText =
      prompt && typeof prompt === "string" && prompt.trim().length > 0
        ? prompt.trim()
        : "What's in this image?";

    // FormData File in Next has `.arrayBuffer()` and `.type`.
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    const mimeType = imageFile.type || "image/png";

    const groq = getGroqClient();

    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      temperature: 1,
      max_completion_tokens: 1024,
      top_p: 1,
      stream: false,
      stop: null,
    });

    return Response.json({ text: completion?.choices?.[0]?.message?.content || "" });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

