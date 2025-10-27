"use client";
import React, { useEffect, useState } from "react";
import { GroupIcon } from "@/icons";
import axios from "axios";

export const EcommerceMetrics = () => {
  type EcommerceMetric = {
    id: number;
    phone_number: string;
    visit_type: string;
    prisoner_name: string;
    relatives: string;
    created_at: string;
    status: string;
    start_datetime: string | null;
    end_datetime: string | null;
    rejection_reason: string | null;
    user_id: number;
    telegram_chat_id: string;
  };

  const [info, setInfo] = useState<EcommerceMetric[]>([]);

  const getInfo = async () => {
    try {
      const response = await axios.get("/api/bookings");
      setInfo(Array.isArray(response.data) ? response.data : []);
    } catch {
      setInfo([]);
    }
  };

  useEffect(() => {
    getInfo();
  }, []);

//   [
    // {
    // "id": 164,
    // "phone_number": "998990510070",
    // "visit_type": "long",
    // "prisoner_name": "САША",
    // "relatives": "[{\"full_name\":\"ДИЛШОД\",\"passport\":\"АВ123456\"},{\"full_name\":\"ПАША\",\"passport\":\"МЕТИРКА\"}]",
    // "created_at": "2025-09-02T12:22:25.000Z",
    // "status": "approved",
    // "start_datetime": "2025-09-04T19:00:00.000Z",
    // "end_datetime": "2025-09-06T19:00:00.000Z",
    // "rejection_reason": null,
    // "user_id": 1239647560,
    // "telegram_chat_id": "1239647560"
    // },
    // {
    // "id": 166,
    // "phone_number": "998977590400",
    // "visit_type": "short",
    // "prisoner_name": "РАСММРО",
    // "relatives": "[{\"full_name\":\"ПАПРОООПА\",\"passport\":\"АА 1234567\"}]",
    // "created_at": "2025-09-02T13:05:00.000Z",
    // "status": "pending",
    // "start_datetime": null,
    // "end_datetime": null,
    // "rejection_reason": null,
    // "user_id": 967073403,
    // "telegram_chat_id": "967073403"
    // },
    // {
    // "id": 168,
    // "phone_number": "998990885853",
    // "visit_type": "long",
    // "prisoner_name": "РАСУЛОВ МУРОД РАСУЛОВИЧ",
    // "relatives": "[{\"full_name\":\"РАСУЛОВ РАСУЛ РАСУЛОВИЧ\",\"passport\":\"AB123456\"},{\"full_name\":\"РАСУЛОВ СУРАТ РАСУЛОВИЧ\",\"passport\":\"AB123456\"}]",
    // "created_at": "2025-09-02T13:08:51.000Z",
    // "status": "pending",
    // "start_datetime": null,
    // "end_datetime": null,
    // "rejection_reason": null,
    // "user_id": 1024084332,
    // "telegram_chat_id": "1024084332"
    // }
    // ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 md:gap-6">
      {/* <!-- Metric Item Start --> */}
      <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-3">
        <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
          <GroupIcon className="text-gray-800 size-6 dark:text-white/90" />
        </div>

        <div>
          <div className="flex items-center gap-4">
            <span className="text-md text-gray-500 dark:text-gray-400">
            Всех заявок
            </span>
            <h4 className="font-bold text-gray-800 text-title-sm dark:text-white/90">
              {info.length}
            </h4>
          </div>
          {/* <Badge color="success">
            <ArrowUpIcon />
            11.01%
          </Badge> */}
        </div>
      </div>
      <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-3">
        <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
          <GroupIcon className="text-gray-800 size-6 dark:text-white/90" />
        </div>

        <div className="flex items-end justify-between">
          <div className="flex items-center gap-4">
            <span className="text-md text-gray-500 dark:text-gray-400">
            Завершенных заявок  
            </span>
            <h4 className="font-bold text-gray-800 text-title-sm dark:text-white/90">
              {info.filter((item) => item.status === "approved").length}
            </h4>
          </div>
          {/* <Badge color="success">
            <ArrowUpIcon />
            11.01%
          </Badge> */}
        </div>
      </div>
      <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-3">
        <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800">
          <GroupIcon className="text-gray-800 size-6 dark:text-white/90" />
        </div>

        <div>
          <div className="flex items-center gap-4">
            <span className="text-md text-gray-500 dark:text-gray-400">
            Заявок в ожидании
            </span>
            <h4 className="font-bold text-gray-800 text-title-sm dark:text-white/90">
              {info.filter((item) => item.status === "pending").length}
            </h4>
          </div>
          {/* <Badge color="success">
            <ArrowUpIcon />
            11.01%
          </Badge> */}
        </div>
      </div>
      {/* <!-- Metric Item End --> */}

      
    </div>
  );
};
