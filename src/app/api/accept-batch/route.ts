// api/accept-batch/route.ts

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";
import { cookies } from "next/headers";

const BOT_TOKEN = process.env.BOT_TOKEN || "8373923696:AAHxWLeCqoO0I-ZCgNCgn6yJTi6JJ-wOU3I";

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
  colony: number;
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
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    if (!colony) {
      return NextResponse.json({ error: "colony cookie topilmadi" }, { status: 400 });
    }

    const [adminRows] = await pool.query<RowDataPacket[]>(
      `SELECT group_id FROM \`groups\` WHERE id = ?`,
      [colony]
    );

    if (!adminRows.length) {
      return NextResponse.json({ error: "groups jadvalida colony yo'q" }, { status: 400 });
    }

    const adminChatId = (adminRows as { group_id: string }[])[0]?.group_id;

    if (typeof count !== "number" || count <= 0 || count > 50) {
      console.error("Invalid count:", count);
      return NextResponse.json(
        { error: "count talab qilinadi va 1 dan 50 gacha bo'lishi kerak" },
        { status: 400 }
      );
    }

    console.log("Received count from UI:", count); 

    const [settingsRows] = await pool.query<SettingsRow[]>(
      `SELECT value FROM settings WHERE \`key\` = 'rooms_count${colony}'`
    );

    if (!settingsRows.length) {
      return NextResponse.json({ error: `rooms_count${colony} sozlama topilmadi` }, { status: 400 });
    }

    const rooms = Number(settingsRows[0]?.value) || 10;
    console.log("Rooms count from DB:", rooms); 


    if (rooms !== count) {
      console.warn(`Mismatch detected: UI count=${count}, DB rooms=${rooms}`);
    }

    // Получение pending-заявок (ограничено count)
    const [pendingRows] = await pool.query<Booking[]>(
      `SELECT id, visit_type, created_at, relatives, telegram_chat_id, colony FROM bookings WHERE status = 'pending' AND colony = ? ORDER BY created_at ASC LIMIT ?`,
      [colony, count]
    );

    console.log("Pending bookings found:", pendingRows.length); // Лог: сколько pending найдено

    if (pendingRows.length === 0) {
      console.log("No pending bookings to process");
      return NextResponse.json({ message: "Kutilayotgan arizalar yo'q" }, { status: 200 });
    }

    let assignedCount = 0; // Счетчик успешно назначенных заявок
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

      // Попытка найти свободную комнату (до 60 дней вперед)
      for (let tries = 0; tries < 60; tries++) {
        let isSanitaryFree = true;

        // ✅ ИСПРАВЛЕНИЕ: Вычисляем день ПЕРЕД НАЧАЛОМ визита ОДИН РАЗ
        const prevDay = new Date(start);
        prevDay.setDate(prevDay.getDate() - 1);
        const prevDayStr = prevDay.toISOString().slice(0, 10);

        // Проверяем день перед визитом
        const [prevSanitaryRows] = await pool.query<CountRow[]>(
          `SELECT COUNT(*) as cnt FROM sanitary_days WHERE colony = ? AND date = ?`,
          [colony, prevDayStr]
        );

        if (prevSanitaryRows[0].cnt > 0) {
          isSanitaryFree = false;
        } else {
          // Проверяем все дни визита
          for (let d = 0; d < duration; d++) {
            const day = new Date(start);
            day.setDate(day.getDate() + d);
            const dayStr = day.toISOString().slice(0, 10);

            const [sanitaryRows] = await pool.query<CountRow[]>(
              `SELECT COUNT(*) as cnt FROM sanitary_days WHERE colony = ? AND date = ?`,
              [colony, dayStr]
            );

            if (sanitaryRows[0].cnt > 0) {
              isSanitaryFree = false;
              break;
            }
          }
        }

        if (!isSanitaryFree) {
          console.log(`Sanitary block for start=${start.toISOString().slice(0, 10)}, prevDay=${prevDayStr}`); // Отладка
          start.setDate(start.getDate() + 1);
          continue;
        }

        for (let roomId = 1; roomId <= rooms; roomId++) {
          let canFit = true;
          for (let d = 0; d < duration; d++) {
            const day = new Date(start);
            day.setDate(day.getDate() + d);
            const dayStart = day.toISOString().slice(0, 10) + " 00:00:00";
            const dayEnd = day.toISOString().slice(0, 10) + " 23:59:59";

            // Проверка пересечения дат
            const [occupiedRows] = await pool.query<CountRow[]>(
              `SELECT COUNT(*) as cnt FROM bookings 
               WHERE status = 'approved' 
               AND colony = ? 
               AND room_id = ? 
               AND (
                 (start_datetime <= ? AND end_datetime >= ?) OR 
                 (start_datetime <= ? AND end_datetime >= ?) OR 
                 (start_datetime >= ? AND end_datetime <= ?)
               )`,
              [colony, roomId, dayEnd, dayStart, dayStart, dayEnd, dayStart, dayEnd]
            );

            if (occupiedRows[0].cnt > 0) {
              canFit = false;
              break;
            }
          }
          if (canFit) {
            found = true;
            assignedRoomId = roomId;
            console.log(
              `Assigned room ${roomId} for booking ${booking.id} on ${start.toISOString().slice(0, 10)}`
            ); // Лог: назначение комнаты
            break;
          }
        }
        if (found) break;
        start.setDate(start.getDate() + 1);
      }

      if (!found || assignedRoomId === null) {
        console.warn(`No room found for booking ${booking.id} after 60 tries`);
        continue;
      }

      // Обновление брони
      const startStr = start.toISOString().slice(0, 10) + " 00:00:00";
      const endStr = new Date(start);
      endStr.setDate(endStr.getDate() + duration - 1);
      const endDateStr = endStr.toISOString().slice(0, 10) + " 23:59:59";

      await pool.query(
        `UPDATE bookings SET status = 'approved', start_datetime = ?, end_datetime = ?, room_id = ? WHERE id = ? AND colony = ?`,
        [startStr, endDateStr, assignedRoomId, booking.id, colony]
      );

      assignedCount++;
      assignedBookings.push({ bookingId: booking.id, startDate: startStr, roomId: assignedRoomId });

      // Парсинг relatives
      let relatives: Relative[] = [];
      try {
        relatives = JSON.parse(booking.relatives);
      } catch (e) {
        console.error(`Failed to parse relatives for booking ${booking.id}:`, e);
      }
      const relativeName = relatives[0]?.full_name || "N/A";

      // Сообщения для Telegram
      const messageGroup = `
🎉 Ariza tasdiqlandi. Raqam: ${booking.id}
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      })}
⌚ Kelish sanasi: ${start.toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      })}
🏛️ Koloniya: ${booking.colony}  
🚪 Xona: ${assignedRoomId}
🟢 Holat: Tasdiqlangan
`;

      const messageBot = `
🎉 Ariza №${booking.id} tasdiqlandi!
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      })}
⌚ Kelish sanasi: ${start.toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      })}
⏲️ Tur: ${booking.visit_type === "long" ? "2-kunlik" : booking.visit_type === "short" ? "1-kunlik" : "3-kunlik"}
🏛️ Koloniya: ${booking.colony}
🚪 Xona: ${assignedRoomId}
🟢 Holat: Tasdiqlangan
`;

      // Отправка в группу администраторов
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: adminChatId,
          text: messageGroup,
        });
        console.log(`Sent group message for booking ${booking.id}`);
      } catch (err) {
        console.error(`Failed to send group message for booking ${booking.id}:`, err);
      }

      // Отправка пользователю
      if (booking.telegram_chat_id) {
        try {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: booking.telegram_chat_id,
            text: messageBot,
          });
          console.log(`Sent user message for booking ${booking.id}`);
        } catch (err) {
          console.error(`Failed to send user message for booking ${booking.id}:`, err);
        }
      }
    }

    console.log(
      `Batch processing completed: ${assignedCount} bookings assigned out of ${pendingRows.length}, using max ${rooms} rooms`
    ); // Финальный лог

    return NextResponse.json({ success: true, assignedBookings, assignedCount });
  } catch (err) {
    console.error("DB xatosi:", err);
    return NextResponse.json({ error: "DB xatosi" }, { status: 500 });
  }
}
