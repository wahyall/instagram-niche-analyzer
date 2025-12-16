'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react';

interface TwoFactorModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  onSuccess: () => void;
}

export function TwoFactorModal({ open, onClose, sessionId, onSuccess }: TwoFactorModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, code }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Verification failed');
        setLoading(false);
        return;
      }

      onSuccess();
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
            <ShieldCheck className="h-6 w-6 text-purple-400" />
          </div>
          <DialogTitle className="text-center text-xl">Two-Factor Authentication</DialogTitle>
          <DialogDescription className="text-center text-zinc-400">
            Masukkan kode 6 digit dari aplikasi authenticator Anda
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerify} className="space-y-4">
          {error && (
            <Alert variant="destructive" className="bg-red-900/50 border-red-800">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="code" className="text-zinc-300">
              Kode Verifikasi
            </Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={code}
              onChange={handleCodeChange}
              maxLength={6}
              className="bg-zinc-800 border-zinc-700 text-white text-center text-2xl tracking-widest placeholder:text-zinc-600 focus:border-purple-500 focus:ring-purple-500"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={loading || code.length !== 6}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verifikasi'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

