// api/reject-booking/route.ts

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";

const BOT_TOKEN = "8373923696:AAHxWLeCqoO0I-ZCgNCgn6yJTi6JJ-wOU3I";
const ADMIN_CHAT_ID = "-1003014693175";

interface BookingRow extends RowDataPacket {
  prisoner_name: string;
  created_at: string;
  relatives: string;
  telegram_chat_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { bookingId, reason } = await req.json();

    if (!bookingId || !reason) {
      return NextResponse.json({ error: "bookingId и reason обязательны" }, { status: 400 });
    }

    const [rows] = await pool.query<BookingRow[]>(
      "SELECT prisoner_name, created_at, relatives, telegram_chat_id FROM bookings WHERE id = ?",
      [bookingId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const booking = rows[0];

    const [result] = await pool.query(
      "UPDATE bookings SET status = 'canceled', rejection_reason = ? WHERE id = ?",
      [reason, bookingId]
    );

    const updateResult = result as { affectedRows: number };
    if (updateResult.affectedRows === 0) {
      return NextResponse.json({ error: "Заявка не найдена или уже обработана" }, { status: 404 });
    }

    const message = `
    ❌ Ariza rad etildi. Raqam: ${bookingId} 
    👤 Mas'ul xodim
    📅 Berilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
    💬 Sabab: ${reason}
    🔴 Holat: Rad etilgan
    `;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: ADMIN_CHAT_ID,
      text: message,
    });

    if (booking.telegram_chat_id) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: booking.telegram_chat_id,
        text: message,
        reply_markup: {
          keyboard: [
            [{ text: "Yangi ariza yuborish" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}