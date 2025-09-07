import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";

const BOT_TOKEN = process.env.BOT_TOKEN || "8327319465:AAEdZDOtad6b6nQ-xN9hyabfv2CmQlIQCEo";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "-1003014693175";

interface Relative {
  full_name: string;
  passport: string;
}

interface Booking extends RowDataPacket {
  id: number;
  visit_type: "short" | "long" | "extra";
  created_at: string;
  relatives: string;
  telegram_chat_id?: string;
}

interface SettingsRow extends RowDataPacket {
  value: string;
}

interface CountRow extends RowDataPacket {
  cnt: number;
}

export async function POST(req: NextRequest) {
  try {
    const { count } = await req.json();

    if (typeof count !== "number" || count <= 0) {
      return NextResponse.json({ error: "count talab qilinadi va musbat bo'lishi kerak" }, { status: 400 });
    }

    const [settingsRows] = await pool.query<SettingsRow[]>("SELECT value FROM settings WHERE `key` = 'rooms_count'");
    const rooms = Number(settingsRows[0]?.value) || 10;

    const [pendingRows] = await pool.query<Booking[]>(
      "SELECT id, visit_type, created_at, relatives, telegram_chat_id FROM bookings WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
      [count]
    );

    if (pendingRows.length === 0) {
      return NextResponse.json({ message: "Kutilayotgan arizalar yo'q" }, { status: 200 });
    }

    const assignedBookings: { bookingId: number; startDate: string; roomId: number }[] = [];

    for (const booking of pendingRows) {
      const duration = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;
      const createdDate = new Date(booking.created_at);
      const minDate = new Date(createdDate);
      minDate.setDate(minDate.getDate() + 10);
      minDate.setHours(0, 0, 0, 0);
      const start = new Date(minDate);
      let found = false;
      let assignedRoomId: number | null = null;

      for (let tries = 0; tries < 60; tries++) {
        for (let roomId = 1; roomId <= rooms; roomId++) {
          let canFit = true;
          for (let d = 0; d < duration; d++) {
            const day = new Date(start);
            day.setDate(day.getDate() + d);
            const dayStart = day.toISOString().slice(0, 10) + " 00:00:00";
            const dayEnd = day.toISOString().slice(0, 10) + " 23:59:59";

            const [occupiedRows] = await pool.query<CountRow[]>(
              "SELECT COUNT(*) as cnt FROM bookings WHERE status = 'approved' AND room_id = ? AND start_datetime <= ? AND end_datetime >= ?",
              [roomId, dayEnd, dayStart]
            );

            if (occupiedRows[0].cnt > 0) {
              canFit = false;
              break;
            }
          }
          if (canFit) {
            found = true;
            assignedRoomId = roomId;
            break;
          }
        }
        if (found) break;
        start.setDate(start.getDate() + 1);
      }

      if (!found || assignedRoomId === null) {
        console.warn(`Xona topilmadi: ariza ${booking.id}`);
        continue;
      }

      const startStr = start.toISOString().slice(0, 10) + " 00:00:00";
      const endStr = new Date(start);
      endStr.setDate(endStr.getDate() + duration - 1);
      const endDateStr = endStr.toISOString().slice(0, 10) + " 23:59:59";

      await pool.query(
        "UPDATE bookings SET status = 'approved', start_datetime = ?, end_datetime = ?, room_id = ? WHERE id = ?",
        [startStr, endDateStr, assignedRoomId, booking.id]
      );

      assignedBookings.push({ bookingId: booking.id, startDate: startStr, roomId: assignedRoomId });

      const relatives: Relative[] = JSON.parse(booking.relatives);
      const relativeName = relatives[0]?.full_name || "N/A";

      const messageGroup = `
🎉 Ariza tasdiqlandi. Raqam: ${booking.id}
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
⌚ Tashrif sanasi: ${start.toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
🟢 Holat: Tasdiqlangan
🚪 Xona: ${assignedRoomId}
`;

      const messageBot = `
🎉 Ariza №${booking.id} tasdiqlandi!
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
⌚ Tashrif sanasi: ${start.toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" })}
⏲️ Tur: ${booking.visit_type === "long" ? "2-kunlik" : booking.visit_type === "short" ? "1-kunlik" : "3-kunlik"}
🟢 Holat: Tasdiqlangan
🚪 Xona: ${assignedRoomId}
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
    }

    return NextResponse.json({ success: true, assignedBookings });
  } catch (err) {
    console.error("DB xatosi:", err);
    return NextResponse.json({ error: "DB xatosi" }, { status: 500 });
  }
}