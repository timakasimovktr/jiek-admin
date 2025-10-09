import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";
import { RowDataPacket } from "mysql2/promise";
import { addDays, isSameDay, parseISO } from "date-fns";
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

export async function POST(req: NextRequest) {
  try {
    const { count } = await req.json();
    const cookieStore = await cookies();
    const colony = cookieStore.get("colony")?.value;

    if (!colony) {
      return NextResponse.json({ error: "Colony cookie not found" }, { status: 400 });
    }

    const [adminRows] = await pool.query<RowDataPacket[]>(
      `SELECT group_id FROM \`groups\` WHERE id = ?`,
      [colony]
    );

    if (!adminRows.length) {
      return NextResponse.json({ error: "Colony not found in groups table" }, { status: 400 });
    }

    const adminChatId = adminRows[0].group_id;

    if (typeof count !== "number" || count <= 0 || count > 50) {
      console.error("Invalid count:", count);
      return NextResponse.json(
        { error: "Count must be between 1 and 50" },
        { status: 400 }
      );
    }

    console.log("Received count from UI:", count);

    const [settingsRows] = await pool.query<SettingsRow[]>(
      `SELECT value FROM settings WHERE \`key\` = 'rooms_count${colony}'`
    );

    if (!settingsRows.length) {
      return NextResponse.json({ error: `rooms_count${colony} setting not found` }, { status: 400 });
    }

    const rooms = Number(settingsRows[0].value) || 10;
    console.log("Rooms count from DB:", rooms);

    if (rooms !== count) {
      console.warn(`Mismatch detected: UI count=${count}, DB rooms=${rooms}`);
    }

    const [pendingRows] = await pool.query<Booking[]>(
      `SELECT id, visit_type, created_at, relatives, telegram_chat_id, colony, colony_application_number 
       FROM bookings 
       WHERE status = 'pending' AND colony = ? 
       ORDER BY created_at ASC LIMIT ?`,
      [colony, count]
    );

    console.log("Pending bookings found:", pendingRows.length);

    if (pendingRows.length === 0) {
      console.log("No pending bookings to process");
      return NextResponse.json({ message: "No pending bookings" }, { status: 200 });
    }

    let assignedCount = 0;
    const assignedBookings: { bookingId: number; startDate: string; roomId: number; newVisitType?: string }[] = [];

    for (const booking of pendingRows) {
      let duration = booking.visit_type === "short" ? 1 : booking.visit_type === "long" ? 2 : 3;
      let newVisitType: "short" | "long" | "extra" = booking.visit_type;
      const timeZone = "Asia/Tashkent";
      const createdDateZoned = toZonedTime(new Date(booking.created_at), timeZone);
      const minDate = addDays(createdDateZoned, 10);
      const maxDate = addDays(minDate, 60);
      let start = new Date(minDate);
      let found = false;
      let assignedRoomId: number | null = null;

      // Fetch sanitary days
      const [sanitaryDays] = await pool.query<RowDataPacket[]>(
        `SELECT date FROM sanitary_days WHERE colony = ? AND date >= ? AND date <= ? ORDER BY date`,
        [colony, minDate.toISOString().slice(0, 10), maxDate.toISOString().slice(0, 10)]
      );

      // Validate and parse sanitary days
      const sanitaryDates = sanitaryDays
        .map(row => {
          if (typeof row.date !== 'string' || !row.date) {
            console.warn(`Invalid date in sanitary_days for colony ${colony}:`, row.date);
            return null;
          }
          try {
            const parsedDate = parseISO(row.date);
            if (isNaN(parsedDate.getTime())) {
              console.warn(`Invalid date format in sanitary_days for colony ${colony}: ${row.date}`);
              return null;
            }
            return parsedDate;
          } catch (e) {
            console.error(`Failed to parse date ${row.date} for booking ${booking.id}:`, e);
            return null;
          }
        })
        .filter((date): date is Date => date !== null);

      console.log(`Booking ${booking.id} (type: ${booking.visit_type}): Sanitary days`, sanitaryDates.map(d => d.toISOString().slice(0, 10)));

      for (let tries = 0; tries < 60 && !found && start <= maxDate; tries++) {
        let isValidDate = true;
        let adjustedDuration = duration;

        // Check if the booking period or the day before conflicts with sanitary days
        for (let d = -1; d < duration; d++) { // Include day before
          const day = addDays(start, d);
          if (sanitaryDates.some(sanitary => isSameDay(sanitary, day))) {
            isValidDate = false;
            break;
          }
        }

        // If invalid, try reducing duration to 1 for long/extra visits
        if (!isValidDate && duration > 1) {
          adjustedDuration = 1;
          newVisitType = "short";
          isValidDate = true;
          // Recheck with adjusted duration
          for (let d = -1; d < adjustedDuration; d++) {
            const day = addDays(start, d);
            if (sanitaryDates.some(sanitary => isSameDay(sanitary, day))) {
              isValidDate = false;
              break;
            }
          }
        }

        // If still invalid, skip to after the sanitary period
        if (!isValidDate) {
          const conflictingSanitary = sanitaryDates.find(sanitary => sanitary >= start);
          if (conflictingSanitary) {
            const sanitaryEnd = addDays(conflictingSanitary, 1);
            start = sanitaryEnd > minDate ? sanitaryEnd : minDate;
            console.log(`Booking ${booking.id}: Adjusted start to ${start.toISOString().slice(0, 10)} after sanitary day`);
          } else {
            start = addDays(start, 1);
          }
          continue;
        }

        // Check room availability
        for (let roomId = 1; roomId <= rooms; roomId++) {
          let canFit = true;
          for (let d = 0; d < adjustedDuration; d++) {
            const day = addDays(start, d);
            const dayStart = day.toISOString().slice(0, 10) + " 00:00:00";
            const dayEnd = day.toISOString().slice(0, 10) + " 23:59:59";
            const endDay = addDays(start, adjustedDuration - 1);

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
              [roomId, colony, dayEnd, dayStart, dayStart, dayEnd, dayStart, endDay]
            );

            if (occupiedRows[0].cnt > 0) {
              canFit = false;
              console.log(`Booking ${booking.id}: Room ${roomId} occupied on ${day.toISOString().slice(0, 10)}`);
              break;
            }
          }
          if (canFit) {
            found = true;
            assignedRoomId = roomId;
            duration = adjustedDuration; // Update duration if changed
            console.log(
              `Assigned room ${roomId} for booking ${booking.id} on ${start.toISOString().slice(0, 10)} (duration: ${duration} day(s), type: ${newVisitType})`
            );
            break;
          }
        }

        if (!found) {
          start = addDays(start, 1);
        }
      }

      if (!found || assignedRoomId === null) {
        console.warn(`No room found for booking ${booking.id} after 60 tries`);
        continue;
      }

      // Update booking
      const startStr = start.toISOString().slice(0, 10) + " 00:00:00";
      const endStr = addDays(start, duration - 1).toISOString().slice(0, 10) + " 23:59:59";

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
        console.error(`Failed to parse relatives for booking ${booking.id}:`, e);
      }
      const relativeName = relatives[0]?.full_name || "N/A";

      const messageGroup = `
🎉 Booking approved. Number: ${booking.colony_application_number}
👤 Applicant: ${relativeName}
📅 Submitted: ${new Date(booking.created_at).toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      })}
⌚ Visit date: ${start.toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      })}
🏛️ Colony: ${booking.colony}  
🚪 Room: ${assignedRoomId}
🟢 Status: Approved
`;

      const messageBot = `
🎉 Booking №${booking.colony_application_number} approved!
👤 Applicant: ${relativeName}
📅 Submitted: ${new Date(booking.created_at).toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      })}
⌚ Visit date: ${start.toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tashkent",
      })}
⏲️ Type${newVisitType !== booking.visit_type ? ` (changed to 1-day due to sanitary day)` : `: ${newVisitType === "long" ? "2-day" : newVisitType === "short" ? "1-day" : "3-day"}`}
🏛️ Colony: ${booking.colony}
🚪 Room: ${assignedRoomId}
🟢 Status: Approved
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
    console.error("Database error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}