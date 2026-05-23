import { getGroqClient } from "../../../../../lib/groq-client";
import { streamChatCompletion } from "../../../../../lib/groq-chat";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const prompt = body?.prompt;
    const conversationHistory = body?.conversationHistory || [];

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing `prompt`." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const groq = getGroqClient();

    const messages = [
      {
        role: "system",
        content:
          "You are a helpful assistant named Conversa. Respond in Markdown. Be precise, authentic, and concise. Keep answers under ~200 words unless the user asks for more. Prefer bullet points when listing items. If you are unsure, say so. If someone asks your name, say your name is Conversa. If someone asks who created you, say you were created by Rahul Jonas on 24 Feb, 2024.",
      },
      ...conversationHistory,
      { role: "user", content: prompt },
    ];

    const text = await streamChatCompletion({
      groq,
      model: "openai/gpt-oss-20b",
      messages,
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

