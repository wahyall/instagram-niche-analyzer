import { NextRequest, NextResponse } from 'next/server';
import { addAuthJob } from '@/lib/queue/authQueue';
import { z } from 'zod';

const verify2FASchema = z.object({
  authJobId: z.string().min(1, 'Auth Job ID is required'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { authJobId, code } = verify2FASchema.parse(body);

    console.log(`[2FA API] Verification request for job: ${authJobId}`);

    // Add 2FA verification job to queue
    await addAuthJob({
      authJobId,
      type: "verify-2fa",
      username: "", // Not needed for 2FA
      code,
      createdAt: Date.now(),
    });

    // Return immediately - frontend will poll /api/auth/status for result
    return NextResponse.json({
      success: true,
      pending: true,
      authJobId,
      message: "2FA verification queued. Poll /api/auth/status for result.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error('2FA verification error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

