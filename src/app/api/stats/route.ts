import { NextRequest, NextResponse } from 'next/server';
import { getProfileStats } from '@/lib/ai/rag';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('ig_session')?.value;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const stats = await getProfileStats(sessionId);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Stats fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

