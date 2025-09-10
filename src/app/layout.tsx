"use client";

import { Inter } from "next/font/google";
import "./globals.css";

import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { useEffect, useState } from "react";

const outfit = Inter({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const lastLogin = localStorage.getItem("lastLogin");

    if (lastLogin) {
      const lastLoginTime = new Date(lastLogin).getTime();
      const now = Date.now();

      // если прошло меньше 24 часов (86400000 мс) → доступ есть
      if (now - lastLoginTime < 24 * 60 * 60 * 1000) {
        setAuthorized(true);
        return;
      }
    }

    // если нет сохранённого входа или прошло больше суток → спрашиваем пароль
    const password = prompt("Введите пароль:");
    if (password === "Smartmeet2025") {
      localStorage.setItem("lastLogin", new Date().toISOString());
      setAuthorized(true);
    } else {
      alert("Неверный пароль!");
      window.location.href = "about:blank"; // блокируем доступ
    }
  }, []);

  if (!authorized) return null;

  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <SidebarProvider>{children}</SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
