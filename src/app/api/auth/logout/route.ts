import { NextRequest, NextResponse } from 'next/server';
import { invalidateSession } from '@/lib/scraper/auth';
import { closeScraperForSession } from '@/lib/scraper/session';

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('ig_session')?.value;

    if (sessionId) {
      // Invalidate session in database
      await invalidateSession(sessionId);
      
      // Close any active scrapers
      await closeScraperForSession(sessionId);
    }

    // Clear cookie
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
    
    response.cookies.delete('ig_session');
    
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    
    // Still clear the cookie even if there's an error
    const response = NextResponse.json({
      success: true,
      message: 'Logged out',
    });
    response.cookies.delete('ig_session');
    
    return response;
  }
}

