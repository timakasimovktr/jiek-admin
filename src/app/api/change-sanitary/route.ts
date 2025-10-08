// api/change-sanitary/route.ts

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { date, action } = await req.json();
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    if (!colony) {
      return NextResponse.json({ error: "colony cookie not found" }, { status: 400 });
    }

    if (!date || !action || (action !== "add" && action !== "remove")) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    if (action === "add") {
      await pool.query(
        "INSERT IGNORE INTO sanitary_days (date, colony) VALUES (?, ?)",
        [date, colony]
      );
    } else if (action === "remove") {
      await pool.query(
        "DELETE FROM sanitary_days WHERE date = ? AND colony = ?",
        [date, colony]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}