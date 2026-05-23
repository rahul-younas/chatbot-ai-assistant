import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { getGroqClient } from "../../../../../lib/groq-client";
import { streamChatCompletion } from "../../../../../lib/groq-chat";

export const runtime = "nodejs";

function getDailyLimitMessage(rawMessage) {
  const msg = String(rawMessage || "").toLowerCase();

  const looksLikeDailyLimit =
    (msg.includes("daily") && (msg.includes("limit") || msg.includes("quota"))) ||
    (msg.includes("limit") && msg.includes("quota")) ||
    msg.includes("insufficient_quota") ||
    msg.includes("exceeded") && (msg.includes("quota") || msg.includes("limit"));

  if (!looksLikeDailyLimit) return null;

  return "Daily limit reached for voice chat. Please try again later (or tomorrow).";
}

async function writeTempFileFromBlob(blob, originalName = "audio") {
  const tmpDir = path.join(os.tmpdir(), "next-js-chat-bot");
  await fs.promises.mkdir(tmpDir, { recursive: true });

  const ext = path.extname(originalName) || "";
  const filename = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(tmpDir, filename);

  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

export async function POST(request) {
  let filePath;
  try {
    const formData = await request.formData();
    const audioBlob = formData.get("audio");
    const conversationHistoryStr = formData.get("conversationHistory");
    let conversationHistory = [];
    if (conversationHistoryStr) {
      try {
        conversationHistory = JSON.parse(conversationHistoryStr);
      } catch {
        conversationHistory = [];
      }
    }

    if (!audioBlob) {
      return new Response(JSON.stringify({ error: "Missing `audio`." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const groq = getGroqClient();

    // 1) speech-to-text (mirrors `scripts/speech-to-text.js` intent)
    filePath = await writeTempFileFromBlob(
      audioBlob,
      typeof audioBlob?.name === "string" ? audioBlob.name : "voice.webm"
    );

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-large-v3-turbo",
      prompt: "Specify context or spelling",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
      language: "en",
      temperature: 0.0,
    });

    const transcribedText =
      transcription?.text ||
      transcription?.segments?.map((s) => s?.text).filter(Boolean).join(" ") ||
      "";

    if (!transcribedText.trim()) {
      return Response.json({
        transcribedText: "",
        responseText: "",
        audioBase64: null,
      });
    }

    // 2) text-to-text (mirrors `scripts/text-to-text.js` intent)
    const responseText = await streamChatCompletion({
      groq,
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant named Conversa. Respond in Markdown. Be precise, authentic, and concise. Keep under ~90 words for voice playback. and don't create headings. If user talks to you in English then generate response in English. If user talks to you in urdu then generate response in urdu. If someone asks your name, say your name is Conversa. If someone asks who created you, say you were created by Rahul Jonas on 24 Feb, 2024.",
        },
        ...conversationHistory,
        { role: "user", content: transcribedText },
      ],
      temperature: 0.5,
      max_completion_tokens: 220,
      top_p: 1,
    });

    // 3) text-to-speech (mirrors `scripts/text-to-speech.js` intent)
    let audioBase64 = null;
    if (responseText.trim()) {
      const speechResponse = await groq.audio.speech.create({
        model: "canopylabs/orpheus-v1-english",
        voice: "autumn",
        input: responseText,
        response_format: "wav",
      });

      const buffer = Buffer.from(await speechResponse.arrayBuffer());
      audioBase64 = buffer.toString("base64");
    }

    return Response.json({
      transcribedText,
      responseText,
      audioBase64,
      audioMimeType: "audio/wav",
    });
  } catch (e) {
    const rawMessage = e?.message || "Server error";
    const dailyLimitMessage = getDailyLimitMessage(rawMessage);
    return new Response(JSON.stringify({ error: dailyLimitMessage || rawMessage }), {
      status: dailyLimitMessage ? 429 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    if (filePath) {
      fs.promises.unlink(filePath).catch(() => {});
    }
  }
}

