export async function streamChatCompletion({
  groq,
  model,
  messages,
  temperature,
  max_completion_tokens,
  top_p,
}) {
  const stream = await groq.chat.completions.create({
    model,
    messages,
    temperature,
    max_completion_tokens,
    top_p,
    stream: true,
  });

  let text = "";
  for await (const chunk of stream) {
    text += chunk?.choices?.[0]?.delta?.content || "";
  }
  return text;
}

