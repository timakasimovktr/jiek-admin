import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket, OkPacket } from "mysql2/promise";
import { cookies } from "next/headers";

const BOT_TOKEN = "8373923696:AAHxWLeCqoO0I-ZCgNCgn6yJTi6JJ-wOU3I";
// const ADMIN_CHAT_ID = "-1003014693175";

interface Relative {
  full_name: string;
  passport: string;
}

interface Booking extends RowDataPacket {
  id: number;
  visit_type: "short" | "long" | "extra";
  prisoner_name: string;
  created_at: string;
  relatives: string;
  telegram_chat_id?: string;
  colony: number;
}

interface CountRow extends RowDataPacket {
  cnt: number;
}

export async function POST(req: NextRequest) {
  try {
    const { bookingId, assignedDate } = await req.json();
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    if (!bookingId || !assignedDate) {
      return NextResponse.json({ error: "bookingId и assignedDate обязательны" }, { status: 400 });
    }

    if (!colony) {
      return NextResponse.json({ error: "colony cookie topilmadi" }, { status: 400 });
    }

    // Очистка завершенных встреч: удаление approved bookings, чья end_datetime < сегодняшнего дня 00:00:00 по Ташкенту
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' });
    const todayStr = formatter.format(now);
    const todayStartStr = `${todayStr} 00:00:00`;

    console.log("Cleanup date threshold:", todayStartStr); // Лог: порог для очистки

    const [deleteResult] = await pool.query<OkPacket[]>(
      `DELETE FROM bookings WHERE status = 'approved' AND colony = ? AND end_datetime < ?`,
      [colony, todayStartStr]
    );

    const deletedCount = deleteResult[0].affectedRows || 0;
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} completed bookings`);
    }

    const [adminRows] = await pool.query<RowDataPacket[]>(
      `SELECT group_id FROM \`groups\` WHERE id = ?`,
      [+colony]
    );
    
    if (!adminRows.length) {
      return NextResponse.json({ error: "groups jadvalida colony yo'q" }, { status: 400 });
    }

    const adminChatId = (adminRows as { group_id: string }[])[0]?.group_id;

    const [rows] = await pool.query<Booking[]>(
      "SELECT id, visit_type, prisoner_name, created_at, relatives, telegram_chat_id, colony FROM bookings WHERE id = ? AND colony = ?",
      [bookingId, colony]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const booking = rows[0];
    const daysToAdd = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;

    const startDate = new Date(assignedDate);
    startDate.setHours(0, 0, 0, 0);
    const startDateStr = startDate.toISOString().slice(0, 10) + " 00:00:00";

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

        const [occupiedRows] = await pool.query<CountRow[]>(
          "SELECT COUNT(*) as cnt FROM bookings WHERE status = 'approved' AND colony = ? AND room_id = ? AND ((start_datetime <= ? AND end_datetime >= ?) OR (start_datetime <= ? AND end_datetime >= ?) OR (start_datetime >= ? AND end_datetime <= ?))",
          [colony, roomId, dayEnd, dayStart, dayStart, dayEnd, dayStart, dayEnd]
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

    let relatives: Relative[] = [];
    try {
      relatives = JSON.parse(booking.relatives);
    } catch (e) {
      console.error(`Failed to parse relatives for booking ${bookingId}:`, e);
    }
    const relativeName = relatives[0]?.full_name || "Н/Д";

    const messageGroup = `
    🎉 Ariza tasdiqlandi. Raqam: ${bookingId} 
    👤 Arizachi: ${relativeName}
    📅 Taqdim etilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
    ⌚ Kelish sanasi: ${startDate.toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
    🏛️ Koloniya: ${booking.colony}
    🚪 Xona: ${assignedRoomId}
    🟢 Holat: Tasdiqlandi
    `;

    const messageBot = `
    🎉 Ariza tasdiqlandi. Raqam: ${bookingId} 
    👤 Arizachi: ${relativeName}
    📅 Taqdim etilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
    ⌚ Kelish sanasi: ${startDate.toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
    ⏲️ Turi: ${booking.visit_type === "long" ? "2 kunlik" : booking.visit_type === "short" ? "1 kunlik" : "3 kunlik"}
    🏛️ Koloniya: ${booking.colony}
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

    return NextResponse.json({ success: true, deletedCount });
  } catch (err) {
    console.error("Ошибка БД:", err);
    return NextResponse.json({ error: "Ошибка БД" }, { status: 500 });
  }
}