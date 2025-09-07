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
import jsPDF from "jspdf";

interface Relative {
  full_name: string;
  passport: string;
}

interface Order {
  id: number;
  created_at: string;
  prisoner_name: string;
  relatives: Relative[];
  visit_type: string;
  status: string;
  user_id: number;
  start_datetime?: string;
  end_datetime?: string;
  rejection_reason?: string;
}

interface Booking {
  id: number;
  full_name: string;
  passport: string;
  visit_type: "short" | "long" | "extra";
  status: string;
  assigned_date_start?: string;
  assigned_date_end?: string;
}

export default function AllCallsTable() {
  const [tableData, setTableData] = useState<Order[]>([]);
  const [sortField, setSortField] = useState<keyof Order | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalType, setModalType] = useState<"view" | "reject" | "save" | null>(null);
  const [assignedDate, setAssignedDate] = useState("");
  const [rejectionReason, setRejectionReason] = useState("Qoidabuzarlik uchun!");
  const [approvedDays, setApprovedDays] = useState<number>(1);
  const [bookings, setBookings] = useState<Booking[]>([]);  
  const [rooms, setRooms] = useState<number>(1);

  const statusMap: Record<string, string> = {
    approved: "Принято",
    pending: "В ожидании",
    rejected: "Отклонено",
    canceled: "Отменено",
  };

  // Fetch data from API
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get("/api/bookings"); // твой API для получения всех заявок
      setTableData(res.data);
      const normalizedData = res.data.map((order: Order) => ({
        ...order,
        relatives: JSON.parse(order.relatives as unknown as string)
      }));
      console.log("Normalized data:", normalizedData);
      setTableData(normalizedData);
    } catch (err) {
      console.error(err);
    }
  };

  const statusOrder: Record<string, number> = {
    pending: 1,
    approved: 2,
    rejected: 3,
    canceled: 4,
  };

  // Сортировка
  const handleSort = (field: keyof Order) => {
  const direction = sortField === field && sortDirection === "asc" ? "desc" : "asc";

  const sorted = [...tableData].sort((a, b) => {
    let aValue: number | string | undefined = a[field] as number | string | undefined;
    let bValue: number | string | undefined = b[field] as number | string | undefined;

    if (field === "id") {
      aValue = Number(aValue);
      bValue = Number(bValue);
    }

    if (field === "created_at" || field === "start_datetime" || field === "end_datetime") {
      aValue = aValue ? new Date(aValue).getTime() : 0;
      bValue = bValue ? new Date(bValue).getTime() : 0;
    }

    if (field === "status") {
      aValue = statusOrder[a.status] || 99;
      bValue = statusOrder[b.status] || 99;
    }

    // Ensure aValue and bValue are not undefined
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


  // Принятие заявки
  const handleAccept = async () => {
    if (!selectedOrder || !assignedDate) return;
    try {
      await axios.post("/api/accept-booking", {
        bookingId: selectedOrder.id,
        assignedDate,
      });
      setModalType(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Отклонение заявки
  const handleReject = async () => {
    if (!selectedOrder || !rejectionReason) return;
    try {
      await axios.post("/api/reject-booking", {
        bookingId: selectedOrder.id,
        reason: rejectionReason,
      });
      setModalType(null);
      setRejectionReason("");
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Сохранение изменений
  const handleSave = async () => {
    if (!selectedOrder || !approvedDays) return;
    try {
      await axios.post("/api/save-booking", {
        bookingId: selectedOrder.id,
        approvedDays,
      });
      setModalType(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBookings = async () => {
    const { data } = await axios.get("/api/bookings");
    setBookings(data);
  };

  const handleAutoAccept = async () => {
    try {
      const { data } = await axios.post("/api/auto-accept", {
        roomsCount: rooms,
      });

      console.log("Schedule:", data.schedule);

      // перезагружаем заявки
      await fetchBookings();

      // тут же можно сделать пачку PDF (если хочешь)
      const pdf = new jsPDF();
      data.schedule.forEach((s, i) => {
        pdf.text(
          `${i + 1}. Заявка #${s.bookingId}\nДата: ${s.startDate} - ${s.endDate}`,
          10,
          20 + i * 20
        );
      });
      pdf.save("approved-bookings.pdf");
    } catch (err) {
      console.error("Auto-accept error:", err);
    }
  };

  // Печать PDF
  // PDF chiqarish
  const handlePrint = (order: Order) => {
    const doc = new jsPDF();

    // Sarlavha markazda
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Ariza №${order.id}`, 105, 20, { align: "center" });

    // Asosiy matn
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");

    let y = 40; // boshlang‘ich pozitsiya
    const lineHeight = 8;

    const addLine = (label: string, value?: string) => {
      const text = `${label}: ${value || "-"}`;
      const wrapped = doc.splitTextToSize(text, 170); // kenglik bo‘yicha bo‘lish
      doc.text(wrapped, 20, y);
      y += wrapped.length * lineHeight;
    };

    addLine("Berilgan sana", new Date(order.created_at).toLocaleString("uz-UZ"));
    addLine("Mahbus", order.prisoner_name);
    addLine("Tashrif turi", order.visit_type === "short" ? "1 kun" : "2 kun");
    if (order.start_datetime)
      addLine("Uchrashuv boshlanishi", new Date(order.start_datetime).toLocaleString("uz-UZ"));
    if (order.end_datetime)
      addLine("Uchrashuv tugashi", new Date(order.end_datetime).toLocaleString("uz-UZ"));
    if (order.rejection_reason) addLine("Rad etish sababi", order.rejection_reason);

    y += lineHeight;
    doc.setFont("helvetica", "bold");
    doc.text("Tashrif buyuruvchilar:", 20, y);
    doc.setFont("helvetica", "normal");
    y += lineHeight;

    if (Array.isArray(order.relatives) && order.relatives.length > 0) {
      order.relatives.forEach((r, i) => {
        const text = `${i + 1}) ${r.full_name}, Pasport: ${r.passport}`;
        const wrapped = doc.splitTextToSize(text, 160);
        doc.text(wrapped, 30, y);
        y += wrapped.length * lineHeight;
      });
    } else {
      doc.text("Ma'lumot yo‘q", 30, y);
    }

    // Faylni saqlash
    doc.save(`booking_${order.id}.pdf`);
  };

  // Минимальная дата через 10 дней
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 10);
  const minDateStr = minDate.toISOString().split("T")[0];

  useEffect(() => {
    fetchBookings();
  }, []);

  return (
    <>
    {/* панель действий */}
    <div className="flex justify-between mb-6">
      <div className="">Действия для заполнения</div>
      <div className="flex gap-2">
        <input
          type="number"
          className="border p-2 rounded-xl w-[100px]"
          placeholder="Комнаты"
          value={rooms}
          onChange={(e) => setRooms(Number(e.target.value))}
        />
        <Button size="xs" variant="outline">
          Печатать заявления
        </Button>
        <Button size="xs" variant="green" onClick={handleAutoAccept}>
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
                    onClick={() => handleSort("prisoner_name")}
                  >
                    Имя заключенного
                  </div>
                </TableCell>
                <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Длительность</TableCell>
                <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>
                  <div
                    className="cursor-pointer"
                    onClick={() => handleSort("status")}
                  >
                    Статус заявки
                  </div>
                </TableCell>
                <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Действия</TableCell>
                <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Дата свидания</TableCell>
                <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Печать</TableCell>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {tableData.map((order) => (
                <TableRow
                  key={order.id}
                  className={`${
                    order.status === "canceled"
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
                      {order.id}
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-3 text-black dark:text-white cursor-pointer">
                    {new Date(order.created_at).toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell className="px-5 py-3 text-black dark:text-white cursor-pointer">
  {Array.isArray(order.relatives) && order.relatives.length > 0
    ? order.relatives[0].full_name
    : "Нет данных"}
    
                  </TableCell>
                  <TableCell className="px-5 py-3 text-black dark:text-white cursor-pointer">{order.prisoner_name}</TableCell>
                  <TableCell className="px-5 py-3">
                    <Badge
                      size="sm"
                      color={order.visit_type === "short" ? "success" : order.visit_type === "long" ? "warning" : "primary"}
                    >
                      {order.visit_type === "short" ? "1 день" : order.visit_type === "long" ? "2 дня" : "3 дня"}
                    </Badge>
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
                  <TableCell className="px-5 py-3 flex gap-2">
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
                      disabled={order.status === "canceled"}
                      onClick={() => {
                        setSelectedOrder(order);
                        setModalType("reject");
                        setRejectionReason("Qoidabuzarlik uchun!");
                      }}
                    >
                      Отклонить
                    </Button>
                   
                  </TableCell>
                  <TableCell className="px-5 py-3 text-black dark:text-white">
                    {order.start_datetime && order.status !== "canceled"
                      ? new Date(order.start_datetime).toLocaleDateString("ru-RU")
                      : "Нет данных"}
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <Button size="xs" variant="primary" onClick={() => handlePrint(order)}>
                      Печатать
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Modal */}
      {selectedOrder && modalType && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-opacity"
          onClick={() => setModalType(null)} // Закрытие при клике на фон
        >
          <div
            className="bg-white dark:bg-gray-900 border-1 border-gray-700  p-6 rounded-xl max-w-lg w-full shadow-lg transform transition-all scale-100"
            onClick={(e) => e.stopPropagation()} // Чтобы клик по модалке не закрывал её
          >
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">
              Заявка #{selectedOrder.id}
            </h2>

            <div className="mb-4 space-y-2 text-gray-700 dark:text-gray-300">
              <p><strong>Заключенный:</strong> {selectedOrder.prisoner_name}</p>
              <p><strong>Тип визита:</strong> {selectedOrder.visit_type === "short" ? "1 день" : selectedOrder.visit_type === "long" ? "2 дня" : "3 дня"}</p>
              <p><strong>Статус:</strong> {statusMap[selectedOrder.status] || selectedOrder.status}</p>

              <div>
                <strong>Посетители:</strong>
                <ul className="ml-4 list-disc mt-1">
                  {Array.isArray(selectedOrder.relatives) && selectedOrder.relatives.length > 0 ? (
                    selectedOrder.relatives.map((r, i) => (
                      <li key={i}>
                        {r.full_name} (паспорт: {r.passport})
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
                <label className="font-medium text-black dark:text-white">Дата свидания (минимум через 10 дней):</label>
                <input
                  type="date"
                  className="border p-2 rounded w-full text-black dark:text-white"
                  value={assignedDate}
                  min={minDateStr}
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
                  Количество утвержденных дней для свидания:
                </label>
                <input
                  type="text"
                  className="border p-2 rounded w-full text-black dark:text-white"
                  value={approvedDays}
                  onChange={(e) => {
                    if(e.target.value.length > 4){
                      setApprovedDays(3);
                    }
                    setApprovedDays(Number(e.target.value));
                  }}
                />
                <div className="flex gap-2 mt-4">
                  <Button variant="green" onClick={() => {
                    if(approvedDays > 3) {alert("Максимум 3 дня"); return;}
                    handleSave();
                  }}>
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
