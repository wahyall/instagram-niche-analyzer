import { NextRequest, NextResponse } from "next/server";
import { loginToInstagram } from "@/lib/scraper/auth";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = loginSchema.parse(body);
    console.log({ username, password });

    const result = await loginToInstagram(username, password);
    console.log({ result });

    if (result.requires2FA) {
      return NextResponse.json({
        success: false,
        requires2FA: true,
        sessionId: result.sessionId, // Temporary session ID for 2FA
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
