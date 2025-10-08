// api/change-sanitary/route.ts

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { date, action } = await req.json();
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    console.log("Received request:", { date, action, colony }); // Отладка

    if (!colony) {
      return NextResponse.json({ error: "colony cookie not found" }, { status: 400 });
    }

    if (!date || !action || (action !== "add" && action !== "remove")) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    // Валидация формата даты (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json({ error: "Invalid date format, expected YYYY-MM-DD" }, { status: 400 });
    }

    // Проверка, что дата в будущем
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      return NextResponse.json({ error: "Date must be in the future" }, { status: 400 });
    }

    if (action === "add") {
      await pool.query(
        "INSERT IGNORE INTO sanitary_days (date, colony) VALUES (?, ?)",
        [date, colony]
      );
      console.log(`Added sanitary day: ${date} for colony ${colony}`); // Отладка
    } else if (action === "remove") {
      await pool.query(
        "DELETE FROM sanitary_days WHERE date = ? AND colony = ?",
        [date, colony]
      );
      console.log(`Removed sanitary day: ${date} for colony ${colony}`); // Отладка
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}