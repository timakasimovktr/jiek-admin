//   const handleSave = async () => {
//     if (!selectedOrder || !approvedDays) return;
//     try {
//       await axios.post("/api/save-booking", {
//         bookingId: selectedOrder.id,
//         approvedDays,
//       });
//       setModalType(null);
//       fetchData();
//     } catch (err) {
//       console.error(err);
//     }
//   };

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import axios from "axios";

const BOT_TOKEN = process.env.BOT_TOKEN;

export async function POST(req: NextRequest) {
    try {
        const { bookingId, approvedDays } = await req.json();

        if (!bookingId || !approvedDays) {
            return NextResponse.json({ error: "bookingId и approvedDays обязательны" }, { status: 400 });
        }

        // Получаем данные заявки
        const [rows] = await pool.query(
            "SELECT visit_type, prisoner_name, created_at, relatives, telegram_chat_id FROM bookings WHERE id=?",
            [bookingId]
        );

        type BookingRow = {
            visit_type: string;
            prisoner_name: string;
            created_at: string;
            relatives: string;
            telegram_chat_id: string | null;
        };

        const bookingRows = rows as BookingRow[];
        if (bookingRows.length === 0) {
            return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
        }

        // Здесь можно добавить логику для сохранения изменений в базе данных

        // Маппинг дней в enum
        const visitTypeMap: Record<number, string> = {
        1: "short",
        2: "long",
        3: "extra",
        };

        const visitType = visitTypeMap[approvedDays];

        if (!visitType) {
        throw new Error(`Неверное количество дней: ${approvedDays}`);
        }

        await pool.query(
            "UPDATE bookings SET visit_type = ? WHERE id = ?",
            [visitType, bookingId]
        );


        // Отправка уведомления в Telegram
        // await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        //     chat_id: ADMIN_CHAT_ID,
        //     text: `Заявка №${bookingId} была обновлена. Одобрено дней: ${approvedDays}`,
        // });

        if (bookingRows[0].telegram_chat_id) {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: bookingRows[0].telegram_chat_id,
                text: `Sizning arizangiz №${bookingId} yangilandi. Tasdiqlangan kunlar: ${approvedDays}`,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Ошибка при сохранении заявки:", error);
        return NextResponse.json({ success: false, error: "Ошибка при сохранении заявки" });
    }
}