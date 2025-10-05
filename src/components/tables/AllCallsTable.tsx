  "use client";
  import React, {useEffect, useState } from "react";
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
  import { Document, Packer, Paragraph, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, TextRun, WidthType } from "docx";
  import { saveAs } from "file-saver";

  interface Relative {
    full_name: string;
    passport: string;
  }

  interface Order {
    id: number;
    created_at: string;
    prisoner_name: string;
    relatives: Relative[];
    visit_type: "short" | "long" | "extra";
    status: "approved" | "pending" | "rejected" | "canceled";
    user_id: number;
    colony?: number;
    room_id?: number;
    start_datetime?: string;
    end_datetime?: string;
    rejection_reason?: string;
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
    const [roomsCount, setRoomsCount] = useState<number>(0);

    const statusMap: Record<string, string> = {
      approved: "Подтверждено",
      pending: "В ожидании",
      rejected: "Отклонено",
      canceled: "Отменено",
    };

    useEffect(() => {
      fetchData();
      fetchRoomsCount();
    }, []);

    useEffect(() => {
      setInterval(fetchData, 60000); // Обновление каждые 60 секунд  
      setInterval(fetchRoomsCount, 60000); // Обновление каждые 60 секунд  
    }, []);

    const fetchData = async () => {
      try {
        const res = await axios.get("/api/bookings");
        const normalizedData = res.data.map((order: Order) => ({
          ...order,
          relatives: JSON.parse(order.relatives as unknown as string),
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
        console.log("Fetched rooms count from API:", fetchedCount); // Лог для отладки
        setRoomsCount(fetchedCount);
      } catch (err) {
        console.error("Error fetching rooms count:", err);
      }
    };

  const saveRoomsCount = async () => {
    if (roomsCount <= 0 || roomsCount > 50) { // Добавьте разумный max, напр. 50
      alert("Количество комнат должно быть от 1 до 50");
      return;
    }
    try {
      await axios.post("/api/rooms-count", { count: roomsCount });
      console.log("Saved rooms count:", roomsCount); // Лог
      // Опционально: перезагрузить данные после сохранения
      // fetchData();
    } catch (err) {
      console.error("Error saving rooms count:", err);
      alert("Ошибка сохранения");
    }
  };


    const statusOrder: Record<string, number> = {
      pending: 1,
      approved: 2,
      rejected: 3,
      canceled: 4,
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

    const handlePrint = (order: Order) => {
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Заявление №${order.id}`,
                    bold: true,
                    size: 24,
                    font: "Arial",
                  }),
                ],
                spacing: { after: 200 },
                alignment: "center",
              }),
              new DocxTable({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new DocxTableRow({
                    children: [
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: "Дата подачи", bold: true, size: 20, font: "Arial" })] })],
                      }),
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: new Date(order.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }), size: 20, font: "Arial" })] })],
                      }),
                    ],
                  }),
                  new DocxTableRow({
                    children: [
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: "Заключенный", bold: true, size: 20, font: "Arial" })] })],
                      }),
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: order.prisoner_name, size: 20, font: "Arial" })] })],
                      }),
                    ],
                  }),
                  new DocxTableRow({
                    children: [
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: "Тип посещения", bold: true, size: 20, font: "Arial" })] })],
                      }),
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: order.visit_type === "short" ? "1 день" : order.visit_type === "long" ? "2 дня" : "3 дня", size: 20, font: "Arial" })] })],
                      }),
                    ],
                  }),
                  ...(order.rejection_reason
                    ? [new DocxTableRow({
                        children: [
                          new DocxTableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: "Причина отклонения", bold: true, size: 20, font: "Arial" })] })],
                          }),
                          new DocxTableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: order.rejection_reason, size: 20, font: "Arial" })] })],
                          }),
                        ],
                      })]
                    : []),
                  new DocxTableRow({
                    children: [
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: "Посетители", bold: true, size: 20, font: "Arial" })] })],
                      }),
                      new DocxTableCell({
                        children: order.relatives.map(
                          (r, i) =>
                            new Paragraph({
                              children: [new TextRun({ text: `${i + 1}) ${r.full_name}, Паспорт: ${r.passport}`, size: 20, font: "Arial" })],
                              spacing: { after: 100 },
                            })
                        ),
                      }),
                    ],
                  }),
                ],
              }),
            ],
          },
        ],
      });

      Packer.toBlob(doc).then((blob) => {
        saveAs(blob, `booking_${order.id}.docx`);
      });
    };

    const handlePrintBatch = async () => {
      if (roomsCount <= 0) return;

      const pending = [...tableData]
        .filter((o) => o.status === "pending")
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(0, roomsCount);

      if (pending.length === 0) return;

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: pending.flatMap((order) => [
              
              new DocxTable({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new DocxTableRow({
                    children: [
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: "Дата подачи", bold: true, size: 20, font: "Arial" })] })],
                      }),
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: new Date(order.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }), size: 20, font: "Arial" })] })],
                      }),
                    ],
                  }),
                  new DocxTableRow({
                    children: [
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: "Заключенный", bold: true, size: 20, font: "Arial" })] })],
                      }),
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: order.prisoner_name, size: 20, font: "Arial" })] })],
                      }),
                    ],
                  }),
                  new DocxTableRow({
                    children: [
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: "Тип посещения", bold: true, size: 20, font: "Arial" })] })],
                      }),
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: order.visit_type === "short" ? "1 день" : order.visit_type === "long" ? "2 дня" : "3 дня", size: 20, font: "Arial" })] })],
                      }),
                    ],
                  }),
                  new DocxTableRow({
                    children: [
                      new DocxTableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: "Посетители", bold: true, size: 20, font: "Arial" })] })],
                      }),
                      new DocxTableCell({
                        children: order.relatives.map(
                          (r, i) =>
                            new Paragraph({
                              children: [new TextRun({ text: `${i + 1}) ${r.full_name}, Паспорт: ${r.passport}`, size: 20, font: "Arial" })],
                              spacing: { after: 100 },
                            })
                        ),
                      }),
                    ],
                  }),
                ],
              }),
              new Paragraph({ children: [], spacing: { after: 200 } }),
            ]),
          },
        ],
      });

      Packer.toBlob(doc).then((blob) => {
        saveAs(blob, `batch_bookings.docx`);
      });
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

    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 10);
    const minDateStr = minDate.toISOString().split("T")[0];

    return (
      <>
        <div className="flex justify-between mb-6">
          <div className="text-black dark:text-white">Действия для заполнения</div>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              max="50" // Добавьте max для валидации
              className="border p-2 rounded-xl w-[100px]"
              placeholder="Комнаты"
              value={roomsCount}
              onChange={(e) => setRoomsCount(Number(e.target.value))}
              onBlur={saveRoomsCount}
            />
            <Button size="xs" variant="outline" onClick={fetchRoomsCount}>
              Обновить количество комнат
            </Button>
            <Button size="xs" variant="outline" onClick={handlePrintBatch}>
              Печать заявлений
            </Button>
            <Button size="xs" variant="green" onClick={handleAcceptBatch}>
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
                      className={`${
                        order.status === "canceled" || order.status === "rejected"
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
                        {new Date(order.created_at).toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent" })}
                      </TableCell>
                      <TableCell className="px-5 py-3 text-black dark:text-white">
                        {Array.isArray(order.relatives) && order.relatives.length > 0
                          ? order.relatives[0].full_name
                          : "Нет данных"}
                      </TableCell>
                      <TableCell className="px-5 py-3 text-black dark:text-white">{order.prisoner_name}</TableCell>
                      <TableCell className="px-5 py-3">
                        <Badge
                          size="sm"
                          color={order.visit_type === "short" ? "success" : order.visit_type === "long" ? "warning" : "primary"}
                        >
                          {order.visit_type === "short" ? "1 день" : order.visit_type === "long" ? "2 дня" : "3 дня"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-3 text-black dark:text-white">
                        {order.colony} колония
                      </TableCell>
                      <TableCell className="px-5 py-3 text-black dark:text-white">
                        {order.room_id} комната
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
                          disabled={order.status === "canceled" || order.status === "rejected"}
                          onClick={() => {
                            setSelectedOrder(order);
                            setModalType("reject");
                            setRejectionReason("Qoidalarni buzish!");
                          }}
                        >
                          Отклонить
                        </Button>
                      </TableCell>
                      <TableCell className="px-5 py-3 text-black dark:text-white">
                        {order.start_datetime && order.status === "approved"
                          ? `${new Date(
                                new Date(order.start_datetime).getTime() + 1 * 24 * 60 * 60 * 1000 // +1 день только к начальной
                              ).toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent" })}`
                          : "Нет данных"}

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
                  Заявление #{selectedOrder.id}
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
                    <label className="font-medium text-black dark:text-white">
                      Дата посещения (не ранее 10 дней):
                    </label>
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