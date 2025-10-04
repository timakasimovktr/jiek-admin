// api/bookings/route.ts
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    if (!colony) {
      return NextResponse.json(
        { error: "Colony not found in cookies" },
        { status: 400 }
      );
    }

    // используем плейсхолдеры, чтобы не было SQL injection
    const [rows] = await pool.query(
      `SELECT * FROM bookings 
       WHERE relatives != '[]' 
       AND status != 'canceled' 
       AND colony = ? 
       ORDER BY id DESC`,
      [colony]
    );

    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
