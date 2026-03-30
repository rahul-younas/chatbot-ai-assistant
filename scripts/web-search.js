import Groq from "groq-sdk";

const groq = new Groq();

const response = await groq.chat.completions.create({
  model: "groq/compound",
  messages: [
    {
      role: "user",
      // content value will be replace with prompt of user in input field
        content: "user's prompt given in input field.",
    },
  ]
});

// Final output
console.log(response.choices[0].message.content);

// Reasoning + internal tool calls
console.log(response.choices[0].message.reasoning);

// Search results from the tool calls
console.log(response.choices[0].message.executed_tools?.[0].search_results);