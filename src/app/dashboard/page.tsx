"use client";

import { useState } from "react";
import { useSession } from "@/hooks/useSession";
import { Header } from "@/components/dashboard/Header";
import { ScrapeForm } from "@/components/dashboard/ScrapeForm";
import { JobsList } from "@/components/dashboard/JobsList";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const { loading } = useSession(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleJobStarted = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-zinc-400 mt-1">
            Scrape dan analisis followers Instagram
          </p>
        </div>

        <StatsCards />

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <ScrapeForm onJobStarted={handleJobStarted} />
          <JobsList refreshTrigger={refreshTrigger} />
        </div>
      </main>
    </div>
  );
}
