// api/accept-booking/route.ts

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

    const startDate = new Date(assignedDate);
    startDate.setHours(0, 0, 0, 0);
    const startDateStr = startDate.toISOString().slice(0, 19).replace("T", " ");

    // Проверка на санитарные дни
    let isSanitaryFree = true;
    for (let d = 0; d < daysToAdd; d++) {
      const day = new Date(startDate);
      day.setDate(day.getDate() + d);
      const dayStr = day.toISOString().slice(0, 10);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().slice(0, 10);

      const [sanitaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM sanitary_days WHERE colony = ? AND (date = ? OR date = ?)`,
        [colony, dayStr, nextDayStr]
      );

      if (sanitaryRows[0].cnt > 0) {
        isSanitaryFree = false;
        break;
      }
    }

    if (!isSanitaryFree) {
      return NextResponse.json({ error: "Выбранные даты пересекаются с санитарными днями или днями перед ними" }, { status: 400 });
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
          "SELECT COUNT(*) as cnt FROM bookings WHERE status = 'approved' AND room_id = ? AND start_datetime <= ? AND end_datetime >= ? AND colony = ?",
          [roomId, dayEnd, dayStart, colony]
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

    const [result] = await pool.query(
      `UPDATE bookings 
       SET status = 'approved', 
           start_datetime = ?, 
           end_datetime = DATE_ADD(?, INTERVAL ? DAY),
           room_id = ?
       WHERE id = ? AND colony = ?`,
      [startDateStr, startDateStr, daysToAdd, assignedRoomId, bookingId, colony]
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