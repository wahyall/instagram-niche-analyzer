'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, Instagram, AlertCircle, Shield } from 'lucide-react';
import { TwoFactorModal } from './TwoFactorModal';

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [authJobId, setAuthJobId] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.requires2FA) {
        setAuthJobId(data.authJobId);
        setShow2FA(true);
        setLoading(false);
        return;
      }

      if (!data.success) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  const handle2FASuccess = () => {
    setShow2FA(false);
    router.push('/dashboard');
  };

  return (
    <>
      <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-800 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-orange-500">
            <Instagram className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">Instagram Scraper</CardTitle>
          <CardDescription className="text-zinc-400">
            Login dengan akun Instagram Anda untuk mulai scraping
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-red-900/50 border-red-800">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-zinc-300">
                Username atau Email
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-purple-500 focus:ring-purple-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-purple-500 focus:ring-purple-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-orange-500 hover:from-pink-600 hover:via-purple-600 hover:to-orange-600 text-white font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login ke Instagram'
              )}
            </Button>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <Shield className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-zinc-400">
                Credentials Anda dienkripsi dan hanya digunakan untuk scraping. 
                Kami tidak menyimpan password dalam plain text.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <TwoFactorModal
        open={show2FA}
        onClose={() => setShow2FA(false)}
        authJobId={authJobId}
        onSuccess={handle2FASuccess}
      />
    </>
  );
}

