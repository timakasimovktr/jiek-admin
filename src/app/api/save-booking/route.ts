// api/save-booking/route.ts

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

interface BookingRow extends RowDataPacket {
  visit_type: string;
  prisoner_name: string;
  created_at: string;
  relatives: string;
  telegram_chat_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { bookingId, approvedDays } = await req.json();

    if (!bookingId || !approvedDays) {
      return NextResponse.json({ error: "bookingId и approvedDays обязательны" }, { status: 400 });
    }

    const [rows] = await pool.query<BookingRow[]>(
      "SELECT visit_type, prisoner_name, created_at, relatives, telegram_chat_id FROM bookings WHERE id = ?",
      [bookingId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const visitTypeMap: Record<number, string> = {
      1: "short",
      2: "long",
      3: "extra",
    };

    const visitType = visitTypeMap[approvedDays];
    if (!visitType) {
      return NextResponse.json({ error: `Неверное количество дней: ${approvedDays}` }, { status: 400 });
    }

    await pool.query(
      "UPDATE bookings SET visit_type = ? WHERE id = ?",
      [visitType, bookingId]
    );

    const relatives: Relative[] = JSON.parse(rows[0].relatives);
    const relativeName = relatives[0]?.full_name || "N/A";

    const messageGroup = `
📝 Ariza yangilandi. Nomer: ${bookingId} 
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${new Date(rows[0].created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
⏲️ Yangi tur: ${approvedDays}-kunlik
🟡 Holat: Yangilangan
`;

    const messageBot = `
📝 Sizning arizangiz №${bookingId} yangilandi. Tasdiqlangan kunlar: ${approvedDays}
`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: ADMIN_CHAT_ID,
      text: messageGroup,
    });

    if (rows[0].telegram_chat_id) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: rows[0].telegram_chat_id,
        text: messageBot,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при сохранении заявки:", error);
    return NextResponse.json({ success: false, error: "Ошибка при сохранении заявки" }, { status: 500 });
  }
}