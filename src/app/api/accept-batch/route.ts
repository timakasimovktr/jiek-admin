import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";
import { addDays } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
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

    const adminChatId = adminRows[0].group_id;

    if (typeof count !== "number" || count <= 0 || count > 50) {
      console.error("Noto'g'ri count:", count);
      return NextResponse.json(
        { error: "count talab qilinadi va 1 dan 50 gacha bo'lishi kerak" },
        { status: 400 }
      );
    }

    console.log("UI dan olingan count:", count);

    const [settingsRows] = await pool.query<SettingsRow[]>(
      `SELECT value FROM settings WHERE \`key\` = 'rooms_count${colony}'`
    );

    if (!settingsRows.length) {
      return NextResponse.json({ error: `rooms_count${colony} sozlama topilmadi` }, { status: 400 });
    }

    const rooms = Number(settingsRows[0].value) || 10;
    console.log("DB dan olingan xonalar soni:", rooms);

    if (rooms !== count) {
      console.warn(`Mos kelmadi: UI count=${count}, DB rooms=${rooms}`);
    }

    const [pendingRows] = await pool.query<Booking[]>(
      `SELECT id, visit_type, created_at, relatives, telegram_chat_id, colony, colony_application_number 
       FROM bookings 
       WHERE status = 'pending' AND colony = ? 
       ORDER BY created_at ASC LIMIT ?`,
      [colony, count]
    );

    console.log("Kutilayotgan arizalar topildi:", pendingRows.length);

    if (pendingRows.length === 0) {
      console.log("Qayta ishlash uchun kutilayotgan arizalar yo'q");
      return NextResponse.json({ message: "Kutilayotgan arizalar yo'q" }, { status: 200 });
    }

    let assignedCount = 0;
    const assignedBookings: { bookingId: number; startDate: string; roomId: number; newVisitType?: string }[] = [];

    for (const booking of pendingRows) {
      let duration = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;
      let newVisitType: "short" | "long" | "extra" = booking.visit_type;
      const timeZone = "Asia/Tashkent";
      const createdStr = booking.created_at.replace('T', ' ');
      const createdUtc = new Date(`${createdStr} +05:00`);
      const createdDateZoned = toZonedTime(createdUtc, timeZone);
      const minDate = addDays(createdDateZoned, 10);
      const maxDate = addDays(minDate, 60);
      let start = new Date(minDate);
      let found = false;
      let assignedRoomId: number | null = null;

      // Получение санитарных дней
      const minDateStr = formatInTimeZone(minDate, timeZone, 'yyyy-MM-dd');
      const maxDateStr = formatInTimeZone(maxDate, timeZone, 'yyyy-MM-dd');
      const [sanitaryDays] = await pool.query<RowDataPacket[]>(
        `SELECT date FROM sanitary_days WHERE colony = ? AND date >= ? AND date <= ? ORDER BY date`,
        [colony, minDateStr, maxDateStr]
      );

      const sanitaryDates = sanitaryDays
        .map(row => {
          let dateStr = row.date;
          if (!dateStr) {
            console.warn(`Sanitary_days jadvalida bo'sh sana, koloniya ${colony}:`, row.date);
            return null;
          }
          if (dateStr instanceof Date) {
            dateStr = dateStr.toISOString().slice(0, 10);
          } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
            dateStr = dateStr.slice(0, 10);
          }
          try {
            const sanitaryUtc = new Date(`${dateStr} 00:00:00 +05:00`);
            const parsedDate = toZonedTime(sanitaryUtc, timeZone);
            if (isNaN(parsedDate.getTime())) {
              console.warn(`Sanitary_days jadvalida noto'g'ri sana formati, koloniya ${colony}: ${dateStr}`);
              return null;
            }
            console.log(`Sanitariya kuni sanasi qayta ishlandi: ${dateStr}`);
            return parsedDate;
          } catch (e) {
            console.error(`Ariza ${booking.id} uchun sana ${dateStr} ni parse qilishda xato:`, e);
            return null;
          }
        })
        .filter((date): date is Date => date !== null);

      console.log(
        `Ariza ${booking.id} (turi: ${booking.visit_type}): Sanitariya kunlari`,
        sanitaryDates.map(d => formatInTimeZone(d, timeZone, 'yyyy-MM-dd'))
      );

      function isSameDayZoned(d1: Date, d2: Date, timeZone: string) {
        return formatInTimeZone(d1, timeZone, 'yyyy-MM-dd') === formatInTimeZone(d2, timeZone, 'yyyy-MM-dd');
      }

      for (let tries = 0; tries < 60 && !found && start <= maxDate; tries++) {
        let isValidDate = true;
        let adjustedDuration = duration;
        newVisitType = booking.visit_type;

        // Проверка конфликта с санитарным днем или днем перед ним
        for (let d = 0; d < adjustedDuration; d++) {
          const day = addDays(start, d);
          if (sanitaryDates.some(sanitary => isSameDayZoned(sanitary, day, timeZone) || isSameDayZoned(addDays(sanitary, -1), day, timeZone))) {
            isValidDate = false;
            break;
          }
        }

        // Если конфликт и продолжительность > 1, пытаемся сократить до 1 дня
        if (!isValidDate && duration > 1) {
          console.log(`Ariza ${booking.id}: Sanitariya kuni bilan to'qnashuv, 1 kunga qisqartirildi`);
          adjustedDuration = 1;
          newVisitType = "short";
          isValidDate = true;
          // Повторная проверка с новой продолжительностью
          for (let d = 0; d < adjustedDuration; d++) {
            const day = addDays(start, d);
            if (sanitaryDates.some(sanitary => isSameDayZoned(sanitary, day, timeZone) || isSameDayZoned(addDays(sanitary, -1), day, timeZone))) {
              isValidDate = false;
              break;
            }
          }
        }

        // Если дата все еще недействительна, переносим на следующую свободную дату
        if (!isValidDate) {
          let nextStart = start;
          let hasConflict = true;
          while (hasConflict && nextStart <= maxDate) {
            nextStart = addDays(nextStart, 1);
            hasConflict = false;
            for (let d = 0; d < adjustedDuration; d++) {
              const day = addDays(nextStart, d);
              if (sanitaryDates.some(sanitary => isSameDayZoned(sanitary, day, timeZone) || isSameDayZoned(addDays(sanitary, -1), day, timeZone))) {
                hasConflict = true;
                break;
              }
            }
          }
          if (nextStart > maxDate) {
            console.warn(`Ariza ${booking.id}: Max datadan keyin sana topilmadi`);
            break;
          }
          start = nextStart;
          console.log(
            `Ariza ${booking.id}: Sanitariya kunidan keyin ${formatInTimeZone(start, timeZone, 'yyyy-MM-dd')} ga o'tkazildi`
          );
        }

        // Проверка доступности комнаты
        for (let roomId = 1; roomId <= rooms; roomId++) {
          let canFit = true;
          for (let d = 0; d < adjustedDuration; d++) {
            const day = addDays(start, d);
            const dayStr = formatInTimeZone(day, timeZone, 'yyyy-MM-dd');
            const dayStart = dayStr + " 00:00:00";
            const dayEnd = dayStr + " 23:59:59";
            const endDay = addDays(start, adjustedDuration - 1);
            const endDayStr = formatInTimeZone(endDay, timeZone, 'yyyy-MM-dd');
            const endDayStart = endDayStr + " 00:00:00";
            const endDayEnd = endDayStr + " 23:59:59";

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
              [roomId, colony, endDayEnd, dayStart, dayEnd, endDayStart, dayStart, endDayEnd]
            );

            if (occupiedRows[0].cnt > 0) {
              canFit = false;
              console.log(`Ariza ${booking.id}: Xona ${roomId} band, ${dayStr}`);
              break;
            }
          }
          if (canFit) {
            found = true;
            assignedRoomId = roomId;
            duration = adjustedDuration;
            console.log(
              `Ariza ${booking.id} uchun xona ${roomId} ${formatInTimeZone(start, timeZone, 'yyyy-MM-dd')} ga tayinlandi (davomiylik: ${duration} kun, turi: ${newVisitType})`
            );
            break;
          }
        }

        if (!found) {
          start = addDays(start, 1);
        }
      }

      if (!found || assignedRoomId === null) {
        console.warn(`Ariza ${booking.id} uchun 60 urinishdan keyin xona topilmadi`);
        continue;
      }

      // Обновление бронирования
      const startStr = formatInTimeZone(start, timeZone, 'yyyy-MM-dd') + " 00:00:00";
      const endStr = formatInTimeZone(addDays(start, duration - 1), timeZone, 'yyyy-MM-dd') + " 23:59:59";

      await pool.query(
        `UPDATE bookings SET status = 'approved', start_datetime = ?, end_datetime = ?, room_id = ?, visit_type = ? WHERE id = ? AND colony = ?`,
        [startStr, endStr, assignedRoomId, newVisitType, booking.id, colony]
      );

      assignedCount++;
      assignedBookings.push({ bookingId: booking.id, startDate: startStr, roomId: assignedRoomId, newVisitType });

      let relatives: Relative[] = [];
      try {
        relatives = JSON.parse(booking.relatives);
      } catch (e) {
        console.error(`Ariza ${booking.id} uchun qarindoshlar parse qilishda xato:`, e);
      }
      const relativeName = relatives[0]?.full_name || "N/A";

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
⏲️ Tur${newVisitType !== booking.visit_type ? ` (sanitariya kuni munosabati bilan 1-kunlikka o'zgartirilgan): 1-kunlik` : `: ${newVisitType === "long" ? "2-kunlik" : newVisitType === "short" ? "1-kunlik" : "3-kunlik"}`}
🏛️ Koloniya: ${booking.colony}
🚪 Xona: ${assignedRoomId}
🟢 Holat: Tasdiqlangan
`;

      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: adminChatId,
          text: messageGroup,
        });
        console.log(`Ariza ${booking.id} uchun guruh xabari yuborildi`);
      } catch (err) {
        console.error(`Ariza ${booking.id} uchun guruh xabarini yuborishda xato:`, err);
      }

      if (booking.telegram_chat_id) {
        try {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: booking.telegram_chat_id,
            text: messageBot,
          });
          console.log(`Ariza ${booking.id} uchun foydalanuvchi xabari yuborildi`);
        } catch (err) {
          console.error(`Ariza ${booking.id} uchun foydalanuvchi xabarini yuborishda xato:`, err);
        }
      }
    }

    console.log(
      `Ommaviy qayta ishlash yakunlandi: ${pendingRows.length} tadan ${assignedCount} ta ariza tayinlandi, maksimal ${rooms} xona ishlatildi`
    );

    return NextResponse.json({ success: true, assignedBookings, assignedCount });
  } catch (err) {
    console.error("DB xatosi:", err);
    return NextResponse.json({ error: "DB xatosi" }, { status: 500 });
  }
}