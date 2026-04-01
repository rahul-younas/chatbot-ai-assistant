"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, Send, Sparkles, Upload, Mic, MicOff, X } from "lucide-react";
import { ThemeToggle } from "../../components/theme-toggle";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

function safeJsonError(err) {
  if (!err) return "Something went wrong.";
  if (typeof err === "string") return err;
  return err?.message || "Something went wrong.";
}

export default function ChatApp() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const cancelVoiceRef = useRef(false);
  const voiceLoopOnRef = useRef(false);

  // Mode toggles (stay ON until user turns them OFF).
  const [reasoningOn, setReasoningOn] = useState(false);
  const [webSearchOn, setWebSearchOn] = useState(false);

  // Continuous voice chat loop:
  // - Start button enables the loop.
  // - App keeps listening and stops only after silence.
  // - Stop button disables the loop.
  const [voiceLoopOn, setVoiceLoopOn] = useState(false);

  const vadRafRef = useRef(null);
  const speechDetectedRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const stoppingBySilenceRef = useRef(false);
  const vadAudioContextRef = useRef(null);
  const vadStreamSourceRef = useRef(null);
  const vadAnalyserRef = useRef(null);

  const voiceAbortRef = useRef(null);
  const voiceProcessingRef = useRef(false);
  const recordingActiveRef = useRef(false);
  const voiceTurnIdRef = useRef(0);

  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null);

  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isGenerating]);

  useEffect(() => {
    function onKeyDown(e) {
      // Keyboard shortcut: Alt+V toggles voice chat.
      if (e.altKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        toggleVoice();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    // If the user starts typing, stop voice capture.
    // (Requirement: voice is togglable with keyboard typing.)
    return;
  }, [isRecording]);

  const userCanSend = useMemo(() => input.trim().length > 0 && !isGenerating, [input, isGenerating]);

  function newChat() {
    abortRef.current?.abort?.();
    abortRef.current = null;

    stopVoiceLoop();
    audioPlayerRef.current?.pause?.();
    audioPlayerRef.current = null;
    setError("");
    setMessages([]);
    setInput("");
    setReasoningOn(false);
    setWebSearchOn(false);
    setVoiceLoopOn(false);
  }

  function addMessage(role, content, imageUrl = null) {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    setMessages((prev) => [...prev, { id, role, content, imageUrl }]);
    return id;
  }

  function updateMessage(id, content) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content } : m)));
  }

  function removeMessage(id) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  async function callJsonEndpoint(url, payload, { signal } = {}) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.error || "";
      } catch {
        // ignore
      }
      throw new Error(detail || `Request failed (${res.status})`);
    }

    return res.json();
  }

  async function callFormEndpoint(url, formData, { signal } = {}) {
    const res = await fetch(url, {
      method: "POST",
      body: formData,
      signal,
    });

    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.error || "";
      } catch {
        // ignore
      }
      throw new Error(detail || `Request failed (${res.status})`);
    }

    return res.json();
  }

  async function handleText(mode, promptOverride) {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt) return;

    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    setError("");
    setIsGenerating(true);

    const userId = addMessage("user", prompt);
    const assistantId = addMessage("assistant", "");
    updateMessage(
      assistantId,
      mode === "reasoning" ? "Thinking with reasoning..." : "Thinking..."
    );

    try {
      const endpoint =
        mode === "reasoning"
          ? "/api/groq/chat/reasoning"
          : "/api/groq/chat/text-to-text";

      const data = await callJsonEndpoint(
        endpoint,
        { prompt },
        { signal: controller.signal }
      );

      updateMessage(assistantId, data?.text || "");
      // If there are no messages yet (rare), keep variable referenced.
      void userId;
      setInput("");
    } catch (e) {
      if (e?.name === "AbortError") return;
      updateMessage(assistantId, "");
      setError(safeJsonError(e));
    } finally {
      setIsGenerating(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function handleWebSearch(queryOverride) {
    const query = (queryOverride ?? input).trim();
    if (!query) {
      setError("Type a query first for web search.");
      return;
    }

    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    setError("");
    setIsGenerating(true);

    addMessage("user", query);
    const assistantId = addMessage("assistant", "Searching the web...");
    try {
      const data = await callJsonEndpoint(
        "/api/groq/chat/web-search",
        { query, includeReasoning: reasoningOn },
        { signal: controller.signal }
      );
      const text = data?.text || "";
      const searchResults = data?.searchResults;

      let extra = "";
      if (Array.isArray(searchResults) && searchResults.length > 0) {
        const top = searchResults.slice(0, 5);
        extra =
          "\n\n## Sources\n" +
          top
            .map((r) => {
              const title = r?.title || r?.url || "Source";
              const url = r?.url;
              return url ? `- [${title}](${url})` : `- ${title}`;
            })
            .join("\n");
      }

      updateMessage(assistantId, text + extra);
      setInput("");
    } catch (e) {
      if (e?.name === "AbortError") return;
      updateMessage(assistantId, "");
      setError(safeJsonError(e));
    } finally {
      setIsGenerating(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt) return;

    // Web Search overrides reasoning if both are enabled.
    if (webSearchOn) return handleWebSearch(prompt);
    if (reasoningOn) return handleText("reasoning", prompt);
    return handleText("text", prompt);
  }

  function pickImage() {
    setError("");
    fileInputRef.current?.click?.();
  }

  async function handleImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Image is too large. Please use a file under 4MB.");
      return;
    }

    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    setError("");
    setIsGenerating(true);

    const prompt = input.trim() ? input.trim() : "What's in this image?";
    const displayPrompt = input.trim(); // Only show what user typed, or nothing if empty
    
    // Create local object URL for the image
    const imageUrl = URL.createObjectURL(file);
    
    addMessage("user", displayPrompt, imageUrl);
    const assistantId = addMessage("assistant", "Analyzing image...");

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("prompt", prompt);

      const data = await callFormEndpoint(
        "/api/groq/chat/image-to-text",
        formData,
        { signal: controller.signal }
      );

      updateMessage(assistantId, data?.text || "");
      setInput("");
    } catch (e) {
      if (e?.name === "AbortError") return;
      updateMessage(assistantId, "");
      setError(safeJsonError(e));
    } finally {
      setIsGenerating(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function startVoiceTurn() {
    // Initializes a continuous voice session:
    // - VAD watches microphone all the time.
    // - MediaRecorder captures only while you are speaking.
    // - When silence is detected, we transcribe -> respond -> speak.
    // - If you speak while audio is playing, we stop the audio immediately.
    setError("");
    if (!voiceLoopOnRef.current) return;
    if (vadRafRef.current) return; // already running

    try {
      cancelVoiceRef.current = false;
      speechDetectedRef.current = false;
      lastSpeechAtRef.current = Date.now();
      stoppingBySilenceRef.current = false;
      voiceProcessingRef.current = false;
      recordingActiveRef.current = false;

      // Stop any previous playback.
      audioPlayerRef.current?.pause?.();
      audioPlayerRef.current = null;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      // --- VAD (voice activity detection) ---
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      vadAudioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      vadStreamSourceRef.current = source;

      const analyser = audioContext.createAnalyser();
      vadAnalyserRef.current = analyser;
      analyser.fftSize = 2048;
      source.connect(analyser);

      const timeData = new Uint8Array(analyser.fftSize);

      const VAD_THRESHOLD = 20; // higher = less sensitive to ignore background noise
      const SILENCE_MS = 600; // slightly longer to avoid cutting off mid-sentence

      function rmsEstimate() {
        analyser.getByteTimeDomainData(timeData);
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] - 128;
          sumSq += v * v;
        }
        const meanSq = sumSq / timeData.length;
        return Math.sqrt(meanSq);
      }

      function startRecordingSegment() {
        const r = mediaRecorderRef.current;
        if (!r) return;
        if (r.state === "recording") return;
        // Reset buffer for this segment.
        audioChunksRef.current = [];
        try {
          // timeslice gives faster ondataavailable on some browsers
          r.start(250);
        } catch {
          try {
            r.start();
          } catch {
            // ignore
          }
        }
        recordingActiveRef.current = true;
        setIsRecording(true);
      }

      function stopRecordingSegment() {
        const r = mediaRecorderRef.current;
        if (!r) return;
        if (r.state !== "recording") return;
        stoppingBySilenceRef.current = true;
        try {
          r.stop();
        } catch {
          // ignore
        }
      }

      // --- MediaRecorder ---
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      const mimeType =
        mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        recordingActiveRef.current = false;
        stoppingBySilenceRef.current = false;
        setIsRecording(false);

        const chunks = audioChunksRef.current.slice();
        audioChunksRef.current = [];

        const mime = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(chunks, { type: mime });
        if (!audioBlob.size) return;

        if (cancelVoiceRef.current || !voiceLoopOnRef.current) {
          cancelVoiceRef.current = false;
          return;
        }

        // Mark this turn so we can ignore stale results.
        const turnId = ++voiceTurnIdRef.current;

        voiceProcessingRef.current = true;
        setIsGenerating(true);

        // Abort any in-flight voice processing, then set a fresh one.
        voiceAbortRef.current?.abort?.();
        const controller = new AbortController();
        voiceAbortRef.current = controller;

        const assistantId = addMessage("assistant", "Thinking...");

        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "voice.webm");

          const data = await callFormEndpoint(
            "/api/groq/chat/voice-chat",
            formData,
            { signal: controller.signal }
          );

          // Ignore if a newer turn has started.
          if (turnId !== voiceTurnIdRef.current) return;
          if (!voiceLoopOnRef.current) return;

          const transcription = data?.transcribedText || "";
          const responseText = data?.responseText || "";

          // Remove the temporary thinking message
          removeMessage(assistantId);

          if (!transcription) {
            // It was just noise, no text detected
            return;
          }

          addMessage("user", transcription);
          addMessage("assistant", responseText);
          setInput("");

          if (data?.audioBase64) {
            const audioMimeType = data?.audioMimeType || "audio/wav";
            const audioBlob2 = base64ToBlob(data.audioBase64, audioMimeType);
            const url = URL.createObjectURL(audioBlob2);

            audioPlayerRef.current?.pause?.();
            audioPlayerRef.current = new Audio(url);
            try {
              await audioPlayerRef.current.play();
            } catch {
              // Autoplay can fail; text response is still shown.
            }
          }
        } catch (e) {
          if (e?.name === "AbortError" || cancelVoiceRef.current) {
            removeMessage(assistantId);
            return;
          }
          
          removeMessage(assistantId);
          
          // Ignore the specific transcription error for noise
          const errMsg = safeJsonError(e);
          // Also ignore "input is required" which happens when aborting speech synthesis
          if (errMsg !== "Could not transcribe the audio." && !errMsg.includes("input is required")) {
            setError(errMsg);
          }
        } finally {
          if (turnId === voiceTurnIdRef.current) {
            voiceProcessingRef.current = false;
            setIsGenerating(false);
          }
          if (voiceAbortRef.current === controller) {
            voiceAbortRef.current = null;
          }
        }
      };

      // Start VAD monitoring immediately; recorder starts only when you speak.
      vadRafRef.current = requestAnimationFrame(function tick() {
        if (!voiceLoopOnRef.current) return;

        const rms = rmsEstimate();
        const audioPlaying =
          audioPlayerRef.current && !audioPlayerRef.current.paused;

        if (rms > VAD_THRESHOLD) {
          speechDetectedRef.current = true;
          lastSpeechAtRef.current = Date.now();

          // If the assistant is speaking and you start talking, stop audio instantly.
          if (audioPlaying) {
            try {
              audioPlayerRef.current.pause();
            } catch {
              // ignore
            }
            audioPlayerRef.current = null;
          }

          // If we were processing a response, abort it so we can react fast.
          if (voiceProcessingRef.current) {
            voiceAbortRef.current?.abort?.();
          }

          if (!recordingActiveRef.current) {
            startRecordingSegment();
          }
        } else {
          // Stop current recording when silence is long enough.
          if (recordingActiveRef.current) {
            const silenceFor = Date.now() - lastSpeechAtRef.current;
            if (silenceFor > SILENCE_MS && !stoppingBySilenceRef.current) {
              stopRecordingSegment();
            }
          }
        }

        vadRafRef.current = requestAnimationFrame(tick);
      });
    } catch (e) {
      voiceLoopOnRef.current = false;
      setVoiceLoopOn(false);
      setIsRecording(false);
      setIsGenerating(false);
      setError(
        e?.message ||
          "Microphone permission denied or unavailable. Please check your browser settings."
      );
    }
  }

  function stopVoiceLoop() {
    voiceLoopOnRef.current = false;
    setVoiceLoopOn(false);

    // Cancel any ongoing turn processing.
    cancelVoiceRef.current = true;
    voiceAbortRef.current?.abort?.();
    voiceAbortRef.current = null;
    voiceProcessingRef.current = false;

    // Stop playback instantly.
    audioPlayerRef.current?.pause?.();
    audioPlayerRef.current = null;

    // Stop recorder if active.
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // ignore
    }

    // Stop VAD.
    try {
      if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
    } catch {
      // ignore
    }
    vadRafRef.current = null;
    stoppingBySilenceRef.current = false;

    // Cleanup stream + audio context.
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    } catch {
      // ignore
    }
    try {
      if (vadAudioContextRef.current) vadAudioContextRef.current.close();
    } catch {
      // ignore
    }
    vadAudioContextRef.current = null;
    vadAnalyserRef.current = null;
    vadStreamSourceRef.current = null;

    setIsRecording(false);
    setIsGenerating(false);
  }

  function cancelCurrentVoiceTurn() {
    // Used when the user starts typing/presses Enter.
    cancelVoiceRef.current = true;
    voiceAbortRef.current?.abort?.();
    voiceAbortRef.current = null;
    voiceProcessingRef.current = false;

    try {
      audioPlayerRef.current?.pause?.();
    } catch {
      // ignore
    }
    audioPlayerRef.current = null;

    // This triggers recorder.onstop; onstop will ignore due to cancelVoiceRef.
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // ignore
    }
  }

  function toggleVoice() {
    if (voiceLoopOnRef.current) {
      stopVoiceLoop();
      return;
    }
    voiceLoopOnRef.current = true;
    setVoiceLoopOn(true);
    startVoiceTurn();
  }

  function onTextareaChange(e) {
    const next = e.target.value;
    setInput(next);
    if (voiceLoopOnRef.current) cancelCurrentVoiceTurn();
  }

  function onTextareaKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isGenerating) return;
      if (voiceLoopOnRef.current) cancelCurrentVoiceTurn();
      handleSend();
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground selection:bg-primary/20">
      {/* Subtle Background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Conversa</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>by Rahul Jonas</span>
              {(reasoningOn || webSearchOn) && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    {reasoningOn && <span className="text-primary">Reasoning</span>}
                    {reasoningOn && webSearchOn && <span>&</span>}
                    {webSearchOn && <span className="text-accent-foreground">Web Search</span>}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-2 rounded-full"
            onClick={newChat}
            disabled={isGenerating || isRecording}
            aria-label="Start new chat"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="relative z-0 flex flex-1 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 pt-6 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.length === 0 && !voiceLoopOn ? (
              <div className="flex h-[60vh] flex-col items-center justify-center space-y-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 shadow-sm">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">How can I help you today?</h2>
                  <p className="max-w-sm text-muted-foreground">
                    Upload an image, search the web, or just start talking.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user"
                        ? "flex w-full flex-col items-end gap-2"
                        : "flex w-full flex-col items-start gap-2"
                    }
                  >
                    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                      {m.role === "user" ? (
                        <>
                          <span>You</span>
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                            <Send className="h-3 w-3 text-primary" />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary">
                            <Sparkles className="h-3 w-3 text-secondary-foreground" />
                          </div>
                          <span>Assistant</span>
                        </>
                      )}
                    </div>
                    
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] rounded-3xl rounded-tr-sm bg-primary px-5 py-3.5 text-primary-foreground sm:max-w-[75%] shadow-sm"
                          : "max-w-[95%] rounded-3xl rounded-tl-sm bg-muted/50 px-5 py-3.5 text-foreground sm:max-w-[85%] border border-border/50 shadow-sm"
                      }
                    >
                      {m.imageUrl && (
                        <div className="mb-2">
                          <img 
                            src={m.imageUrl} 
                            alt="Uploaded" 
                            className="max-h-60 w-auto rounded-xl object-contain shadow-sm border border-primary/20 bg-background/50"
                          />
                        </div>
                      )}
                      
                      {m.content ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ node, ...props }) => <p className="leading-relaxed mb-3 last:mb-0" {...props} />,
                            h1: ({ node, ...props }) => <h1 className="mt-5 mb-3 text-2xl font-semibold tracking-tight" {...props} />,
                            h2: ({ node, ...props }) => <h2 className="mt-5 mb-3 text-xl font-semibold tracking-tight" {...props} />,
                            h3: ({ node, ...props }) => <h3 className="mt-4 mb-2 text-lg font-semibold tracking-tight" {...props} />,
                            hr: ({ node, ...props }) => <hr className="my-5 border-border/60" {...props} />,
                            table: ({ node, ...props }) => (
                              <div className="my-4 overflow-x-auto rounded-lg border border-border/50">
                                <table className="w-full border-collapse text-sm" {...props} />
                              </div>
                            ),
                            th: ({ node, ...props }) => <th className="border-b border-border/50 bg-muted/50 px-4 py-2.5 text-left font-medium" {...props} />,
                            td: ({ node, ...props }) => <td className="border-b border-border/50 px-4 py-2.5 last:border-0" {...props} />,
                            a: ({ node, ...props }) => <a className="font-medium underline underline-offset-4 hover:text-primary transition-colors" target="_blank" rel="noreferrer" {...props} />,
                            ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1.5 last:mb-0" {...props} />,
                            ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1.5 last:mb-0" {...props} />,
                            blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-primary/50 bg-muted/30 py-2 pr-4 pl-4 italic text-muted-foreground my-4 rounded-r-lg" {...props} />,
                            pre: ({ node, ...props }) => <pre className="my-4 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-zinc-50 dark:bg-zinc-900 border border-border/20 shadow-sm" {...props} />,
                            code: ({ node, className, ...props }) => {
                              const match = /language-(\w+)/.exec(className || '');
                              return match ? (
                                <code className={`font-mono text-sm ${className}`} {...props} />
                              ) : (
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm" {...props} />
                              );
                            },
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      ) : m.role === "assistant" ? (
                        <div className="flex items-center h-6">
                          <span className="flex gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {voiceLoopOn && !isGenerating && (
                  <div className="flex w-full flex-col items-start gap-2">
                    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary">
                        <Mic className="h-3 w-3 text-secondary-foreground animate-pulse" />
                      </div>
                      <span>Assistant</span>
                    </div>
                    <div className="max-w-[95%] rounded-3xl rounded-tl-sm bg-muted/50 px-5 py-3.5 text-foreground sm:max-w-[85%] border border-border/50 shadow-sm">
                      <span className="text-muted-foreground italic">Listening...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {isGenerating && messages.length > 0 && !messages[messages.length - 1].content && (
              <div className="h-4"></div>
            )}
          </div>
        </div>
      </main>

      {/* Input Area */}
      <div className="shrink-0 bg-background pb-4 pt-2 sm:pb-6">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm">
              <div className="flex-1">{error}</div>
              <button 
                onClick={() => setError("")}
                className="ml-3 shrink-0 rounded-full p-1 opacity-70 hover:bg-destructive/20 hover:opacity-100 transition-all"
                aria-label="Close error message"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          
          <div className="relative flex flex-col overflow-hidden rounded-3xl border border-border/50 bg-background/60 backdrop-blur-xl shadow-lg transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 focus-within:shadow-primary/5">
            <Textarea
              value={input}
              onChange={onTextareaChange}
              onKeyDown={onTextareaKeyDown}
              placeholder="Ask anything..."
              className="min-h-[60px] max-h-[200px] w-full resize-none border-0 bg-transparent px-5 py-4 text-base focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none sm:text-sm"
              rows={1}
              disabled={isGenerating}
            />
            
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant={reasoningOn ? "secondary" : "ghost"}
                  size="sm"
                  className={`h-8 rounded-full px-3 text-xs font-medium transition-colors ${reasoningOn ? "bg-primary/10 text-primary hover:bg-primary/20" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => {
                    if (isGenerating || isRecording) return;
                    setReasoningOn((v) => !v);
                  }}
                  disabled={isGenerating || isRecording}
                  aria-label="Toggle reasoning mode"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Reasoning
                </Button>
                
                <Button
                  variant={webSearchOn ? "secondary" : "ghost"}
                  size="sm"
                  className={`h-8 rounded-full px-3 text-xs font-medium transition-colors ${webSearchOn ? "bg-accent/20 text-accent-foreground hover:bg-accent/30" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => {
                    if (isGenerating || isRecording) return;
                    setWebSearchOn((v) => !v);
                  }}
                  disabled={isGenerating || isRecording}
                  aria-label="Toggle web search mode"
                >
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  Web
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageFile(e.target.files?.[0])}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={pickImage}
                  disabled={isGenerating || isRecording}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Image
                </Button>

                <Button
                  variant={voiceLoopOn ? "destructive" : "ghost"}
                  size="sm"
                  className={`h-8 rounded-full px-3 text-xs font-medium transition-colors ${voiceLoopOn ? "" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={toggleVoice}
                  disabled={false}
                  aria-label="Toggle voice chat"
                >
                  {voiceLoopOn ? <MicOff className="mr-1.5 h-3.5 w-3.5" /> : <Mic className="mr-1.5 h-3.5 w-3.5" />}
                  {voiceLoopOn ? "Stop Voice" : "Voice"}
                </Button>
              </div>
              
              <Button
                size="icon"
                className={`h-8 w-8 shrink-0 rounded-full transition-all sm:h-9 sm:w-9 ${userCanSend ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:scale-105" : "bg-muted text-muted-foreground opacity-50"}`}
                onClick={handleSend}
                disabled={!userCanSend}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-3 text-center text-xs text-muted-foreground/70">
            AI can make mistakes. Please verify important information.
          </div>
        </div>
      </div>
    </div>
  );
}

