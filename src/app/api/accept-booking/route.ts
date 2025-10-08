import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";
import { cookies } from "next/headers";

const BOT_TOKEN = "8373923696:AAHxWLeCqoO0I-ZCgNCgn6yJTi6JJ-wOU3I";

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
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    if (!bookingId || !assignedDate) {
      return NextResponse.json({ error: "bookingId и assignedDate обязательны" }, { status: 400 });
    }

    const [adminRows] = await pool.query<RowDataPacket[]>(
      `SELECT group_id FROM \`groups\` WHERE id = ?`,
      [colony]
    );
    
    if (!adminRows.length) {
      return NextResponse.json({ error: "groups jadvalida colony yo'q" }, { status: 400 });
    }

    const adminChatId = (adminRows as { group_id: string }[])[0]?.group_id;

    const [rows] = await pool.query<Booking[]>(
      "SELECT visit_type, prisoner_name, created_at, relatives, telegram_chat_id FROM bookings WHERE id = ? AND colony = ?",
      [bookingId, colony]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const booking = rows[0];
    const daysToAdd = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;

    // Проверка min date: assignedDate >= created_at + 10 дней
    const createdDate = new Date(booking.created_at);
    const minDate = new Date(createdDate);
    minDate.setDate(minDate.getDate() + 10);
    minDate.setHours(0, 0, 0, 0);
    const assigned = new Date(assignedDate);
    if (assigned < minDate) {
      return NextResponse.json({ error: "Дата посещения должна быть не ранее 10 дней после создания заявки" }, { status: 400 });
    }

    const startDate = new Date(assignedDate);
    startDate.setHours(0, 0, 0, 0);
    const startDateStr = startDate.toISOString().slice(0, 19).replace("T", " ");

    // Проверка на санитарные дни
    let isSanitaryFree = true;
    for (let d = 0; d < daysToAdd; d++) {
      const day = new Date(startDate);
      day.setDate(day.getDate() + d);
      const dayStr = day.toISOString().slice(0, 10);

      const [sanitaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM sanitary_days WHERE colony = ? AND date = ?`,
        [colony, dayStr]
      );

      if (sanitaryRows[0].cnt > 0) {
        isSanitaryFree = false;
        break;
      }
    }

    // ADDED: Проверка дня после end_datetime (если следующий день санитарный, блокируем)
    if (isSanitaryFree) {
      const endDay = new Date(startDate);
      endDay.setDate(endDay.getDate() + daysToAdd - 1);
      const nextDay = new Date(endDay);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().slice(0, 10);

      const [sanitaryNextRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM sanitary_days WHERE colony = ? AND date = ?`,
        [colony, nextDayStr]
      );

      if (sanitaryNextRows[0].cnt > 0) {
        isSanitaryFree = false;
      }
    }

    if (!isSanitaryFree) {
      return NextResponse.json({ error: "Выбранные даты пересекаются с санитарными днями" }, { status: 400 });
    }

    const [settingsRows] = await pool.query<RowDataPacket[]>(`SELECT value FROM settings WHERE \`key\` = 'rooms_count${colony}'`);
    const rooms = Number(settingsRows[0]?.value) || 10;
    let assignedRoomId: number | null = null;

    for (let roomId = 1; roomId <= rooms; roomId++) {
      let canFit = true;
      for (let d = 0; d < daysToAdd; d++) {
        const day = new Date(startDate);
        day.setDate(day.getDate() + d);
        const dayStart = day.toISOString().slice(0, 10) + " 00:00:00";
        const dayEnd = day.toISOString().slice(0, 10) + " 23:59:59";

        const [occupiedRows] = await pool.query<RowDataPacket[]>(
          `SELECT COUNT(*) as cnt FROM bookings 
           WHERE status = 'approved' 
           AND room_id = ? 
           AND colony = ? 
           AND (
             (start_datetime <= ? AND end_datetime >= ?) OR 
             (start_datetime <= ? AND end_datetime >= ?) OR 
             (start_datetime >= ? AND end_datetime <= ?)
           )`,
          [roomId, colony, dayEnd, dayStart, dayStart, dayEnd, dayStart, dayEnd]
        );

        if (occupiedRows[0].cnt > 0) {
          canFit = false;
          break;
        }
      }
      if (canFit) {
        assignedRoomId = roomId;
        break;
      }
    }

    if (!assignedRoomId) {
      return NextResponse.json({ error: "Нет доступных комнат на выбранные даты" }, { status: 400 });
    }

    // Правильный расчет end_datetime (конец последнего дня)
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysToAdd - 1);
    const endDateStr = endDate.toISOString().slice(0, 10) + " 23:59:59";

    const [result] = await pool.query(
      `UPDATE bookings 
       SET status = 'approved', 
           start_datetime = ?, 
           end_datetime = ?,
           room_id = ?
       WHERE id = ? AND colony = ?`,
      [startDateStr, endDateStr, assignedRoomId, bookingId, colony]
    );

    const updateResult = result as { affectedRows: number };
    if (updateResult.affectedRows === 0) {
      return NextResponse.json({ error: "Заявка не найдена или уже обработана" }, { status: 404 });
    }

    const relatives: Relative[] = JSON.parse(booking.relatives);
    const relativeName = relatives[0]?.full_name || "Н/Д";

    const messageGroup = `
    🎉 Ariza tasdiqlandi. Raqam: ${bookingId} 
    👤 Arizachi: ${relativeName}
    📅 Taqdim etilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
    ⌚ Kelish sanasi: ${startDate.toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
    🏛️ Koloniya: ${colony}
    🚪 Xona: ${assignedRoomId}
    🟢 Holat: Tasdiqlandi
    `;

    const messageBot = `
    🎉 Ariza tasdiqlandi. Raqam: ${bookingId} 
    👤 Arizachi: ${relativeName}
    📅 Taqdim etilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
    ⌚ Kelish sanasi: ${startDate.toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
    ⏲️ Turi: ${booking.visit_type === "long" ? "2 kunlik" : booking.visit_type === "short" ? "1 kunlik" : "3 kunlik"}
    🏛️ Koloniya: ${colony}
    🚪 Xona: ${assignedRoomId}
    🟢 Holat: Tasdiqlandi
    `;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: adminChatId,
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
    console.error("Ошибка БД:", err);
    return NextResponse.json({ error: "Ошибка БД" }, { status: 500 });
  }
}