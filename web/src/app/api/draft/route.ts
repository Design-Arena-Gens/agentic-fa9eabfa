import { NextResponse } from "next/server";
import { z } from "zod";
import { generateDraft } from "@/lib/openai";
import { buildReplySubject } from "@/lib/gmail";
import { loadServerEnv } from "@/lib/env";

const payloadSchema = z.object({
  messageId: z.string().min(1),
  threadId: z.string().min(1),
  subject: z.string().optional().nullable(),
  from: z.string().min(1),
  bodyText: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = payloadSchema.parse(json);
    const env = loadServerEnv();

    const draft = await generateDraft({
      subject: payload.subject ?? "",
      from: payload.from,
      to: env.GOOGLE_SENDER_EMAIL,
      body: payload.bodyText,
    });

    return NextResponse.json({
      draft,
      recommendedSubject: buildReplySubject(payload.subject ?? ""),
    });
  } catch (error) {
    console.error("Failed to draft reply", error);
    return NextResponse.json(
      {
        error: "Unable to generate reply draft.",
      },
      { status: 500 }
    );
  }
}
