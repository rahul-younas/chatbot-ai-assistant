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

    // Build the reasoning prompt with conversation context
    let contextPrompt = "";
    if (conversationHistory.length > 0) {
      contextPrompt = "Previous conversation:\n";
      conversationHistory.forEach(msg => {
        contextPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
      contextPrompt += "\n";
    }

    const reasoningPrompt =
      `${contextPrompt}Current question: ${prompt}\n\nProvide a brief reasoning summary in 2-4 short bullet points, then a final answer. Respond in Markdown. Be precise, authentic, and concise. Keep the whole response under ~250 words. If someone asks your name, say your name is Conversa. If someone asks who created you, say you were created by Rahul Jonas on 24 Feb, 2024.`;

    const text = await streamChatCompletion({
      groq,
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: reasoningPrompt }],
      temperature: 0.4,
      max_completion_tokens: 450,
      top_p: 0.9,
    });

    return Response.json({ text });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

