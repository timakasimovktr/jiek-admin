import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
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
  telegram_chat_id?: string | null;
  colony: number;
  colony_application_number: string | number;
  prisoner_name: string;
  language?: string | null;
}

interface SettingsRow extends RowDataPacket {
  value: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: { bookingId: number; assignedDate: string } = await req.json();
    const { bookingId, assignedDate } = body;

    const cookieStore = await cookies();
    const colonyStr = cookieStore.get("colony")?.value;
    if (!colonyStr) {
      return NextResponse.json({ error: "colony cookie topilmadi" }, { status: 400 });
    }
    const colony = Number(colonyStr);

    if (!bookingId || !assignedDate) {
      return NextResponse.json({ error: "bookingId va assignedDate talab qilinadi" }, { status: 400 });
    }

    const timeZone = "Asia/Tashkent";
    const selectedDate = toZonedTime(parseISO(assignedDate), timeZone);
    selectedDate.setHours(0, 0, 0, 0);

    // === Получаем заявку ===
    const [bookingRows] = await pool.query<Booking[]>(
      `SELECT * FROM bookings WHERE id = ? AND colony = ? AND status = 'pending'`,
      [bookingId, colony]
    );

    if (bookingRows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена или уже обработана" }, { status: 404 });
    }

    const booking = bookingRows[0];
    let duration = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;
    let finalVisitType: "short" | "long" | "extra" = booking.visit_type;

    // === Минимум 0 дней от created_at ===
    const createdAtZoned = toZonedTime(new Date(booking.created_at), timeZone);
    const minAllowedDate = addDays(createdAtZoned, 0);
    minAllowedDate.setHours(0, 0, 0, 0);

    if (selectedDate < minAllowedDate) {
      return NextResponse.json(
        { error: `Дата должна быть не ранее ${formatInTimeZone(minAllowedDate, timeZone, 'dd.MM.yyyy')}` },
        { status: 400 }
      );
    }

    // === Количество комнат ===
    const [settingsRows] = await pool.query<SettingsRow[]>(
      `SELECT value FROM settings WHERE \`key\` = 'rooms_count${colony}'`
    );
    const rooms = settingsRows.length > 0 ? Number(settingsRows[0].value) || 10 : 10;

    // === Санитарные дни ===
    const maxDate = addDays(minAllowedDate, 365);
    const [sanitaryDays] = await pool.query<RowDataPacket[]>(
      `SELECT date FROM sanitary_days WHERE colony = ? AND date >= ? AND date <= ?`,
      [
        colony,
        formatInTimeZone(minAllowedDate, timeZone, 'yyyy-MM-dd'),
        formatInTimeZone(maxDate, timeZone, 'yyyy-MM-dd'),
      ]
    );

    const sanitaryDates: Date[] = sanitaryDays
      .map((row) => {
        const raw = row.date;
        const dateStr = typeof raw === "string" ? raw.split("T")[0] : raw instanceof Date ? formatInTimeZone(raw, timeZone, 'yyyy-MM-dd') : null;
        if (!dateStr) return null;
        try {
          return toZonedTime(parseISO(dateStr), timeZone);
        } catch {
          return null;
        }
      })
      .filter((d): d is Date => d !== null);

    // === Проверка санитарных дней ===
    let isValid = true;
    for (let d = 0; d < duration; d++) {
      const day = addDays(selectedDate, d);
      if (sanitaryDates.some(s => isSameDay(s, day) || isSameDay(addDays(s, -1), day))) {
        isValid = false;
        break;
      }
    }

    // === Сокращение до 1 дня при конфликте ===
    if (!isValid && duration > 1) {
      duration = 1;
      finalVisitType = "short";
      isValid = true;
      for (let d = 0; d < duration; d++) {
        const day = addDays(selectedDate, d);
        if (sanitaryDates.some(s => isSameDay(s, day) || isSameDay(addDays(s, -1), day))) {
          isValid = false;
          break;
        }
      }
    }

    if (!isValid) {
      return NextResponse.json(
        { error: "Выбранная дата или предыдущий день — санитарный день" },
        { status: 400 }
      );
    }

    // === Проверка комнат ===
    let assignedRoomId: number | null = null;
    for (let roomId = 1; roomId <= rooms; roomId++) {
      let canFit = true;
      for (let d = 0; d < duration; d++) {
        const day = addDays(selectedDate, d);
        const dayStart = formatInTimeZone(day, timeZone, 'yyyy-MM-dd 00:00:00');
        const periodEnd = addDays(selectedDate, duration - 1);
        const periodEndStr = formatInTimeZone(periodEnd, timeZone, 'yyyy-MM-dd 23:59:59');

        const [occupied] = await pool.query<RowDataPacket[]>(
          `SELECT COUNT(*) as cnt FROM bookings 
           WHERE status = 'approved' AND room_id = ? AND colony = ?
           AND (
             (start_datetime <= ? AND end_datetime >= ?) OR
             (start_datetime <= ? AND end_datetime >= ?) OR
             (start_datetime >= ? AND end_datetime <= ?)
           )`,
          [
            roomId, colony,
            periodEndStr, dayStart,
            dayStart, periodEndStr,
            dayStart, periodEndStr,
          ]
        );

        if ((occupied[0] as { cnt: number }).cnt > 0) {
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
      return NextResponse.json(
        { error: "На выбранную дату все комнаты заняты" },
        { status: 400 }
      );
    }

    // === Обновление заявки ===
    const startStr = formatInTimeZone(selectedDate, timeZone, 'yyyy-MM-dd 00:00:00');
    const endDate = addDays(selectedDate, duration - 1);
    const endStr = formatInTimeZone(endDate, timeZone, 'yyyy-MM-dd 23:59:59');
    const nextAvailable = addDays(endDate, 52);
    const nextAvailableStr = formatInTimeZone(nextAvailable, timeZone, 'yyyy-MM-dd HH:mm:ss');

    await pool.query(
      `UPDATE bookings 
       SET status = 'approved', 
           start_datetime = ?, 
           end_datetime = ?, 
           room_id = ?, 
           visit_type = ?, 
           next_available_date = ? 
       WHERE id = ? AND colony = ?`,
      [startStr, endStr, assignedRoomId, finalVisitType, nextAvailableStr, bookingId, colony]
    );

    // === Уведомления ===
    const [adminRows] = await pool.query<RowDataPacket[]>(`SELECT group_id FROM \`groups\` WHERE id = ?`, [colony]);
    const adminChatId = adminRows[0]?.group_id as string | undefined;

    let relatives: Relative[] = [];
    try {
      relatives = JSON.parse(booking.relatives);
    } catch (e) {
      console.error("JSON parse error for relatives:", e);
    }
    const relativeName = relatives[0]?.full_name || "N/A";

    const lang = booking.language || "uz";

    // === Текст для группы ===
    const messageGroup = `
🎉 Ariza tasdiqlandi. Raqam: ${booking.colony_application_number}
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${formatInTimeZone(new Date(booking.created_at), timeZone, 'dd.MM.yyyy')}
⌚ Kelish sanasi: ${formatInTimeZone(selectedDate, timeZone, 'dd.MM.yyyy')}
🏛️ Koloniya: ${booking.colony}  
🚪 Xona: ${assignedRoomId}
🟢 Holat: Tasdiqlangan
`.trim();

    // === Текст для пользователя ===
    const visitTypeTextRu = finalVisitType === "short" ? "1-дневный" : finalVisitType === "long" ? "2-дневный" : "3-дневный";
    const visitTypeTextUzl = finalVisitType === "short" ? "1-kunlik" : finalVisitType === "long" ? "2-kunlik" : "3-kunlik";
    const visitTypeTextUz = finalVisitType === "short" ? "1-кунлик" : finalVisitType === "long" ? "2-кунлик" : "3-кунлик";

    const changedTextRu = finalVisitType !== booking.visit_type ? " (изменен на 1-дневный из-за санитарного дня)" : "";
    const changedTextUzl = finalVisitType !== booking.visit_type ? " (sanitariya kuni munosabati bilan 1-kunlikka o'zgartirilgan)" : "";
    const changedTextUz = finalVisitType !== booking.visit_type ? " (санитария куни муносабати билан 1-кунликка ўзгартирилган)" : "";

    let messageBot = "";

    if (lang === "ru") {
      messageBot = `
🎉 Заявка №${booking.colony_application_number} одобрена!
👤 Аризачи: ${relativeName}
📅 Дата подачи: ${formatInTimeZone(new Date(booking.created_at), timeZone, 'dd.MM.yyyy')}
⌚ Дата прибытия: ${formatInTimeZone(selectedDate, timeZone, 'dd.MM.yyyy')}
⏲️ Тип${changedTextRu}: ${visitTypeTextRu}
🏛️ Колония: ${booking.colony}
🚪 Комната: ${assignedRoomId}
🟢 Статус: Одобрено
`.trim();
    } else if (lang === "uzl") {
      messageBot = `
🎉 Ariza №${booking.colony_application_number} tasdiqlandi!
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${formatInTimeZone(new Date(booking.created_at), timeZone, 'dd.MM.yyyy')}
⌚ Kelish sanasi: ${formatInTimeZone(selectedDate, timeZone, 'dd.MM.yyyy')}
⏲️ Tur${changedTextUzl}: ${visitTypeTextUzl}
🏛️ Koloniya: ${booking.colony}
🚪 Xona: ${assignedRoomId}
🟢 Holat: Tasdiqlangan
`.trim();
    } else {
      messageBot = `
🎉 Ариза №${booking.colony_application_number} тасдиқланди!
👤 Аризачи: ${relativeName}
📅 Берилган сана: ${formatInTimeZone(new Date(booking.created_at), timeZone, 'dd.MM.yyyy')}
⌚ Келиш санаси: ${formatInTimeZone(selectedDate, timeZone, 'dd.MM.yyyy')}
⏲️ Тур${changedTextUz}: ${visitTypeTextUz}
🏛️ Колонија: ${booking.colony}
🚪 Хона: ${assignedRoomId}
🟢 Ҳолат: Тасдиқланган
`.trim();
    }

    // === Отправка в группу ===
    if (adminChatId) {
      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: adminChatId, text: messageGroup }),
        });
      } catch (err) {
        console.error("Ошибка отправки в группу:", err);
      }
    }

    // === Отправка пользователю ===
    if (booking.telegram_chat_id) {
      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: booking.telegram_chat_id, text: messageBot }),
        });
      } catch (err) {
        console.error("Ошибка отправки пользователю:", err);
      }
    }

    return NextResponse.json({
      success: true,
      startDate: startStr,
      roomId: assignedRoomId,
      visitType: finalVisitType,
    });
  } catch (err) {
    console.error("Xato /api/accept-booking:", err);
    return NextResponse.json(
      { status: 500 }
    );
  }
}