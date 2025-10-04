"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import React, { useState } from "react";
import axios from "axios";

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    axios
      .post("/api/login", data)
      .then((response) => {
        console.log("Успешный вход:", response.data);
        // Дополнительные действия при успешном входе
      })
      .catch((error) => {
        console.error("Ошибка входа:", error.response?.data || error.message);
        // Обработка ошибок входа
      });
  };
  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Вход в систему
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Введите номер колонии и пароль!
            </p>
          </div>
          <div>

            <form onSubmit={handleSubmit} id="adminsignin">
              <div className="space-y-6">
                <div>
                  <Label>
                    Номер колонии <span className="text-error-500">*</span>{" "}
                  </Label>
                  <Input name="id" placeholder="info@gmail.com" type="text" />
                </div>
                <div>
                  <Label>
                    Пароль <span className="text-error-500">*</span>{" "}
                  </Label>
                  <div className="relative">
                    <Input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Введите ваш пароль"
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                      )}
                    </span>
                  </div>
                </div>
                <div>
                  <Button className="w-full" size="sm" onClick={() => {
                    (document.getElementById("adminsignin") as HTMLFormElement | null)?.submit();
                  }}>
                    Войти
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
