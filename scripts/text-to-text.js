import Groq from "groq-sdk";

const groq = new Groq();

export async function main() {
  const stream = await getGroqChatStream();
  for await (const chunk of stream) {
    // Print the completion returned by the LLM.
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
}

export async function getGroqChatStream() {
  return groq.chat.completions.create({
    //
    // Required parameters
    //
    messages: [
      // Set an optional system message. This sets the behavior of the
      // assistant and can be used to provide specific instructions for
      // how it should behave throughout the conversation.
      {
        role: "system",
        content: "You are a helpful assistant.",
      },
      // Set a user message for the assistant to respond to.
      {
        role: "user",
        // content value will be replace with prompt of user in input field
        content: "user's prompt given in input field.",
      },
    ],

    // The language model which will generate the completion.
    model: "openai/gpt-oss-20b",

    //
    // Optional parameters
    //

    // Controls randomness: lowering results in less random completions.
    // As the temperature approaches zero, the model will become deterministic
    // and repetitive.
    temperature: 0.5,

    // The maximum number of tokens to generate. Requests can use up to
    // 2048 tokens shared between prompt and completion.
    max_completion_tokens: 4096,

    // Controls diversity via nucleus sampling: 0.5 means half of all
    // likelihood-weighted options are considered.
    top_p: 1,

    // A stop sequence is a predefined or user-specified text string that
    // signals an AI to stop generating content, ensuring its responses
    // remain focused and concise. Examples include punctuation marks and
    // markers like "[end]".
    stop: null,

    // If set, partial message deltas will be sent.
    stream: true,
  });
}

main();