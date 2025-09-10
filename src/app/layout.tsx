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
    const password = prompt("Введите пароль:");
    if (password === "Smartmeet2025") {
      setAuthorized(true);
    } else {
      alert("Неверный пароль!");
      window.location.href = "about:blank"; // закрыть доступ
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
