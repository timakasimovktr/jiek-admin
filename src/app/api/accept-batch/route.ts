import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";
import { addDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
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
  colony_application_number: string;
}

interface SettingsRow extends RowDataPacket {
  value: string;
}

// interface CountRow extends RowDataPacket {
//   cnt: number;
// }

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

    const [pendingRows] = await pool.query<Booking[]>(
      `SELECT id, visit_type, created_at, relatives, telegram_chat_id, colony, colony_application_number FROM bookings WHERE status = 'pending' AND colony = ? ORDER BY created_at ASC LIMIT ?`,
      [colony, count]
    );

    console.log("Pending bookings found:", pendingRows.length);

    if (pendingRows.length === 0) {
      console.log("No pending bookings to process");
      return NextResponse.json({ message: "Kutilayotgan arizalar yo'q" }, { status: 200 });
    }

    let assignedCount = 0;
    const assignedBookings: { bookingId: number; startDate: string; roomId: number; newVisitType?: string }[] = [];

    for (const booking of pendingRows) {
      let duration = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;
      let newVisitType: "short" | "long" | "extra" = booking.visit_type;
      const timeZone = "Asia/Tashkent";
      const createdDateZoned = toZonedTime(new Date(booking.created_at), timeZone);
      const minDate = addDays(createdDateZoned, 10);
      const start = new Date(minDate);
      let found = false;
      let assignedRoomId: number | null = null;

      // Получаем все санитарные дни в пределах 60 дней от minDate
      const maxDate = addDays(minDate, 60);
      const [sanitaryDays] = await pool.query<RowDataPacket[]>(
        `SELECT date FROM sanitary_days WHERE colony = ? AND date >= ? AND date <= ? ORDER BY date`,
        [colony, minDate.toISOString().slice(0, 10), maxDate.toISOString().slice(0, 10)]
      );
      const sanitaryDates = sanitaryDays.map(row => new Date(row.date).toISOString().slice(0, 10));

      for (let tries = 0; tries < 60; tries++) {
        let isSanitaryFree = true;
        let adjustForSanitary = false;

        // Проверка санитарных дней для всех дней брони
        for (let d = 0; d < duration; d++) {
          const day = new Date(start);
          day.setDate(day.getDate() + d);
          const dayStr = day.toISOString().slice(0, 10);

          if (sanitaryDates.includes(dayStr)) {
            isSanitaryFree = false;
            if (booking.visit_type === "long" && duration === 2) {
              // Для двухдневных свиданий: обрезаем до 1 дня и ставим за день до ближайшего санитарного дня
              duration = 1;
              newVisitType = "short";
              adjustForSanitary = true;
              // Находим ближайший санитарный день
              const firstSanitaryDay = sanitaryDates.find(date => new Date(date) >= start);
              if (firstSanitaryDay) {
                const sanitaryDate = new Date(firstSanitaryDay);
                start.setDate(sanitaryDate.getDate() - 1);
                // Убедимся, что новая дата не раньше minDate
                if (start < minDate) {
                  start.setTime(minDate.getTime());
                }
              }
              break;
            } else if (booking.visit_type === "extra") {
              // Для трехдневных свиданий: переносим после последнего санитарного дня
              const lastSanitaryDay = sanitaryDates
                .filter(date => new Date(date) >= start)
                .reduce((a, b) => (new Date(a) > new Date(b) ? a : b), sanitaryDates[0]);
              if (lastSanitaryDay) {
                start.setDate(new Date(lastSanitaryDay).getDate() + 1);
              }
              duration = 3;
              newVisitType = "extra";
              break;
            } else {
              // Для однодневных: переносим на следующий день
              start.setDate(start.getDate() + 1);
              break;
            }
          }
        }

        // Проверка дня после окончания брони
        if (isSanitaryFree && !adjustForSanitary) {
          const endDay = new Date(start);
          endDay.setDate(endDay.getDate() + duration - 1);
          const nextDayAfterEnd = new Date(endDay);
          nextDayAfterEnd.setDate(nextDayAfterEnd.getDate() + 1);
          const nextDayStr = nextDayAfterEnd.toISOString().slice(0, 10);

          if (sanitaryDates.includes(nextDayStr)) {
            isSanitaryFree = false;
            if (booking.visit_type === "long" && duration === 2) {
              duration = 1;
              newVisitType = "short";
              adjustForSanitary = true;
              // Устанавливаем дату за день до санитарного дня
              start.setDate(nextDayAfterEnd.getDate() - 1);
              // Убедимся, что новая дата не раньше minDate
              if (start < minDate) {
                start.setTime(minDate.getTime());
              }
            } else if (booking.visit_type === "extra") {
              start.setDate(nextDayAfterEnd.getDate() + 1);
              duration = 3;
              newVisitType = "extra";
            } else {
              start.setDate(start.getDate() + 1);
            }
          }
        }

        if (isSanitaryFree || adjustForSanitary) {
          for (let roomId = 1; roomId <= rooms; roomId++) {
            let canFit = true;
            for (let d = 0; d < duration; d++) {
              const day = new Date(start);
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
              found = true;
              assignedRoomId = roomId;
              console.log(
                `Assigned room ${roomId} for booking ${booking.id} on ${start.toISOString().slice(0, 10)}`
              );
              break;
            }
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
        `UPDATE bookings SET status = 'approved', start_datetime = ?, end_datetime = ?, room_id = ?, visit_type = ? WHERE id = ? AND colony = ?`,
        [startStr, endDateStr, assignedRoomId, newVisitType, booking.id, colony]
      );

      assignedCount++;
      assignedBookings.push({ bookingId: booking.id, startDate: startStr, roomId: assignedRoomId, newVisitType });

      let relatives: Relative[] = [];
      try {
        relatives = JSON.parse(booking.relatives);
      } catch (e) {
        console.error(`Failed to parse relatives for booking ${booking.id}:`, e);
      }
      const relativeName = relatives[0]?.full_name || "N/A";

      // if visit type was changed, reflect that in the message
      
      const messageGroup = `
🎉 Ariza tasdiqlandi. Raqam: ${booking.colony_application_number}
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
🎉 Ariza №${booking.colony_application_number} tasdiqlandi!
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
⏲️ Tur${newVisitType !== booking.visit_type ? ` (sanitariya kuni munosabati bilan o'zgartirilgan): ${newVisitType === "long" ? "2-kunlik" : newVisitType === "short" ? "1-kunlik" : "3-kunlik"}` : `: ${newVisitType === "long" ? "2-kunlik" : newVisitType === "short" ? "1-kunlik" : "3-kunlik"}`}
🏛️ Koloniya: ${booking.colony}
🚪 Xona: ${assignedRoomId}
🟢 Holat: Tasdiqlangan
`;

      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: adminChatId,
          text: messageGroup,
        });
        console.log(`Sent group message for booking ${booking.id}`);
      } catch (err) {
        console.error(`Failed to send group message for booking ${booking.id}:`, err);
      }

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
    );

    return NextResponse.json({ success: true, assignedBookings, assignedCount });
  } catch (err) {
    console.error("DB xatosi:", err);
    return NextResponse.json({ error: "DB xatosi" }, { status: 500 });
  }
}