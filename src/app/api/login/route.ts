// api/login/route.ts

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2/promise";
import { cookies } from "next/headers";

// const ADMIN_CHAT_ID = "-1003014693175";

interface BookingRow extends RowDataPacket {
  prisoner_name: string;
  created_at: string;
  relatives: string;
  telegram_chat_id?: string;
}

export async function POST(req: NextRequest) {
    try {
        const { id, password } = await req.json();
        const cookieStore = await cookies();
        const colony = cookieStore.get("colony")?.value;

        if (!colony) {
            return NextResponse.json({ error: "colony cookie topilmadi" }, { status: 400 });
        }
        if (!id || !password) {
            return NextResponse.json({ error: "id и password обязательны" }, { status: 400 });
        }

        const [rows] = await pool.query<BookingRow[]>(
            "SELECT id FROM admin WHERE id = ? AND colony = ? AND password = ?",
            [id, colony, password]
        );

        if (rows.length === 0) {
            return NextResponse.json({ error: "Неверный ID или пароль" }, { status: 401 });
        }

        return NextResponse.json({ message: "Успешный вход", userId: rows[0].id }, { status: 200 });
    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
