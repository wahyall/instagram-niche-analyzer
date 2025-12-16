import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chat } from "@/lib/ai/rag";
import type { ChatMessage } from "@/types";

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
});

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get("ig_session")?.value;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { messages } = chatSchema.parse(body);

    const result = await chat(messages as ChatMessage[], sessionId);

    return NextResponse.json({
      success: true,
      message: result.response,
      sources: result.sources,
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

    console.error("Chat error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
