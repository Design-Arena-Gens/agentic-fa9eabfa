import { NextResponse } from "next/server";
import { listAndEnrich } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const messages = await listAndEnrich(20);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Failed to load mailbox", error);
    return NextResponse.json(
      {
        error: "Unable to load mailbox. Check server logs for details.",
      },
      { status: 500 }
    );
  }
}
