"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  BarChart3,
  Lightbulb,
  Users,
  TrendingUp,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    username: string;
    relevance: number;
    snippet: string;
  }>;
}

const SUGGESTED_QUESTIONS = [
  {
    icon: BarChart3,
    text: "Apa mayoritas minat dari followers saya?",
    color: "text-blue-400",
  },
  {
    icon: TrendingUp,
    text: "Berikan persentase distribusi niche followers",
    color: "text-green-400",
  },
  {
    icon: Lightbulb,
    text: "Saran konten apa yang cocok untuk audience saya?",
    color: "text-yellow-400",
  },
  {
    icon: Users,
    text: "Siapa top 5 followers dengan followers terbanyak?",
    color: "text-purple-400",
  },
];

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Halo! 👋 Saya adalah AI assistant yang dapat menganalisis data followers Instagram Anda.

**Saya bisa membantu Anda dengan:**

📊 **Analisis Statistik**
• Distribusi minat/interest followers (dengan persentase)
• Distribusi niche followers
• Statistik followers (rata-rata, median, dll)

💡 **Saran & Insight**
• Rekomendasi konten berdasarkan audience
• Strategi untuk menjangkau audience
• Identifikasi peluang kolaborasi

🔍 **Pencarian Spesifik**
• Mencari followers dengan karakteristik tertentu
• Menemukan influencer di niche tertentu
• Analisis profile tertentu

Silakan ajukan pertanyaan atau pilih salah satu contoh di bawah!`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    await sendMessage(input);
  };

  const sendMessage = async (text: string) => {
    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setShowSuggestions(false);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message,
            sources: data.sources,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              data.error || "Maaf, terjadi kesalahan. Silakan coba lagi.",
          },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Terjadi kesalahan koneksi. Silakan coba lagi.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestionClick = (question: string) => {
    sendMessage(question);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4 pb-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              )}

              <div
                className={`max-w-[85%] ${
                  message.role === "user"
                    ? "bg-purple-600 text-white rounded-2xl rounded-tr-sm"
                    : "bg-zinc-800 text-zinc-100 rounded-2xl rounded-tl-sm"
                } px-4 py-3`}
              >
                <div className="whitespace-pre-wrap text-sm prose prose-invert prose-sm max-w-none">
                  {message.content.split("\n").map((line, i) => {
                    // Handle bold text
                    const formattedLine = line.replace(
                      /\*\*(.*?)\*\*/g,
                      "<strong>$1</strong>"
                    );
                    return (
                      <p
                        key={i}
                        className="mb-1 last:mb-0"
                        dangerouslySetInnerHTML={{ __html: formattedLine }}
                      />
                    );
                  })}
                </div>

                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-700">
                    <p className="text-xs text-zinc-400 mb-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Profile Terkait:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {message.sources.slice(0, 5).map((source) => (
                        <Badge
                          key={source.username}
                          variant="outline"
                          className="bg-zinc-700/50 border-zinc-600 text-zinc-300 text-xs"
                        >
                          @{source.username}
                          <span className="ml-1 text-zinc-500">
                            ({Math.round(source.relevance * 100)}%)
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {message.role === "user" && (
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-zinc-700 flex items-center justify-center">
                  <User className="h-4 w-4 text-zinc-300" />
                </div>
              )}
            </div>
          ))}

          {/* Suggested Questions */}
          {showSuggestions && messages.length === 1 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-zinc-500 mb-2">Contoh pertanyaan:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {SUGGESTED_QUESTIONS.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(question.text)}
                    className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 hover:border-purple-500/50 hover:bg-zinc-800 transition-all text-left group"
                  >
                    <question.icon
                      className={`h-4 w-4 ${question.color} group-hover:scale-110 transition-transform`}
                    />
                    <span className="text-sm text-zinc-300">
                      {question.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                <span className="text-sm text-zinc-400">
                  Menganalisis data...
                </span>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <Card className="mt-4 bg-zinc-800/50 border-zinc-700">
        <CardContent className="p-3">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tanyakan tentang data followers... (contoh: 'Apa mayoritas minat followers saya?')"
              className="min-h-[44px] max-h-32 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-purple-500 resize-none"
              rows={1}
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
