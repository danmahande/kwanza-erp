import { NextResponse } from "next/server";
import { requireAuth } from '@/lib/auth-api'

export async function GET() {
  return NextResponse.json({ message: "Hello, world!" });
}