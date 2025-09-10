import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { user, pass } = await req.json();

  if (
    user === "smartmeetadmin" &&
    pass === "Smartmeet2023!"
  ) {
    (await cookies()).set("auth", "true", { httpOnly: true });
    return NextResponse.json({ ok: true });
  }

  return new NextResponse("Unauthorized", { status: 401 });
}
