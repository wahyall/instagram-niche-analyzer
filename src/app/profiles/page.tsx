'use client';

import { useSession } from '@/hooks/useSession';
import { Header } from '@/components/dashboard/Header';
import { ProfilesList } from '@/components/profiles/ProfilesList';
import { Loader2 } from 'lucide-react';

export default function ProfilesPage() {
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Profiles</h1>
          <p className="text-zinc-400 mt-1">
            Browse dan filter profiles yang sudah di-scrape
          </p>
        </div>

        <ProfilesList />
      </main>
    </div>
  );
}

