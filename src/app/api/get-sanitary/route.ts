// api/get-sanitary/route.ts

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2/promise";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    if (!colony) {
      return NextResponse.json({ error: "colony cookie not found" }, { status: 400 });
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date FROM sanitary_days WHERE colony = ?",
      [colony]
    );

    return NextResponse.json(rows.map(row => ({ date: row.date })));
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}