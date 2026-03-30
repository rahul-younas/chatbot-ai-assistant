import { getGroqClient } from "../../../../../lib/groq-client";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const query = body?.query;
    const includeReasoning = body?.includeReasoning;

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Missing `query`." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const groq = getGroqClient();

    // Mirrors the goal of `scripts/we-search.js`: use the `groq/compound` model
    // to run web search tool calls and then return content + results.
    const response = await groq.chat.completions.create({
      model: "groq/compound",
      messages: [
        {
          role: "user",
          content:
            `Find the most recent web updates about: ${query}\n\n` +
            (includeReasoning
              ? "First provide a brief reasoning summary in 2-4 bullet points, then the final answer.\n"
              : "") +
            "Return the final answer in Markdown. Be precise, authentic, and concise. " +
            "Keep under ~250 words unless the user asks for more. " +
            "Use tool search results if available and include 3-6 sources (URLs preferred).",
        },
      ],
      temperature: 0.4,
      max_completion_tokens: 500,
      top_p: 1,
      stream: false,
    });

    const message = response?.choices?.[0]?.message;
    const text = message?.content || "";
    const reasoning = message?.reasoning;

    let searchResults = message?.executed_tools?.[0]?.search_results;
    if (searchResults && Array.isArray(searchResults.results)) {
      searchResults = searchResults.results;
    }
    if (!Array.isArray(searchResults)) searchResults = [];

    return Response.json({ text, reasoning, searchResults });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

