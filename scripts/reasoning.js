import Groq from 'groq-sdk';

const client = new Groq();
const completion = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
        {
            role: "user",
            // text from input field will be placed here
            content: "user-prompt from input field"
        }
    ],
    temperature: 0.6,
    max_completion_tokens: 1024,
    top_p: 0.95,
    stream: true
});

for await (const chunk of completion) {
    process.stdout.write(chunk.choices[0].delta.content || "");
}