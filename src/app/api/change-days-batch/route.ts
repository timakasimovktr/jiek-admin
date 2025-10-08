// route/change-days-batch.ts

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

export async function POST(req: NextRequest) {
  try {
    const { count, days } = await req.json();
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

    if (typeof count !== "number" || count <= 0 || count > 50) {
      console.error("Invalid count:", count);
      return NextResponse.json(
        { error: "count talab qilinadi va 1 dan 50 gacha bo'lishi kerak" },
        { status: 400 }
      );
    }

    if (typeof days !== "number" || days < 1 || days > 3) {
      console.error("Invalid days:", days);
      return NextResponse.json(
        { error: "days talab qilinadi va 1 dan 3 gacha bo'lishi kerak" },
        { status: 400 }
      );
    }

    console.log("Received count from UI:", count); 
    console.log("Received days from UI:", days);

    const newVisitType: "short" | "long" | "extra" = days === 1 ? "short" : days === 2 ? "long" : "extra";

    const [pendingRows] = await pool.query<Booking[]>(
      `SELECT id, visit_type, created_at, relatives, telegram_chat_id, colony FROM bookings WHERE status = 'pending' AND colony = ? ORDER BY created_at ASC LIMIT ?`,
      [colony, count]
    );

    console.log("Pending bookings found:", pendingRows.length); 

    if (pendingRows.length === 0) {
      console.log("No pending bookings to process");
      return NextResponse.json({ message: "Kutilayotgan arizalar yo'q" }, { status: 200 });
    }

    let changedCount = 0; 
    const changedBookings: { bookingId: number; newDays: number; newVisitType: string }[] = [];

    for (const booking of pendingRows) {
      if (booking.visit_type === newVisitType) {
        console.log(`Skipping booking ${booking.id} - visit_type already ${newVisitType}`);
        continue;
      }

      await pool.query(
        `UPDATE bookings SET visit_type = ? WHERE id = ? AND colony = ?`,
        [newVisitType, booking.id, colony]
      );

      changedCount++;
      changedBookings.push({ bookingId: booking.id, newDays: days, newVisitType });

      let relatives: Relative[] = [];
      try {
        relatives = JSON.parse(booking.relatives);
      } catch (e) {
        console.error(`Failed to parse relatives for booking ${booking.id}:`, e);
      }
      const relativeName = relatives[0]?.full_name || "N/A";

      const messageBot = `
📝 Ariza №${booking.colony_application_number} kunlari o'zgartirildi!
👤 Arizachi: ${relativeName}
📅 Berilgan sana: ${new Date(booking.created_at).toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      })}
⏲️ Yangi tur: ${days}-kunlik
🏛️ Koloniya: ${booking.colony}
🟡 Holat: Kutilmoqda
`;

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
      `Batch processing completed: ${changedCount} bookings changed out of ${pendingRows.length}`
    );

    return NextResponse.json({ success: true, changedBookings, changedCount });
  } catch (err) {
    console.error("DB xatosi:", err);
    return NextResponse.json({ error: "DB xatosi" }, { status: 500 });
  }
}