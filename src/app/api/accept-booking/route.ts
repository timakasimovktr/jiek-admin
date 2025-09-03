import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

export async function POST(req: NextRequest) {
  try {
    const { bookingId, assignedDate } = await req.json();

    if (!bookingId || !assignedDate) {
      return NextResponse.json({ error: "bookingId и assignedDate обязательны" }, { status: 400 });
    }

    // Получаем данные заявки
    const [rows] = await pool.query(
      "SELECT visit_type, prisoner_name, created_at, relatives, telegram_chat_id FROM bookings WHERE id=?",
      [bookingId]
    );
    const bookingRows = rows as any[];
    if (bookingRows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const booking = bookingRows[0];
    const daysToAdd = booking.visit_type === "short" ? 1 : 2;

    const startDate = new Date(assignedDate);
    const startDateStr = startDate.toISOString().slice(0, 19).replace("T", " "); // YYYY-MM-DD HH:MM:SS

    // Обновляем заявку в базе
    const [result] = await pool.query(
      `UPDATE bookings 
       SET status='approved', 
           start_datetime=?, 
           end_datetime=DATE_ADD(?, INTERVAL ${daysToAdd} DAY) 
       WHERE id=?`,
      [startDateStr, startDateStr, bookingId]
    );

    const updateResult = result as any;
    if (updateResult.affectedRows === 0) {
      return NextResponse.json({ error: "Заявка не найдена или уже обработана" }, { status: 404 });
    }

    // Формируем сообщение
    const relativeName = JSON.parse(booking.relatives)[0]?.full_name || "N/A";
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysToAdd);

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

    // Отправляем сообщение в админ-группу
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: ADMIN_CHAT_ID,
      text: messageGroup
    });

    // Отправляем сообщение пользователю
    if (booking.telegram_chat_id) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: booking.telegram_chat_id,
        text: messageBot
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DB error:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
