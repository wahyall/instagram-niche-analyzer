import { NextRequest, NextResponse } from 'next/server';
import { addAuthJob, getAuthJobState } from '@/lib/queue/authQueue';
import { z } from 'zod';

const verify2FASchema = z.object({
  authJobId: z.string().min(1, 'Auth Job ID is required'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

const POLL_INTERVAL = 500; // 500ms
const MAX_POLL_TIME = 30000; // 30 seconds for 2FA

async function pollForResult(authJobId: string): Promise<{
  success: boolean;
  sessionId?: string;
  requires2FA?: boolean;
  error?: string;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME) {
    const state = await getAuthJobState(authJobId);

    if (!state) {
      return { success: false, error: "Auth job not found" };
    }

    if (state.status === "completed" && state.result) {
      return {
        success: true,
        sessionId: state.result.sessionId,
      };
    }

    if (state.status === "waiting_2fa" && state.result?.error) {
      // 2FA failed but can retry
      return {
        success: false,
        requires2FA: true,
        error: state.result.error,
      };
    }

    if (state.status === "failed" && state.result) {
      return {
        success: false,
        error: state.result.error || "Verification failed",
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  return { success: false, error: "Verification timeout - please try again" };
}

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

    // Poll for result
    const result = await pollForResult(authJobId);

    if (result.requires2FA && result.error) {
      // 2FA failed but can retry
      return NextResponse.json(
        {
          success: false,
          requires2FA: true,
          authJobId,
          error: result.error,
        },
        { status: 401 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Verification failed',
        },
        { status: 401 }
      );
    }

    // Set session cookie
    const response = NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      message: 'Verification successful',
    });

    // Set HTTP-only cookie for session
    response.cookies.set('ig_session', result.sessionId!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
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

