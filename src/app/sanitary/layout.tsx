"use client";

import Backdrop from "@/layout/Backdrop";
import AppHeader from "@/layout/AppHeader";
import { CookiesProvider } from "react-cookie";
import "./globals.css";
import React from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CookiesProvider>
      <div className="min-h-screen xl:flex">
        <Backdrop />
        <div
          className={`flex-1 transition-all  duration-300 ease-in-out ml-0`}
        >
          <AppHeader />
          <div className="p-4 mx-auto md:p-6">{children}</div>
        </div>
      </div>
    </CookiesProvider>
  );
}
