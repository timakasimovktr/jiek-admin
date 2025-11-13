"use client";
import React, { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import Badge from "../ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import axios from "axios";
import * as XLSX from "xlsx";
// import { saveAs } from "file-saver";
import { useRouter } from "next/navigation";

interface Relative {
  full_name: string;
  passport: string;
}

interface Order {
  id: number;
  created_at: string;
  prisoner_name: string;
  phone_number: string;
  relatives: Relative[];
  visit_type: "short" | "long" | "extra";
  status: "approved" | "pending" | "rejected" | "canceled";
  user_id: number;
  colony?: number;
  room_id?: number;
  start_datetime?: string;
  end_datetime?: string;
  rejection_reason?: string;
  colony_application_number?: string | number;
}

export default function AllCallsTable() {
  const [tableData, setTableData] = useState<Order[]>([]);
  const [sortField, setSortField] = useState<keyof Order | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalType, setModalType] = useState<"view" | "reject" | "save" | null>(null);
  const [assignedDate, setAssignedDate] = useState("");
  const [rejectionReason, setRejectionReason] = useState("Qoidalarni buzish!");
  const [approvedDays, setApprovedDays] = useState<number>(1);
  const [changeRoomsCount, setChangeRoomsCount] = useState<number>(1);
  const [roomsCount, setRoomsCount] = useState<number>(0);
  const [approvedDate, setApprovedDate] = useState("");
  const router = useRouter();

  const statusMap: Record<string, string> = {
    approved: "Подтверждено",
    pending: "Ожидание",
    rejected: "Отклонено",
    canceled: "Отменено",
  };

  const statusOrder: Record<string, number> = {
    pending: 1,
    approved: 2,
    rejected: 3,
    canceled: 4,
  };

  useEffect(() => {
    if (selectedOrder && modalType === "view") {
      const createdDate = new Date(selectedOrder.created_at);
      const min = new Date(createdDate);
      min.setDate(min.getDate() + 10);
      setAssignedDate(min.toISOString().split("T")[0]); // Default to min
    }
  }, [selectedOrder, modalType]);

  useEffect(() => {
    fetchData();
    fetchRoomsCount();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
      fetchRoomsCount();
    }, 300000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get("/api/bookings");
      const normalizedData = res.data.map((order: Order) => ({
        ...order,
        relatives: typeof order.relatives === "string" ? JSON.parse(order.relatives) : order.relatives,
      }));
      setTableData(normalizedData);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRoomsCount = async () => {
    try {
      const res = await axios.get("/api/rooms-count");
      const fetchedCount = res.data.count;
      setRoomsCount(fetchedCount);
    } catch (err) {
      console.error("Error fetching rooms count:", err);
    }
  };

  const saveRoomsCount = async () => {
    if (roomsCount <= 0 || roomsCount > 50) {
      alert("Количество комнат должно быть от 1 до 50");
      return;
    }
    try {
      await axios.post("/api/rooms-count", { count: roomsCount });
      fetchData();
    } catch (err) {
      console.error("Error saving rooms count:", err);
      alert("Ошибка сохранения");
    }
  };

  const handleSort = (field: keyof Order) => {
    const direction = sortField === field && sortDirection === "asc" ? "desc" : "asc";
    const sorted = [...tableData].sort((a, b) => {
      let aValue: number | string | undefined;
      let bValue: number | string | undefined;

      if (field === "relatives") {
        aValue = a.relatives[0]?.full_name || "";
        bValue = b.relatives[0]?.full_name || "";
      } else {
        aValue = a[field] as number | string | undefined;
        bValue = b[field] as number | string | undefined;
      }

      if (field === "id") {
        aValue = Number(aValue);
        bValue = Number(bValue);
      }

      if (field === "created_at" || field === "start_datetime" || field === "end_datetime") {
        aValue = aValue ? new Date(aValue as string).getTime() : 0;
        bValue = bValue ? new Date(bValue as string).getTime() : 0;
      }

      if (field === "status") {
        aValue = statusOrder[a.status] || 99;
        bValue = statusOrder[b.status] || 99;
      }

      const aComp = aValue ?? "";
      const bComp = bValue ?? "";

      if (aComp < bComp) return direction === "asc" ? -1 : 1;
      if (aComp > bComp) return direction === "asc" ? 1 : -1;
      return 0;
    });

    setSortField(field);
    setSortDirection(direction);
    setTableData(sorted);
  };

  const handleAccept = async () => {
    if (!selectedOrder || !assignedDate) {
      alert("Выберите дату!");
      return;
    }

    try {
      const res = await axios.post("/api/accept-single", {
        bookingId: selectedOrder.id,
        assignedDate, 
      });

      if (res.data.success) {
        alert(`Заявление принято на ${assignedDate}`);
        setModalType(null);
        fetchData();
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        alert(err.response.data.error);
      } else {
        alert("Ошибка при принятии заявления");
        console.error(err);
      }
    }
  };

  const handleReject = async () => {
    if (!selectedOrder || !rejectionReason) return;
    try {
      await axios.post("/api/reject-booking", {
        bookingId: selectedOrder.id,
        colony_application_number: selectedOrder.colony_application_number,
        reason: rejectionReason,
      });
      setModalType(null);
      setRejectionReason("");
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    if (!selectedOrder || !approvedDays) return;
    try {
      await axios.post("/api/save-booking", {
        bookingId: selectedOrder.id,
        colony_application_number: selectedOrder.colony_application_number,
        approvedDays,
      });
      setModalType(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const createExcel = (ws_data: string[][], filename: string, sheetName: string = "Sheet1") => {
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const getVisitTypeText = (visit_type: string) => {
    return visit_type === "short" ? "1 день" : visit_type === "long" ? "2 дня" : "3 дня";
  };

  const handlePrint = (order: Order) => {
    const relativesText = order.relatives.map((r) => r.full_name).join("\n");
    const ws_data = [
      [`Заявление №${order.colony_application_number}`],
      [],
      ["Номер заявления", String(order.colony_application_number)],
      ["Дата подачи", new Date(order.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })],
      ["Заключенный", order.prisoner_name],
      ["Тип посещения", getVisitTypeText(order.visit_type)],
      ...(order.rejection_reason ? [["Причина отклонения", order.rejection_reason]] : []),
      ["Посетители", relativesText],
      ["Телефон", `+${order.phone_number}`],
    ];

    createExcel(ws_data, `booking_${order.colony_application_number}.xlsx`, "Booking");
  };

  const handlePrintBatch = (status: "pending" | "approved", sliceCount: number | null = null) => {
    if (roomsCount <= 0) return;

    let orders = [...tableData]
      .filter((o) => o.status === status)
      .sort((a, b) => {
        const dateA = new Date(status === "approved" ? (a.start_datetime ?? a.created_at) : a.created_at).getTime();
        const dateB = new Date(status === "approved" ? (b.start_datetime ?? b.created_at) : b.created_at).getTime();

        if (dateA !== dateB) return dateA - dateB;

        const numA = Number(a.colony_application_number ?? 0);
        const numB = Number(b.colony_application_number ?? 0);
        return numA - numB;
      });

    if (sliceCount !== null) {
      orders = orders.slice(0, sliceCount);
    }

    if (orders.length === 0) return;

    const headers = [
      "Номер заявления",
      `${status === "approved" ? "Дата принятия" : "Дата подачи"}`,
      "Заключенный",
      "Тип посещения",
      "Посетители",
      "Телефон",
    ];

    const ws_data = [
      headers,
      ...orders.map((order) => [
        String(order.colony_application_number),
        new Date(status === "approved" ? (order.start_datetime ?? order.created_at) : order.created_at).toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric" }),
        order.prisoner_name,
        getVisitTypeText(order.visit_type),
        order.relatives.map((r) => r.full_name).join("\n"),
        `+${order.phone_number}`,
      ]),
    ];

    createExcel(ws_data, `batch_bookings_${status}.xlsx`, "Batch");
  };

  const handlePrintApprovedByDate = () => {
    if (!approvedDate) {
      alert("Выберите дату!");
      return;
    }

    // Приводим approvedDate к началу дня в Tashkent
    const selectedDate = new Date(approvedDate);
    selectedDate.setHours(0, 0, 0, 0);

    const filtered = tableData.filter((o) => {
      if (o.status !== "approved" || !o.start_datetime) return false;

      // Парсим start_datetime как дату в Tashkent
      const startDate = new Date(o.start_datetime);
      const startDateTashkent = new Date(
        startDate.toLocaleString("en-US", { timeZone: "Asia/Tashkent" })
      );
      startDateTashkent.setHours(0, 0, 0, 0);

      return startDateTashkent.getTime() === selectedDate.getTime();
    });

    if (filtered.length === 0) {
      alert("Нет подтвержденных заявлений на выбранную дату!");
      return;
    }

    // Сортировка по дате и номеру заявления
    const sorted = filtered.sort((a, b) => {
      const dateA = new Date(a.start_datetime!).getTime();
      const dateB = new Date(b.start_datetime!).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return Number(a.colony_application_number ?? 0) - Number(b.colony_application_number ?? 0);
    });

    const headers = ["№", "Заключенный", "Тип", "Посетители", "Телефон"];

    const ws_data = [
      [`Подтвержденные заявки на ${new Date(approvedDate).toLocaleDateString("ru-RU")}`],
      [],
      headers,
      ...sorted.map((order) => [
        String(order.colony_application_number ?? "-"),
        order.prisoner_name,
        getVisitTypeText(order.visit_type),
        order.relatives.map((r) => r.full_name).join("\n"),
        `+${order.phone_number}`,
      ]),
    ];

    createExcel(ws_data, `approved_bookings_${approvedDate}.xlsx`, "Approved");
  };

  const handleAcceptBatch = async () => {
    if (roomsCount <= 0) return;
    if (!confirm("Вы уверены, что хотите принять выбранные заявления?")) return;
    try {
      await axios.post("/api/accept-batch", { count: roomsCount });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangeSanitary = async () => {
    router.push("/sanitary");
  };

  const handleChangeDays = async () => {
    if (roomsCount <= 0) return;
    if (changeRoomsCount <= 0 || changeRoomsCount > 3) {
      alert("Количество дней должно быть от 1 до 3");
      return;
    }
    if (!confirm(`Вы уверены, что хотите изменить количество дней на ${changeRoomsCount} для выбранных ${roomsCount} заявлений?`)) return;
    try {
      await axios.post("/api/change-days-batch", { count: roomsCount, days: changeRoomsCount });
      fetchData();
      fetchRoomsCount();
    } catch (err) {
      console.error(err);
    }
  };

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 10);
  const minDateStr = minDate.toISOString().split("T")[0];

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-black dark:text-white flex">
          <div className="flex gap-2 align-middle justify-center">
            <input
              type="number"
              min="1"
              max="3"
              className="border p-2 rounded-xl w-[100px] text-black dark:text-white"
              placeholder="Дни (1-3)"
              value={changeRoomsCount}
              onChange={(e) => setChangeRoomsCount(Number(e.target.value))}
            />
            <Button size="xs" variant="primary" onClick={handleChangeDays}>
              Изменить дни для {roomsCount} заявлений
            </Button>
            <Button size="xs" variant="red" onClick={handleChangeSanitary}>
              Указать санитарные дни
            </Button>
          </div>
        </div>
        <div className="flex gap-2 h-[42px]">
          <Button size="xs" variant="yellow" onClick={() => handlePrintBatch("pending", null)}>
            Печать всех не принятых заявлений
          </Button>
          <Button size="xs" variant="primary" onClick={() => handlePrintBatch("approved", null)}>
            Печать всех принятых заявлений
          </Button>
        </div>
      </div>
      <div className="flex justify-between mb-3">
        <div className="text-black dark:text-white gap-2 flex">
          <input
            type="number"
            min="1"
            max="50"
            className="border p-2 rounded-xl w-[100px] text-black dark:text-white"
            placeholder="Комнаты"
            value={roomsCount}
            onChange={(e) => setRoomsCount(Number(e.target.value))}
            onBlur={saveRoomsCount}
          />
          <Button size="xs" variant="outline" onClick={fetchRoomsCount}>
            Обновить количество комнат
          </Button>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            className="border p-2 rounded-md text-black dark:text-white"
            value={approvedDate}
            onChange={(e) => setApprovedDate(e.target.value)}
          />
          <Button size="xs" variant="outline" onClick={handlePrintApprovedByDate}>
            Печать подтвержденных за день
          </Button>
          <Button size="xs" variant="outline" onClick={() => handlePrintBatch("pending", roomsCount)}>
            Печать первых {roomsCount} не принятых заявлений
          </Button>
          <Button size="xs" className="px-10" variant="green" onClick={handleAcceptBatch}>
            Принять заявления
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          <div className="min-w-[1102px]">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  <TableCell isHeader>
                    <div
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                      onClick={() => handleSort("id")}
                    >
                      ID
                    </div>
                  </TableCell>
                  <TableCell isHeader>
                    <div
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                      onClick={() => handleSort("created_at")}
                    >
                      Дата
                    </div>
                  </TableCell>
                  <TableCell isHeader>
                    <div
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                      onClick={() => handleSort("relatives")}
                    >
                      Имя заявителя
                    </div>
                  </TableCell>
                  <TableCell isHeader>
                    <div
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                    >
                      Телефон
                    </div>
                  </TableCell>
                  <TableCell isHeader>
                    <div
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                      onClick={() => handleSort("prisoner_name")}
                    >
                      Имя заключенного
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Продолжительность</TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Колония</TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Номер комнаты</TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>
                    <div
                      className="cursor-pointer"
                      onClick={() => handleSort("status")}
                    >
                      Статус заявления
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Действия для заполнения</TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Дата посещения</TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Печать</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {tableData.map((order) => (
                  <TableRow
                    key={order.id}
                    className={`${order.status === "canceled" || order.status === "rejected"
                        ? "bg-red-200 dark:bg-[#240101]"
                        : "hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                      }`}
                  >
                    <TableCell className="px-5 py-3 text-black dark:text-white cursor-pointer">
                      <div
                        onClick={() => {
                          setSelectedOrder(order);
                          setAssignedDate("");
                          setRejectionReason("");
                        }}
                        style={{ width: "100%", height: "100%" }}
                      >
                        {order.colony_application_number}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white cursor-pointer">
                      {new Date(order.created_at).toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent" })}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white">
                      {Array.isArray(order.relatives) && order.relatives.length > 0
                        ? order.relatives[0].full_name
                        : "Нет данных"}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white">{order.phone_number ? (order.phone_number.includes("+") ? order.phone_number : `+${order.phone_number}`) : "Нет данных"}</TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white text-wrap">{order.prisoner_name}</TableCell>
                    <TableCell className="px-5 py-3">
                      <Badge
                        size="sm"
                        color={order.visit_type === "short" ? "success" : order.visit_type === "long" ? "warning" : "primary"}
                      >
                        {order.visit_type === "short" ? "1 день" : order.visit_type === "long" ? "2 дня" : "3 дня"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white">
                      {order.colony} кол
                    </TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white">
                      {order.room_id ? order.room_id + " ком" : "-"}
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <Badge
                        size="sm"
                        color={
                          order.status === "approved"
                            ? "success"
                            : order.status === "pending"
                              ? "warning"
                              : "error"
                        }
                      >
                        {statusMap[order.status] || order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <div className="flex gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          className={order.status === "approved" ? "opacity-50 cursor-not-allowed" : ""}
                          disabled={order.status === "approved"}
                          onClick={() => {
                            setSelectedOrder(order);
                            setModalType("save");
                            setApprovedDays(order.visit_type === "short" ? 1 : order.visit_type === "long" ? 2 : 3);
                          }}
                        >
                          Изменить
                        </Button>
                        <Button
                          size="xs"
                          variant="green"
                          className={order.status === "approved" ? "opacity-50 cursor-not-allowed" : ""}
                          disabled={order.status === "approved"}
                          onClick={() => {
                            setSelectedOrder(order);
                            setModalType("view");
                          }}
                        >
                          Принять
                        </Button>
                        <Button
                          size="xs"
                          variant="red"
                          disabled={order.status === "canceled" || order.status === "rejected"}
                          onClick={() => {
                            setSelectedOrder(order);
                            setModalType("reject");
                            setRejectionReason("Qoidalarni buzish!");
                          }}
                        >
                          Отклонить
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white">
                      {order.start_datetime && order.status === "approved"
                        ? `${new Date(
                          new Date(order.start_datetime).getTime()
                        ).toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent" })}`
                        : "-"}
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <Button size="xs" variant="primary" onClick={() => handlePrint(order)}>
                        Печать
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        {selectedOrder && modalType && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-opacity"
            onClick={() => setModalType(null)}
          >
            <div
              className="bg-white dark:bg-gray-900 border-1 border-gray-700 p-6 rounded-xl max-w-lg w-full shadow-lg transform transition-all scale-100"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">
                Заявление #{selectedOrder.colony_application_number}
              </h2>
              <div className="mb-4 space-y-2 text-gray-700 dark:text-gray-300">
                <p><strong>Заключенный:</strong> {selectedOrder.prisoner_name}</p>
                <p><strong>Тип посещения:</strong> {selectedOrder.visit_type === "short" ? "1 день" : selectedOrder.visit_type === "long" ? "2 дня" : "3 дня"}</p>
                <p><strong>Статус:</strong> {statusMap[selectedOrder.status] || selectedOrder.status}</p>
                <div>
                  <strong>Посетители:</strong>
                  <ul className="ml-4 list-disc mt-1">
                    {Array.isArray(selectedOrder.relatives) && selectedOrder.relatives.length > 0 ? (
                      selectedOrder.relatives.map((r, i) => (
                        <li key={i}>
                          {r.full_name}
                        </li>
                      ))
                    ) : (
                      <li>Нет данных</li>
                    )}
                  </ul>
                </div>
              </div>
              {modalType === "view" && (
                <div className="flex flex-col gap-2">
                  <label className="font-medium text-black dark:text-white">
                    Дата посещения (не ранее 10 дней):
                  </label>
                  <input
                    type="date"
                    className="border p-2 rounded w-full text-black dark:text-white"
                    value={assignedDate}
                    min={selectedOrder ? new Date(new Date(selectedOrder.created_at).setDate(new Date(selectedOrder.created_at).getDate() + 10)).toISOString().split("T")[0] : minDateStr}
                    onChange={(e) => setAssignedDate(e.target.value)}
                  />
                  <div className="flex gap-2 mt-4">
                    <Button variant="green" onClick={handleAccept}>
                      Принять
                    </Button>
                    <Button variant="primary" onClick={() => setModalType(null)}>
                      Закрыть
                    </Button>
                  </div>
                </div>
              )}
              {modalType === "reject" && (
                <div className="flex flex-col text-black dark:text-white gap-2">
                  <label className="font-medium">Причина отклонения:</label>
                  <input
                    type="text"
                    className="border p-2 rounded w-full text-black dark:text-white"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />
                  <div className="flex gap-2 mt-4">
                    <Button variant="red" onClick={handleReject}>
                      Отклонить
                    </Button>
                    <Button variant="primary" onClick={() => setModalType(null)}>
                      Закрыть
                    </Button>
                  </div>
                </div>
              )}
              {modalType === "save" && (
                <div className="flex flex-col gap-2">
                  <label className="font-medium text-black dark:text-white">
                    Количество дней посещения:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3}
                    className="border p-2 rounded w-full text-black dark:text-white"
                    value={approvedDays}
                    onChange={(e) => setApprovedDays(Number(e.target.value))}
                  />
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="green"
                      onClick={() => {
                        if (approvedDays < 1 || approvedDays > 3) {
                          alert("Максимум 3 дня");
                          return;
                        }
                        handleSave();
                      }}
                    >
                      Сохранить
                    </Button>
                    <Button variant="red" onClick={() => setModalType(null)}>
                      Закрыть
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}