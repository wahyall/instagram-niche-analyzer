import { NextRequest, NextResponse } from "next/server";
import { addAuthJob, getAuthJobState, generateAuthJobId } from "@/lib/queue/authQueue";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

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

    // Return immediately with authJobId - frontend will poll for result
    return NextResponse.json({
      success: true,
      pending: true,
      authJobId,
      message: "Login job queued. Poll /api/auth/status for result.",
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
