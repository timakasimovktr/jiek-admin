import pool from "@/lib/db";
import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN as string);

// утилита: добавляем дни
function addDays(date: Date, days: number) {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

// утилита: форматируем дату для БД (YYYY-MM-DD)
function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

// автораспределение
type ScheduleItem = {
  bookingId: number;
  telegram_id: string;
  startDate: string;
  endDate: string;
};

type Booking = {
  id: number;
  telegram_id: string;
  visit_type: string;
  // add other fields if needed
};

function autoAssign(bookings: Booking[], rooms: number, startDate: Date) {
  const schedule: ScheduleItem[] = [];
  let currentDay = new Date(startDate);
  const roomUsage: Record<string, number> = {};

  for (const booking of bookings) {
    const duration = booking.visit_type === "short" ? 1 : 2;

    while (true) {
      let isFree = true;

      // проверяем все дни для текущей заявки
      for (let d = 0; d < duration; d++) {
        const dateKey = formatDate(addDays(currentDay, d));
        if ((roomUsage[dateKey] || 0) >= rooms) {
          isFree = false;
          break;
        }
      }

      if (isFree) {
        for (let d = 0; d < duration; d++) {
          const dateKey = formatDate(addDays(currentDay, d));
          roomUsage[dateKey] = (roomUsage[dateKey] || 0) + 1;
        }

        schedule.push({
          bookingId: booking.id,
          telegram_id: booking.telegram_id,
          startDate: formatDate(currentDay),
          endDate: formatDate(addDays(currentDay, duration - 1)),
        });
        break;
      } else {
        currentDay = addDays(currentDay, 1);
      }
    }
  }

  return schedule;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { roomsCount } = req.body;
    if (!roomsCount) {
      return res.status(400).json({ error: "roomsCount required" });
    }

    // достаём pending заявки
    const [pendingBookingsRows] = await pool.query(
      "SELECT * FROM bookings WHERE status = 'pending' ORDER BY created_at ASC"
    );

    // стартовая дата = сегодня + 10 дней
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 10);

    // вызываем функцию распределения
    const schedule = autoAssign(pendingBookingsRows as Booking[], roomsCount, startDate);

    for (const s of schedule) {
      await pool.query(
        "UPDATE bookings SET assigned_date_start=?, assigned_date_end=?, status='approved' WHERE id=?",
        [s.startDate, s.endDate, s.bookingId]
      );

      // уведомление пользователю
      await bot.telegram.sendMessage(
        s.telegram_id,
        `✅ Ваша заявка одобрена.\nДата: ${s.startDate} - ${s.endDate}`
      );
    }

    res.json({ success: true, schedule });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
