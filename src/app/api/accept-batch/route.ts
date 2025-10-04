import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket, OkPacket } from "mysql2/promise";
import { cookies } from "next/headers";

const BOT_TOKEN = process.env.BOT_TOKEN || "8373923696:AAHxWLeCqoO0I-ZCgNCgn6yJTi6JJ-wOU3I";
// const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "-1003014693175";

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

// interface CountRow extends RowDataPacket {
//   cnt: number;
// }

interface OccupiedRow extends RowDataPacket {
  room_id: number;
  start_datetime: string;
  end_datetime: string;
}

export async function POST(req: NextRequest) {
  try {
    const { count } = await req.json();
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;
    const colonyNum = Number(colony);

    if (!colonyNum) {
      return NextResponse.json({ error: "colony cookie topilmadi" }, { status: 400 });
    }

    // get ADMIN_CHAT_ID from db admin table where id is colony number
    const [adminRows] = await pool.query<RowDataPacket[]>(
      `SELECT group_id FROM \`groups\` WHERE id = ?`,
      [colonyNum]
    );

    if (!adminRows.length) {
      return NextResponse.json({ error: "groups jadvalida colony yo'q" }, { status: 400 });
    }

    const adminChatId = (adminRows as { group_id: string }[])[0]?.group_id;

    // Очистка завершенных встреч: удаление approved bookings, чья end_datetime < сегодняшнего дня 00:00:00 по Ташкенту
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' });
    const todayStr = formatter.format(now);
    const todayStartStr = `${todayStr} 00:00:00`;

    console.log("Cleanup date threshold:", todayStartStr); // Лог: порог для очистки

    const [deleteResult] = await pool.query<OkPacket[]>(
      `DELETE FROM bookings WHERE status = 'approved' AND colony = ? AND end_datetime < ?`,
      [colonyNum, todayStartStr]
    );

    const deletedCount = deleteResult[0].affectedRows || 0;
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} completed bookings`);
    }

    // Проверка валидности count
    if (typeof count !== "number" || count <= 0 || count > 50) {
      console.error("Invalid count:", count);
      return NextResponse.json(
        { error: "count talab qilinadi va 1 dan 50 gacha bo'lishi kerak" },
        { status: 400 }
      );
    }

    console.log("Received count from UI:", count); // Лог: полученное количество заявок

    // Чтение количества комнат из settings
    const [settingsRows] = await pool.query<SettingsRow[]>(
      `SELECT value FROM settings WHERE \`key\` = 'rooms_count${colony}'`
    );

    if (!settingsRows.length) {
      return NextResponse.json({ error: `rooms_count${colony} sozlama topilmadi` }, { status: 400 });
    }

    const rooms = Number(settingsRows[0]?.value) || 10;
    console.log("Rooms count from DB:", rooms); // Лог: кол-во комнат из БД

    // Если хотите, чтобы rooms = count (UI переопределяет rooms):
    // rooms = count; // Раскомментируйте, если нужно синхронизировать

    // Проверка несоответствия count и rooms
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

    // Глобальная минимальная дата: текущая дата + 10 дней (для всех заявок, чтобы заполнять пробелы)
    let globalMinDate = new Date(now);
    const globalMinFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' });
    const minDateStr = globalMinFormatter.format(new Date(globalMinDate.getTime() + 10 * 24 * 60 * 60 * 1000));
    globalMinDate = new Date(`${minDateStr}T00:00:00+05:00`); // Устанавливаем в Tashkent timezone

    console.log("Global min date:", globalMinDate.toISOString().slice(0, 10)); // Лог: глобальная мин дата

    // Загрузка всех занятых дней по комнатам из approved bookings (после очистки)
    const [occupiedRows] = await pool.query<OccupiedRow[]>(
      `SELECT room_id, start_datetime, end_datetime FROM bookings WHERE status = 'approved' AND colony = ?`,
      [colony]
    );

    const occupiedPerRoom: { [room: number]: Set<string> } = {};

    for (const occ of occupiedRows) {
      const room = occ.room_id;
      if (!occupiedPerRoom[room]) {
        occupiedPerRoom[room] = new Set();
      }
      const currentDay = new Date(occ.start_datetime);
      currentDay.setHours(0, 0, 0, 0);
      const endDay = new Date(occ.end_datetime);
      endDay.setHours(0, 0, 0, 0);
      while (currentDay <= endDay) {
        occupiedPerRoom[room].add(currentDay.toISOString().slice(0, 10));
        currentDay.setDate(currentDay.getDate() + 1);
      }
    }

    let assignedCount = 0; // Счетчик успешно назначенных заявок
    const assignedBookings: { bookingId: number; startDate: string; roomId: number }[] = [];

    for (const booking of pendingRows) {
      const duration = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;
      let assignedStart: Date | null = null;
      let assignedRoomId: number | null = null;

      // Используем глобальную minDate для поиска самого раннего слота (заполнение пробелов)
      // Попытка найти свободную комнату (до 60 дней вперед от globalMinDate)
      for (let tries = 0; tries < 60; tries++) {
        const start = new Date(globalMinDate);
        start.setDate(start.getDate() + tries);
        let found = false;

        for (let roomId = 1; roomId <= rooms; roomId++) {
          const occupiedDays = occupiedPerRoom[roomId] || new Set();
          let canFit = true;

          for (let d = 0; d < duration; d++) {
            const day = new Date(start);
            day.setDate(day.getDate() + d);
            const dayStr = day.toISOString().slice(0, 10);

            if (occupiedDays.has(dayStr)) {
              canFit = false;
              break;
            }
          }

          if (canFit) {
            found = true;
            assignedRoomId = roomId;
            assignedStart = start;
            console.log(
              `Assigned room ${roomId} for booking ${booking.id} on ${start.toISOString().slice(0, 10)}`
            ); // Лог: назначение комнаты
            break;
          }
        }

        if (found) break;
      }

      if (!assignedStart || assignedRoomId === null) {
        console.warn(`No room found for booking ${booking.id} after 60 tries`);
        continue;
      }

      // Добавление занятых дней в память для последующих бронирований
      for (let d = 0; d < duration; d++) {
        const day = new Date(assignedStart);
        day.setDate(day.getDate() + d);
        const dayStr = day.toISOString().slice(0, 10);
        if (!occupiedPerRoom[assignedRoomId]) {
          occupiedPerRoom[assignedRoomId] = new Set();
        }
        occupiedPerRoom[assignedRoomId].add(dayStr);
      }

      // Обновление брони
      const startStr = assignedStart.toISOString().slice(0, 10) + " 00:00:00";
      const endDate = new Date(assignedStart);
      endDate.setDate(endDate.getDate() + duration - 1);
      const endStr = endDate.toISOString().slice(0, 10) + " 23:59:59";

      await pool.query(
        `UPDATE bookings SET status = 'approved', start_datetime = ?, end_datetime = ?, room_id = ? WHERE id = ? AND colony = ?`,
        [startStr, endStr, assignedRoomId, booking.id, colonyNum]
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
⌚ Kelish sanasi: ${assignedStart.toLocaleString("uz-UZ", {
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
⌚ Kelish sanasi: ${assignedStart.toLocaleString("uz-UZ", {
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

    return NextResponse.json({ success: true, assignedBookings, assignedCount, deletedCount });
  } catch (err) {
    console.error("DB xatosi:", err);
    return NextResponse.json({ error: "DB xatosi" }, { status: 500 });
  }
}