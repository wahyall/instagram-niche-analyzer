import { NextRequest, NextResponse } from "next/server";
import { addAuthJob, getAuthJobState, generateAuthJobId } from "@/lib/queue/authQueue";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const POLL_INTERVAL = 500; // 500ms
const MAX_POLL_TIME = 60000; // 60 seconds

async function pollForResult(authJobId: string): Promise<{
  success: boolean;
  sessionId?: string;
  requires2FA?: boolean;
  authJobId?: string;
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

    if (state.status === "waiting_2fa") {
      return {
        success: false,
        requires2FA: true,
        authJobId, // Return authJobId for 2FA verification
      };
    }

    if (state.status === "failed" && state.result) {
      return {
        success: false,
        error: state.result.error || "Login failed",
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  return { success: false, error: "Login timeout - please try again" };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = loginSchema.parse(body);
    console.log(`[Login API] Login request for: ${username}`);

    // Generate auth job ID
    const authJobId = generateAuthJobId();

    // Add login job to queue
    await addAuthJob({
      authJobId,
      type: "login",
      username,
      password,
      createdAt: Date.now(),
    });

    console.log(`[Login API] Added login job: ${authJobId}`);

    // Poll for result
    const result = await pollForResult(authJobId);

    if (result.requires2FA) {
      return NextResponse.json({
        success: false,
        requires2FA: true,
        authJobId: result.authJobId,
        message: "Two-factor authentication required",
      });
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Login failed",
        },
        { status: 401 }
      );
    }

    // Set session cookie
    const response = NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      message: "Login successful",
    });

    // Set HTTP-only cookie for session
    response.cookies.set("ig_session", result.sessionId!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error("Login error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
