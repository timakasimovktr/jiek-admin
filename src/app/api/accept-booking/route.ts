// api/accept-booking/route.ts

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";

const BOT_TOKEN = "8327319465:AAEdZDOtad6b6nQ-xN9hyabfv2CmQlIQCEo";
const ADMIN_CHAT_ID = "-1003014693175";

interface Relative {
  full_name: string;
  passport: string;
}

interface Booking extends RowDataPacket {
  visit_type: "short" | "long" | "extra";
  prisoner_name: string;
  created_at: string;
  relatives: string;
  telegram_chat_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { bookingId, assignedDate } = await req.json();

    if (!bookingId || !assignedDate) {
      return NextResponse.json({ error: "bookingId и assignedDate обязательны" }, { status: 400 });
    }

    const [rows] = await pool.query<Booking[]>(
      "SELECT visit_type, prisoner_name, created_at, relatives, telegram_chat_id FROM bookings WHERE id = ?",
      [bookingId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const booking = rows[0];
    const daysToAdd = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;

    const startDate = new Date(assignedDate);
    const startDateStr = startDate.toISOString().slice(0, 19).replace("T", " ");

    const [result] = await pool.query(
      `UPDATE bookings 
       SET status = 'approved', 
           start_datetime = ?, 
           end_datetime = DATE_ADD(?, INTERVAL ? DAY) 
       WHERE id = ?`,
      [startDateStr, startDateStr, daysToAdd, bookingId]
    );

    const updateResult = result as { affectedRows: number };
    if (updateResult.affectedRows === 0) {
      return NextResponse.json({ error: "Заявка не найдена или уже обработана" }, { status: 404 });
    }

    const relatives: Relative[] = JSON.parse(booking.relatives);
    const relativeName = relatives[0]?.full_name || "N/A";

    const messageGroup = `
🎉 Ariza tasdiqlangan. Nomer: ${bookingId} 
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${new Date(booking.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
⌚ Kelishi sana: ${startDate.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
🟢 Holat: Tasdiqlangan
`;

    const messageBot = `
🎉 Ariza tasdiqlangan. Nomer: ${bookingId} 
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${new Date(booking.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
⌚ Kelishi sana: ${startDate.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
⏲️ Turi: ${booking.visit_type === "long" ? "2-kunlik" : booking.visit_type === "short" ? "1-kunlik" : "3-kunlik"}
🟢 Holat: Tasdiqlangan
`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: ADMIN_CHAT_ID,
      text: messageGroup,
    });

    if (booking.telegram_chat_id) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: booking.telegram_chat_id,
        text: messageBot,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}