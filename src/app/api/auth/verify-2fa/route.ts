import { NextRequest, NextResponse } from 'next/server';
import { verify2FA } from '@/lib/scraper/auth';
import { z } from 'zod';

const verify2FASchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, code } = verify2FASchema.parse(body);

    const result = await verify2FA(sessionId, code);

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

