"use client";

import { useSession } from "@/hooks/useSession";
import { Header } from "@/components/dashboard/Header";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { Loader2, MessageSquare } from "lucide-react";

export default function ChatPage() {
  const { loading } = useSession(true);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-purple-400" />
            AI Chat
          </h1>
          <p className="text-zinc-400 mt-1">
            Tanyakan apapun tentang data followers yang sudah di-scrape
          </p>
        </div>

        <ChatInterface />
      </main>
    </div>
  );
}
