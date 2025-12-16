'use client';

import { useSession } from '@/hooks/useSession';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Instagram, LogOut, User, Settings } from 'lucide-react';
import Link from 'next/link';

export function Header() {
  const { username, logout } = useSession();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 via-purple-500 to-orange-500">
            <Instagram className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-white">IG Scraper</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/profiles"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Profiles
          </Link>
          <Link
            href="/jobs"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Jobs
          </Link>
          <Link
            href="/chat"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Chat
          </Link>
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8 bg-zinc-800">
                <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 text-white text-xs">
                  {username?.slice(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-zinc-900 border-zinc-800" align="end">
            <div className="flex items-center gap-2 p-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 text-white text-xs">
                  {username?.slice(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">@{username}</span>
                <span className="text-xs text-zinc-400">Instagram Account</span>
              </div>
            </div>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem className="text-zinc-300 focus:text-white focus:bg-zinc-800 cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="text-zinc-300 focus:text-white focus:bg-zinc-800 cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem
              onClick={logout}
              className="text-red-400 focus:text-red-300 focus:bg-zinc-800 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

