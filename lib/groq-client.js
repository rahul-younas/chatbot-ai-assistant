import Groq from "groq-sdk";
import { ensureServerEnv } from "./env-server";

let groqClient;

export function getGroqClient() {
  ensureServerEnv();

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is missing. Put it in `local.env` (e.g. GROQ_API_KEY=...)."
    );
  }

  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }

  return groqClient;
}

