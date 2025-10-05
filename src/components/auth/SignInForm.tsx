"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import React, { useState } from "react";
import axios from "axios";
import { useCookies } from "react-cookie";
import { useRouter } from "next/navigation";

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [cookies, setCookie, removeCookie] = useCookies(["colony", "password@"]);
  const router = useRouter();
  
  removeCookie("colony");
  removeCookie("password@");

  const handleSubmit = async (e: React.FormEvent) => {  // Добавил async для удобства (если нужно await)
    e.preventDefault();
    console.log(cookies);
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await axios.post("/api/login", { id: +data.id, password: data.password });

      console.log("Успешный вход:", response.data.userId);
      setCookie("colony", data.id);
      setCookie("password@", data.password);
      router.push('/');
    } catch {
      console.error("Ошибка входа:");
      alert("Ошибка входа. Проверьте ID и пароль.");
      // Обработка ошибок (например, показать toast с ошибкой)
    }
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
                  <Input name="id" placeholder="24" type="text" />
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
                  {/* Убрал onClick — теперь сабмит через onSubmit формы */}
                  <button 
                    type="submit"
                    className="w-full bg-blue-light-700 hover:bg-blue-light-900 text-white py-3 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center" 
                  >
                    Войти
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}