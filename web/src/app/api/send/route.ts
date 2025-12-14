import { NextResponse } from "next/server";
import { z } from "zod";
import { buildReplySubject, markAsReplied, sendReply } from "@/lib/gmail";

const payloadSchema = z.object({
  to: z.string().min(1),
  body: z.string().min(1),
  threadId: z.string().min(1),
  messageId: z.string().optional().nullable(),
  inReplyTo: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = payloadSchema.parse(json);

    await sendReply({
      to: payload.to,
      body: payload.body,
      threadId: payload.threadId,
      inReplyTo: payload.inReplyTo ?? undefined,
      references: payload.inReplyTo ?? undefined,
      subject: buildReplySubject(payload.subject ?? ""),
    });

    if (payload.messageId) {
      await markAsReplied(payload.messageId);
    }

    return NextResponse.json({ status: "sent" });
  } catch (error) {
    console.error("Failed to send reply", error);
    return NextResponse.json(
      {
        error: "Unable to send reply.",
      },
      { status: 500 }
    );
  }
}
