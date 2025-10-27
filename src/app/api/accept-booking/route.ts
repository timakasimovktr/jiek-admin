// app/api/approve-single/route.ts
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";
import { addDays, isSameDay, parseISO } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
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
  language?: string;
}

interface SettingsRow extends RowDataPacket {
  value: string;
}

export async function POST(req: NextRequest) {
  try {
    const { bookingId } = await req.json();
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    if (!bookingId || !colony) {
      return NextResponse.json({ error: "bookingId va colony cookie talab qilinadi" }, { status: 400 });
    }

    const [adminRows] = await pool.query<RowDataPacket[]>(
      `SELECT group_id FROM \`groups\` WHERE id = ?`,
      [colony]
    );

    if (!adminRows.length) {
      return NextResponse.json({ error: "groups jadvalida colony yo'q" }, { status: 400 });
    }

    const adminChatId = adminRows[0].group_id;

    // Получаем заявку
    const [bookingRows] = await pool.query<Booking[]>(
      `SELECT id, visit_type, created_at, relatives, telegram_chat_id, colony, colony_application_number, language  
       FROM bookings 
       WHERE id = ? AND colony = ? AND status = 'pending'`,
      [bookingId, colony]
    );

    if (bookingRows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена или уже обработана" }, { status: 404 });
    }

    const booking = bookingRows[0];
    let duration = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;
    let newVisitType: "short" | "long" | "extra" = booking.visit_type;
    const timeZone = "Asia/Tashkent";

    const createdDateZoned = toZonedTime(new Date(booking.created_at), timeZone);
    const minDate = addDays(createdDateZoned, 10);
    const maxDate = addDays(minDate, 365);
    let start = new Date(minDate);
    let found = false;
    let assignedRoomId: number | null = null;

    // Получаем количество комнат
    const [settingsRows] = await pool.query<SettingsRow[]>(
      `SELECT value FROM settings WHERE \`key\` = 'rooms_count${colony}'`
    );

    if (!settingsRows.length) {
      return NextResponse.json({ error: `rooms_count${colony} sozlama topilmadi` }, { status: 400 });
    }

    const rooms = Number(settingsRows[0].value) || 10;

    // Получаем санитарные дни
    const [sanitaryDays] = await pool.query<RowDataPacket[]>(
      `SELECT date FROM sanitary_days WHERE colony = ? AND date >= ? AND date <= ? ORDER BY date`,
      [
        colony,
        formatInTimeZone(minDate, timeZone, 'yyyy-MM-dd'),
        formatInTimeZone(maxDate, timeZone, 'yyyy-MM-dd'),
      ]
    );

    const sanitaryDates = sanitaryDays
      .map(row => {
        let dateStr = row.date;
        if (dateStr instanceof Date) {
          dateStr = formatInTimeZone(dateStr, timeZone, 'yyyy-MM-dd');
        } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
          dateStr = dateStr.slice(0, 10);
        }
        try {
          const parsed = toZonedTime(parseISO(dateStr), timeZone);
          return isNaN(parsed.getTime()) ? null : parsed;
        } catch {
          return null;
        }
      })
      .filter((d): d is Date => d !== null);

    console.log(`Sanitariya kunlari:`, sanitaryDates.map(d => formatInTimeZone(d, timeZone, 'yyyy-MM-dd')));

    // Поиск свободной даты и комнаты
    for (let tries = 0; tries < 60 && !found && start <= maxDate; tries++) {
      let isValidDate = true;
      let adjustedDuration = duration;
      newVisitType = booking.visit_type;

      // Проверка на санитарные дни и день перед ними
      for (let d = 0; d < adjustedDuration; d++) {
        const day = addDays(start, d);
        if (sanitaryDates.some(s => isSameDay(s, day) || isSameDay(addDays(s, -1), day))) {
          isValidDate = false;
          break;
        }
      }

      // Если конфликт — укорачиваем до 1 дня
      if (!isValidDate && duration > 1) {
        console.log(`Ariza ${booking.id}: Sanitariya bilan to'qnashuv → 1 kunga qisqartirildi`);
        adjustedDuration = 1;
        newVisitType = "short";
        isValidDate = true;

        for (let d = 0; d < adjustedDuration; d++) {
          const day = addDays(start, d);
          if (sanitaryDates.some(s => isSameDay(s, day) || isSameDay(addDays(s, -1), day))) {
            isValidDate = false;
            break;
          }
        }
      }

      // Если всё ещё конфликт — ищем следующий день
      if (!isValidDate) {
        let nextStart = addDays(start, 1);
        let conflict = true;
        while (conflict && nextStart <= maxDate) {
          conflict = false;
          for (let d = 0; d < adjustedDuration; d++) {
            const day = addDays(nextStart, d);
            if (sanitaryDates.some(s => isSameDay(s, day) || isSameDay(addDays(s, -1), day))) {
              conflict = true;
              break;
            }
          }
          if (conflict) nextStart = addDays(nextStart, 1);
        }
        if (nextStart > maxDate) break;
        start = nextStart;
        continue;
      }

      // Проверка комнат
      for (let roomId = 1; roomId <= rooms; roomId++) {
        let canFit = true;
        for (let d = 0; d < adjustedDuration; d++) {
          const day = addDays(start, d);
          const dayStart = formatInTimeZone(day, timeZone, 'yyyy-MM-dd 00:00:00');
          const dayEnd = formatInTimeZone(day, timeZone, 'yyyy-MM-dd 23:59:59');

          const [occupied] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) as cnt FROM bookings 
             WHERE status = 'approved' AND room_id = ? AND colony = ?
             AND (
               (start_datetime <= ? AND end_datetime >= ?) OR
               (start_datetime <= ? AND end_datetime >= ?) OR
               (start_datetime >= ? AND end_datetime <= ?)
             )`,
            [roomId, colony, dayEnd, dayStart, dayStart, dayEnd, dayStart, dayEnd]
          );

          if (occupied[0].cnt > 0) {
            canFit = false;
            break;
          }
        }

        if (canFit) {
          found = true;
          assignedRoomId = roomId;
          duration = adjustedDuration;
          break;
        }
      }

      if (!found) {
        start = addDays(start, 1);
      }
    }

    if (!found || assignedRoomId === null) {
      return NextResponse.json({ error: "60 кун ичида бўш хона топилмади" }, { status: 400 });
    }

    // Обновление заявки
    const startStr = formatInTimeZone(start, timeZone, 'yyyy-MM-dd 00:00:00');
    const endStr = formatInTimeZone(addDays(start, duration - 1), timeZone, 'yyyy-MM-dd 23:59:59');
    const nextAvailable = addDays(new Date(startStr), 52);
    const nextAvailableStr = formatInTimeZone(nextAvailable, timeZone, "yyyy-MM-dd HH:mm:ss");

    await pool.query(
      `UPDATE bookings 
       SET status = 'approved', 
           start_datetime = ?, 
           end_datetime = ?, 
           room_id = ?, 
           visit_type = ?, 
           next_available_date = ? 
       WHERE id = ? AND colony = ?`,
      [startStr, endStr, assignedRoomId, newVisitType, nextAvailableStr, booking.id, colony]
    );

    // Сообщения
    let relatives: Relative[] = [];
    try {
      relatives = JSON.parse(booking.relatives);
    } catch {}
    const relativeName = relatives[0]?.full_name || "N/A";

    const messageGroup = `
🎉 Ariza tasdiqlandi. Raqam: ${booking.colony_application_number}
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${formatInTimeZone(new Date(booking.created_at), timeZone, 'dd.MM.yyyy')}
⌚ Kelish sanasi: ${formatInTimeZone(start, timeZone, 'dd.MM.yyyy')}
🏛️ Koloniya: ${booking.colony}  
🚪 Xona: ${assignedRoomId}
🟢 Holat: Tasdiqlangan
`;

    const lang = booking.language || "uz";
    const visitTypeTextRu = newVisitType === "short" ? "1-дневный" : newVisitType === "long" ? "2-дневный" : "3-дневный";
    const visitTypeTextUzl = newVisitType === "short" ? "1-kunlik" : newVisitType === "long" ? "2-kunlik" : "3-kunlik";
    const visitTypeTextUz = newVisitType === "short" ? "1-кунлик" : newVisitType === "long" ? "2-кунлик" : "3-кунлик";

    const changedTextRu = newVisitType !== booking.visit_type ? " (санитария куни туфайли 1 кунликка ўзгартирилди)" : "";
    const changedTextUzl = newVisitType !== booking.visit_type ? " (sanitariya kuni munosabati bilan 1-kunlikka o'zgartirilgan)" : "";
    const changedTextUz = newVisitType !== booking.visit_type ? " (санитария куни муносабати билан 1 кунликка ўзгартирилган)" : "";

    let messageBot = "";
    if (lang === "ru") {
      messageBot = `
🎉 Заявка №${booking.colony_application_number} одобрена!
👤 Заявитель: ${relativeName}
📅 Дата подачи: ${formatInTimeZone(new Date(booking.created_at), timeZone, 'dd.MM.yyyy')}
⌚ Дата прибытия: ${formatInTimeZone(start, timeZone, 'dd.MM.yyyy')}
⏲️ Тип${changedTextRu}: ${visitTypeTextRu}
🏛️ Колония: ${booking.colony}
🚪 Комната: ${assignedRoomId}
🟢 Статус: Одобрено
`;
    } else if (lang === "uzl") {
      messageBot = `
🎉 Ariza №${booking.colony_application_number} tasdiqlandi!
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${formatInTimeZone(new Date(booking.created_at), timeZone, 'dd.MM.yyyy')}
⌚ Kelish sanasi: ${formatInTimeZone(start, timeZone, 'dd.MM.yyyy')}
⏲️ Tur${changedTextUzl}: ${visitTypeTextUzl}
🏛️ Koloniya: ${booking.colony}
🚪 Xona: ${assignedRoomId}
🟢 Holat: Tasdiqlangan
`;
    } else {
      messageBot = `
🎉 Ариза №${booking.colony_application_number} тасдиқланди!
👤 Аризачи: ${relativeName}
📅 Берилган сана: ${formatInTimeZone(new Date(booking.created_at), timeZone, 'dd.MM.yyyy')}
⌚ Келиш санаси: ${formatInTimeZone(start, timeZone, 'dd.MM.yyyy')}
⏲️ Тур${changedTextUz}: ${visitTypeTextUz}
🏛️ Колонија: ${booking.colony}
🚪 Хона: ${assignedRoomId}
🟢 Ҳолат: Тасдиқланган
`;
    }

    // Отправка в группу
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: adminChatId,
      text: messageGroup,
    });

    // Отправка пользователю
    if (booking.telegram_chat_id) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: booking.telegram_chat_id,
        text: messageBot,
      });
    }

    return NextResponse.json({
      success: true,
      assigned: {
        bookingId: booking.id,
        startDate: startStr,
        endDate: endStr,
        roomId: assignedRoomId,
        visitType: newVisitType,
      },
    });
  } catch (err) {
    console.error("DB xatosi:", err);
    return NextResponse.json({ error: "DB xatosi" }, { status: 500 });
  }
}