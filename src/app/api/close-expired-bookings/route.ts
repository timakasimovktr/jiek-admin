// api/close-expired-bookings/route.ts

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";
import { cookies } from "next/headers";
import { addDays, format, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const BOT_TOKEN = process.env.BOT_TOKEN || "8373923696:AAHxWLeCqoO0I-ZCgNCgn6yJTi6JJ-wOU3I";

interface BookingRow extends RowDataPacket {
  id: number;
  prisoner_name: string;
  created_at: string;
  end_datetime: string;
  relatives: string;
  telegram_chat_id?: string;
  colony_application_number: string;
  colony: number;
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    if (!colony) {
      return NextResponse.json({ error: "colony cookie topilmadi" }, { status: 400 });
    }

    // Определяем вчерашний день в часовом поясе Asia/Tashkent
    const timeZone = "Asia/Tashkent";
    const today = toZonedTime(new Date(), timeZone);
    const yesterday = addDays(startOfDay(today), -1);
    const yesterdayStr = format(yesterday, "yyyy-MM-dd");

    // Находим все одобренные заявки, у которых end_datetime приходится на вчера
    const [rows] = await pool.query<BookingRow[]>(
      `SELECT id, prisoner_name, created_at, end_datetime, relatives, telegram_chat_id, colony_application_number
       FROM bookings 
       WHERE status = 'approved' 
       AND colony = ? 
       AND DATE(end_datetime) = ?`,
      [colony, yesterdayStr]
    );

    if (rows.length === 0) {
      console.log("Нет завершившихся заявок для закрытия");
      return NextResponse.json({ message: "Нет завершившихся заявок" }, { status: 200 });
    }

    let closedCount = 0;
    const closedBookings: { bookingId: number }[] = [];

    for (const booking of rows) {
      // Обновляем статус на 'closed'
      const [result] = await pool.query(
        `UPDATE bookings SET status = 'closed' WHERE id = ? AND colony = ?`,
        [booking.id, colony]
      );

      const updateResult = result as { affectedRows: number };
      if (updateResult.affectedRows === 0) {
        console.warn(`Заявка ${booking.id} не обновлена (возможно, уже обработана)`);
        continue;
      }

      closedCount++;
      closedBookings.push({ bookingId: booking.id });

      // Формируем сообщение для Telegram
      let relatives: { full_name: string }[] = [];
      try {
        relatives = JSON.parse(booking.relatives);
      } catch (e) {
        console.error(`Ошибка парсинга relatives для заявки ${booking.id}:`, e);
      }
      const relativeName = relatives[0]?.full_name || "N/A";

      const message = `
🏁 Ariza yakunlandi. Raqam: ${booking.colony_application_number}
👤 Arizachi: ${relativeName}
📅 Yuborilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Tashkent",
})}
📅 Tugash sanasi: ${new Date(booking.end_datetime).toLocaleString("uz-UZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Tashkent",
})}
🏛️ Koloniya: ${booking.colony}
🟢 Holat: Yakunlandi
`;

      // Отправка уведомления пользователю
      if (booking.telegram_chat_id) {
        try {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: booking.telegram_chat_id,
            text: message,
            reply_markup: {
              keyboard: [[{ text: "Yangi ariza yuborish" }]],
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          });
          console.log(`Уведомление пользователю отправлено для заявки ${booking.id}`);
        } catch (err) {
          console.error(`Ошибка отправки уведомления пользователю для заявки ${booking.id}:`, err);
        }
      }
    }

    console.log(`Закрыто ${closedCount} заявок из ${rows.length}`);
    return NextResponse.json({ success: true, closedCount, closedBookings });
  } catch (err) {
    console.error("Ошибка БД:", err);
    return NextResponse.json({ error: "Ошибка БД" }, { status: 500 });
  }
}