// tables/AllCallsTable.tsx

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
import { Document, Packer, Paragraph, TextRun } from "docx";
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
  const [rejectionReason, setRejectionReason] = useState("Qoidabuzarlik uchun!");
  const [approvedDays, setApprovedDays] = useState<number>(1);
  const [roomsCount, setRoomsCount] = useState<number>(0);

  const statusMap: Record<string, string> = {
    approved: "Tasdiqlangan",
    pending: "Kutishda",
    rejected: "Rad etilgan",
    canceled: "Bekor qilingan",
  };

  useEffect(() => {
    fetchData();
    fetchRoomsCount();
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
      setRoomsCount(res.data.count);
    } catch (err) {
      console.error(err);
    }
  };

  const saveRoomsCount = async () => {
    try {
      await axios.post("/api/rooms-count", { count: roomsCount });
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
                  text: `Ariza №${order.id}`,
                  bold: true,
                  size: 32,
                  font: "Arial",
                }),
              ],
              spacing: { after: 200 },
              alignment: "center",
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Berilgan sana: ${new Date(order.created_at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`,
                  size: 24,
                  font: "Arial",
                }),
              ],
              spacing: { after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Mahbus: ${order.prisoner_name}`,
                  size: 24,
                  font: "Arial",
                }),
              ],
              spacing: { after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Tashrif turi: ${order.visit_type === "short" ? "1 kun" : order.visit_type === "long" ? "2 kun" : "3 kun"}`,
                  size: 24,
                  font: "Arial",
                }),
              ],
              spacing: { after: 100 },
            }),
            ...(order.start_datetime
              ? [new Paragraph({
                  children: [
                    new TextRun({
                      text: `Uchrashuv boshlanishi: ${new Date(order.start_datetime).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`,
                      size: 24,
                      font: "Arial",
                    }),
                  ],
                  spacing: { after: 100 },
                })]
              : []),
            ...(order.end_datetime
              ? [new Paragraph({
                  children: [
                    new TextRun({
                      text: `Uchrashuv tugashi: ${new Date(order.end_datetime).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`,
                      size: 24,
                      font: "Arial",
                    }),
                  ],
                  spacing: { after: 100 },
                })]
              : []),
            ...(order.rejection_reason
              ? [new Paragraph({
                  children: [
                    new TextRun({
                      text: `Rad etish sababi: ${order.rejection_reason}`,
                      size: 24,
                      font: "Arial",
                    }),
                  ],
                  spacing: { after: 100 },
                })]
              : []),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Tashrif buyuruvchilar:",
                  bold: true,
                  size: 24,
                  font: "Arial",
                }),
              ],
              spacing: { after: 100 },
            }),
            ...order.relatives.map(
              (r, i) =>
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${i + 1}) ${r.full_name}, Pasport: ${r.passport}`,
                      size: 24,
                      font: "Arial",
                    }),
                  ],
                  spacing: { after: 100 },
                })
            ),
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
          children: pending.flatMap((order) => {
            return [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Ariza №${order.id}`,
                    bold: true,
                    size: 32,
                    font: "Arial",
                  }),
                ],
                spacing: { after: 200 },
                alignment: "center",
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Berilgan sana: ${new Date(order.created_at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`,
                    size: 24,
                    font: "Arial",
                  }),
                ],
                spacing: { after: 100 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Mahbus: ${order.prisoner_name}`,
                    size: 24,
                    font: "Arial",
                  }),
                ],
                spacing: { after: 100 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Tashrif turi: ${order.visit_type === "short" ? "1 kun" : order.visit_type === "long" ? "2 kun" : "3 kun"}`,
                    size: 24,
                    font: "Arial",
                  }),
                ],
                spacing: { after: 100 },
              }),             
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Tashrif buyuruvchilar:",
                    bold: true,
                    size: 24,
                    font: "Arial",
                  }),
                ],
                spacing: { after: 100 },
              }),
              ...order.relatives.map(
                (r, i) =>
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${i + 1}) ${r.full_name}, Pasport: ${r.passport}`,
                        size: 24,
                        font: "Arial",
                      }),
                    ],
                    spacing: { after: 100 },
                  })
              ),
              new Paragraph({
                children: [],
                spacing: { after: 200 },
              }),
            ];
          }),
        },
      ],
    });

    Packer.toBlob(doc).then((blob) => {
      saveAs(blob, `batch_bookings.docx`);
    });
  };

  const handleAcceptBatch = async () => {
    if (roomsCount <= 0) return;
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
        <div className="">Amallar</div>
        <div className="flex gap-2">
          <input
            type="number"
            className="border p-2 rounded-xl w-[100px]"
            placeholder="Xonalar"
            value={roomsCount}
            onChange={(e) => setRoomsCount(Number(e.target.value))}
            onBlur={saveRoomsCount}
          />
          <Button size="xs" variant="outline" onClick={handlePrintBatch}>
            Arizalarni chop etish
          </Button>
          <Button size="xs" variant="green" onClick={handleAcceptBatch}>
            Arizalarni qabul qilish
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
                      Sana
                    </div>
                  </TableCell>
                  <TableCell isHeader>
                    <div
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                      onClick={() => handleSort("relatives")}
                    >
                      Ariza beruvchi nomi
                    </div>
                  </TableCell>
                  <TableCell isHeader>
                    <div
                      className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                      onClick={() => handleSort("prisoner_name")}
                    >
                      Mahbus nomi
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Davomiyligi</TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>
                    <div
                      className="cursor-pointer"
                      onClick={() => handleSort("status")}
                    >
                      Ariza holati
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Amallar</TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Uchrashuv sanasi</TableCell>
                  <TableCell className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]" isHeader>Chop etish</TableCell>
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
                      {new Date(order.created_at).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white cursor-pointer">
                      {Array.isArray(order.relatives) && order.relatives.length > 0
                        ? order.relatives[0].full_name
                        : "Ma'lumot yo'q"}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white cursor-pointer">{order.prisoner_name}</TableCell>
                    <TableCell className="px-5 py-3">
                      <Badge
                        size="sm"
                        color={order.visit_type === "short" ? "success" : order.visit_type === "long" ? "warning" : "primary"}
                      >
                        {order.visit_type === "short" ? "1 kun" : order.visit_type === "long" ? "2 kun" : "3 kun"}
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
                        O&#39;zgartirish
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
                        Qabul qilish
                      </Button>
                      <Button
                        size="xs"
                        variant="red"
                        disabled={order.status === "canceled" || order.status === "rejected"}
                        onClick={() => {
                          setSelectedOrder(order);
                          setModalType("reject");
                          setRejectionReason("Qoidabuzarlik uchun!");
                        }}
                      >
                        Rad etish
                      </Button>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-black dark:text-white">
                      {order.start_datetime && order.status !== "canceled" && order.status !== "rejected"
                        ? new Date(order.start_datetime).toLocaleDateString("ru-RU")
                        : "Ma'lumot yo'q"}
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <Button size="xs" variant="primary" onClick={() => handlePrint(order)}>
                        Chop etish
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
                Ariza #{selectedOrder.id}
              </h2>
              <div className="mb-4 space-y-2 text-gray-700 dark:text-gray-300">
                <p><strong>Mahbus:</strong> {selectedOrder.prisoner_name}</p>
                <p><strong>Tashrif turi:</strong> {selectedOrder.visit_type === "short" ? "1 kun" : selectedOrder.visit_type === "long" ? "2 kun" : "3 kun"}</p>
                <p><strong>Holat:</strong> {statusMap[selectedOrder.status] || selectedOrder.status}</p>
                <div>
                  <strong>Tashrif buyuruvchilar:</strong>
                  <ul className="ml-4 list-disc mt-1">
                    {Array.isArray(selectedOrder.relatives) && selectedOrder.relatives.length > 0 ? (
                      selectedOrder.relatives.map((r, i) => (
                        <li key={i}>
                          {r.full_name} (pasport: {r.passport})
                        </li>
                      ))
                    ) : (
                      <li>Ma&#39;lumot yo&#39;q</li>
                    )}
                  </ul>
                </div>
              </div>
             {modalType === "view" && (
                <div className="flex flex-col gap-2">
                  <label className="font-medium text-black dark:text-white">
                    Uchrashuv sanasi (minimal 10 kundan keyin):
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
                      Qabul qilish
                    </Button>
                    <Button variant="primary" onClick={() => setModalType(null)}>
                      Yopish
                    </Button>
                  </div>
                </div>
              )}
              {modalType === "reject" && (
                <div className="flex flex-col text-black dark:text-white gap-2">
                  <label className="font-medium">Rad etish sababi:</label>
                  <input
                    type="text"
                    className="border p-2 rounded w-full text-black dark:text-white"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />
                  <div className="flex gap-2 mt-4">
                    <Button variant="red" onClick={handleReject}>
                      Rad etish
                    </Button>
                    <Button variant="primary" onClick={() => setModalType(null)}>
                      Yopish
                    </Button>
                  </div>
                </div>
              )}
              {modalType === "save" && (
                <div className="flex flex-col gap-2">
                  <label className="font-medium text-black dark:text-white">
                    Tasdiqlangan uchrashuv kunlari soni:
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
                          alert("Maksimal 3 kun");
                          return;
                        }
                        handleSave();
                      }}
                    >
                      Saqlash
                    </Button>
                    <Button variant="red" onClick={() => setModalType(null)}>
                      Yopish
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
