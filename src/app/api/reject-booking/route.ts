import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

export async function POST(req: NextRequest) {
  try {
    const { bookingId, reason } = await req.json();

    if (!bookingId || !reason) {
      return NextResponse.json({ error: "bookingId и reason обязательны" }, { status: 400 });
    }

    // Получаем данные заявки
    const [rows] = await pool.query(
      "SELECT prisoner_name, created_at, relatives, telegram_chat_id FROM bookings WHERE id=?",
      [bookingId]
    );
    type BookingRow = {
      prisoner_name: string;
      created_at: string | Date;
      relatives: string;
      telegram_chat_id?: string;
    };
    const bookingRows = rows as BookingRow[];
    if (bookingRows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const booking = bookingRows[0];

    // Обновляем заявку в базе
    const [result] = await pool.query(
      "UPDATE bookings SET status='canceled', rejection_reason=? WHERE id=?",
      [reason, bookingId]
    );

    type UpdateResult = { affectedRows: number };
    const updateResult = result as UpdateResult;

    if (updateResult.affectedRows === 0) {
      return NextResponse.json({ error: "Заявка не найдена или уже обработана" }, { status: 404 });
    }

    const message = `
❌ Ariza rad etildi. Nomer: ${bookingId} 
👤 Ma'sul xodim
📅 Berilgan sana: ${new Date(booking.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
💬 Sabab: ${reason}
🔴 Holat: Rad etilgan
`;

    // Отправляем в админ-группу
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: ADMIN_CHAT_ID,
      text: message,
    });

    // Если есть telegram_chat_id пользователя, отправляем и ему
    if (booking.telegram_chat_id) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: booking.telegram_chat_id,
        text: message,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
