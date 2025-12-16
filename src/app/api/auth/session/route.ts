import { NextRequest, NextResponse } from 'next/server';
import { getSession, validateSession } from '@/lib/scraper/auth';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('ig_session')?.value;

    if (!sessionId) {
      return NextResponse.json({
        valid: false,
        error: 'No session found',
      });
    }

    const session = await getSession(sessionId);

    if (!session.valid) {
      // Clear invalid cookie
      const response = NextResponse.json({
        valid: false,
        error: 'Session expired or invalid',
      });
      response.cookies.delete('ig_session');
      return response;
    }

    return NextResponse.json({
      valid: true,
      username: session.username,
      sessionId,
    });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json(
      {
        valid: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('ig_session')?.value;

    if (!sessionId) {
      return NextResponse.json({
        valid: false,
        error: 'No session found',
      });
    }

    const isValid = await validateSession(sessionId);

    if (!isValid) {
      const response = NextResponse.json({
        valid: false,
        error: 'Session is no longer valid',
      });
      response.cookies.delete('ig_session');
      return response;
    }

    return NextResponse.json({
      valid: true,
      message: 'Session is valid',
    });
  } catch (error) {
    console.error('Session validation error:', error);
    return NextResponse.json(
      {
        valid: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

