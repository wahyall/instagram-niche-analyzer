import { NextRequest, NextResponse } from "next/server";
import { getAuthJobState } from "@/lib/queue/authQueue";
import { z } from "zod";

const statusSchema = z.object({
  authJobId: z.string().min(1, "Auth Job ID is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { authJobId } = statusSchema.parse(body);

    const state = await getAuthJobState(authJobId);

    if (!state) {
      return NextResponse.json(
        {
          success: false,
          error: "Auth job not found or expired",
        },
        { status: 404 }
      );
    }

    // Still processing
    if (state.status === "pending" || state.status === "processing") {
      return NextResponse.json({
        success: true,
        pending: true,
        status: state.status,
        message: "Login in progress...",
      });
    }

    // Requires 2FA
    if (state.status === "waiting_2fa") {
      return NextResponse.json({
        success: false,
        requires2FA: true,
        authJobId,
        error: state.result?.error, // May contain retry error message
        message: "Two-factor authentication required",
      });
    }

    // Completed successfully
    if (state.status === "completed" && state.result?.success) {
      const response = NextResponse.json({
        success: true,
        sessionId: state.result.sessionId,
        message: "Login successful",
      });

      // Set HTTP-only cookie for session
      response.cookies.set("ig_session", state.result.sessionId!, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: "/",
      });

      return response;
    }

    // Failed
    if (state.status === "failed") {
      return NextResponse.json(
        {
          success: false,
          error: state.result?.error || "Login failed",
        },
        { status: 401 }
      );
    }

    // Unknown state
    return NextResponse.json({
      success: true,
      pending: true,
      status: state.status,
    });
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

    console.error("Status check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
