"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const res = await fetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ user, pass }),
    });

    if (res.ok) {
      router.push("/"); // успешный логин → на главную
    } else {
      alert("Неверный логин или пароль");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
      <form
        onSubmit={handleLogin}
        className="bg-gray-800 p-6 rounded-2xl shadow-md flex flex-col gap-4 w-80"
      >
        <h1 className="text-xl font-bold">Вход</h1>
        <input
          type="text"
          placeholder="Логин"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          className="p-2 rounded bg-gray-700"
        />
        <input
          type="password"
          placeholder="Пароль"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className="p-2 rounded bg-gray-700"
        />
        <button
          type="submit"
          className="bg-blue-500 hover:bg-blue-600 p-2 rounded text-white"
        >
          Войти
        </button>
      </form>
    </div>
  );
}
