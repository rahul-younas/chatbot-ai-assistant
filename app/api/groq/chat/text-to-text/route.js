import { getGroqClient } from "../../../../../lib/groq-client";
import { streamChatCompletion } from "../../../../../lib/groq-chat";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing `prompt`." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const groq = getGroqClient();

    const text = await streamChatCompletion({
      groq,
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Respond in Markdown. Be precise, authentic, and concise. Keep answers under ~200 words unless the user asks for more. Prefer bullet points when listing items. If you are unsure, say so.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_completion_tokens: 700,
      top_p: 1,
    });

    return Response.json({ text });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

