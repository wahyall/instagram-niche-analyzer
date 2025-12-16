"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Search,
  Users,
  UserPlus,
  ImageIcon,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

interface ScrapeFormProps {
  onJobStarted?: (jobId: string) => void;
}

export function ScrapeForm({ onJobStarted }: ScrapeFormProps) {
  const [username, setUsername] = useState("");
  const [maxDepth, setMaxDepth] = useState(1);
  const [scrapeFollowers, setScrapeFollowers] = useState(true);
  const [scrapeFollowing, setScrapeFollowing] = useState(true);
  const [scrapePosts, setScrapePosts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryUsername: username.replace("@", ""),
          maxDepth,
          scrapeFollowers,
          scrapeFollowing,
          scrapePosts,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Failed to start scrape");
        setLoading(false);
        return;
      }

      setSuccess(`Started scraping @${username}`);
      setUsername("");
      onJobStarted?.(data.jobId);
    } catch (err) {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Search className="h-5 w-5 text-purple-400" />
          Start New Scrape
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Masukkan username Instagram untuk mulai scraping followers dan data
          profil
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert
              variant="destructive"
              className="bg-red-900/50 border-red-800"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-900/50 border-green-800">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-300">
                {success}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="username" className="text-zinc-300">
              Entry Point Username
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                @
              </span>
              <Input
                id="username"
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace("@", ""))}
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-purple-500 pl-8"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="depth" className="text-zinc-300">
              Chaining Depth (0-3)
            </Label>
            <Input
              id="depth"
              type="number"
              min={0}
              max={3}
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value) || 0)}
              className="bg-zinc-800 border-zinc-700 text-white focus:border-purple-500"
            />
            <p className="text-xs text-zinc-500">
              0 = hanya entry point, 1 = + followers entry point, 2 = +
              followers dari followers, dst.
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-zinc-300">Data to Scrape</Label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scrapeFollowers}
                  onChange={(e) => setScrapeFollowers(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                />
                <Users className="h-4 w-4 text-zinc-400" />
                <span className="text-sm text-zinc-300">Followers</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scrapeFollowing}
                  onChange={(e) => setScrapeFollowing(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                />
                <UserPlus className="h-4 w-4 text-zinc-400" />
                <span className="text-sm text-zinc-300">Following</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scrapePosts}
                  onChange={(e) => setScrapePosts(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                />
                <ImageIcon className="h-4 w-4 text-zinc-400" />
                <span className="text-sm text-zinc-300">Posts & Reels</span>
              </label>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || !username}
            className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-orange-500 hover:from-pink-600 hover:via-purple-600 hover:to-orange-600 text-white font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Start Scraping
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
