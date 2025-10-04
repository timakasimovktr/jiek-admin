"use client";
import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import { CookiesProvider } from "react-cookie";
import { ThemeProvider } from "@/context/ThemeContext";
import Link from "next/link";
import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CookiesProvider>
      <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
        <ThemeProvider>
          <div className="relative flex lg:flex-row w-full h-screen justify-center flex-col  dark:bg-gray-900 sm:p-0">
            {children}
            <div className="lg:w-1/2 w-full h-full bg-brand-950 dark:bg-white/5 lg:grid items-center hidden">
              <div className="relative items-center justify-center  flex z-1">
                {/* <!-- ===== Common Grid Shape Start ===== --> */}
                <GridShape />
                <div className="flex flex-col items-center max-w-xl">
                  <Link href="/" className="block mb-4 text-[40px] font-bold text-white dark:text-white/90">
                    SMARTMEET ADMIN
                  </Link>
                  <p className="text-center text-gray-400 dark:text-white/60">
                    
                  </p>
                </div>
              </div>
            </div>
            <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
              <ThemeTogglerTwo />
            </div>
          </div>
        </ThemeProvider>
      </div>
    </CookiesProvider>
  );
}
