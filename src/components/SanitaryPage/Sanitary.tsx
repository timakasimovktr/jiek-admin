"use client";
import React, { useState, useRef, useEffect, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { DateClickArg } from "@fullcalendar/interaction";
import ruLocale from "@fullcalendar/core/locales/ru";
import { EventInput, EventContentArg, EventClickArg } from "@fullcalendar/core";
import axios from "axios";

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
  colony_application_number?: string | number;
}

interface CalendarEvent extends EventInput {
  extendedProps: {
    calendar: string;
  };
}

const Sanitary: React.FC = () => {
  const [tableData, setTableData] = useState<Order[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

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

  useEffect(() => {
    fetchData();
  }, []);

  // 🔹 Вычисляем последнюю дату заявки
  const lastOrderDate = useMemo(() => {
    if (!tableData.length) return null;

    const allDates = tableData
      .map((o) => o.start_datetime || o.created_at)
      .filter(Boolean)
      .map((d) => new Date(d));

    return new Date(Math.max(...allDates.map((d) => d.getTime())));
  }, [tableData]);

  const handleDateClick = async (clickInfo: DateClickArg) => {
    const dateStr = clickInfo.dateStr;
    const clickedDate = new Date(dateStr);

    // 🔹 Проверка — нельзя ставить крестики до последней заявки включительно
    if (lastOrderDate && clickedDate <= lastOrderDate) {
      setError("Нельзя отмечать санитарные дни до последней заявки включительно");
      return;
    }

    setError(null);
    const existingEventIndex = events.findIndex((event) => event.start === dateStr);

    if (existingEventIndex !== -1) {
      // Remove
      const updatedEvents = events.filter((event) => event.start !== dateStr);
      setEvents(updatedEvents);

      try {
        const response = await fetch("/api/change-sanitary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr, action: "remove" }),
        });
        if (!response.ok) throw new Error(`Failed to remove sanitary mark`);
      } catch (error) {
        console.error("Error removing sanitary mark:", error);
        setEvents(events); // Revert
      }
    } else {
      // Add
      const newEvent: CalendarEvent = {
        title: "✕",
        start: dateStr,
        extendedProps: { calendar: "danger" },
      };
      const updatedEvents = [...events, newEvent];
      setEvents(updatedEvents);

      try {
        const response = await fetch("/api/change-sanitary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr, action: "add" }),
        });
        if (!response.ok) throw new Error(`Failed to add sanitary mark`);
      } catch (error) {
        console.error("Error adding sanitary mark:", error);
        setEvents(events); // Revert
      }
    }
  };

  const handleEventClick = async (clickInfo: EventClickArg) => {
    const dateStr = clickInfo.event.startStr;
    const updatedEvents = events.filter((event) => event.start !== dateStr);
    setEvents(updatedEvents);
    setError(null);

    try {
      const response = await fetch("/api/change-sanitary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, action: "remove" }),
      });
      if (!response.ok) throw new Error(`Failed to remove sanitary mark`);
    } catch (error) {
      console.error("Error removing sanitary mark:", error);
      setEvents(events); // Revert
    }
  };

  useEffect(() => {
    fetch("/api/get-sanitary")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch sanitary days`);
        return res.json();
      })
      .then((data: { date: string }[]) => {
        setEvents(
          data.map((d) => ({
            title: "✕",
            start: d.date,
            extendedProps: { calendar: "danger" },
          }))
        );
      })
      .catch((error) => console.error("Error loading sanitary marks:", error));
  }, []);

  return (
    <div className="w-[740px] mx-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
      {error && (
        <div className="p-2 text-red-600 bg-red-100 border border-red-200 rounded">
          {error}
        </div>
      )}
      <div className="custom-calendar overflow-hidden">
        <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={ruLocale}
        headerToolbar={{
          left: "prev,next",
          center: "title",
          right: "today",
        }}
        events={events}
        height="300px"
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        eventContent={renderEventContent}
        dayMaxEvents={Infinity}
        dayCellDidMount={(arg) => {
          // Если дата <= последней заявки — затемняем ячейку
          if (lastOrderDate && new Date(arg.date) <= lastOrderDate) {
            arg.el.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
            arg.el.style.pointerEvents = "none"; // чтобы нельзя было кликнуть
            arg.el.style.opacity = "0.6";
          }
        }}
      />
      </div>
    </div>
  );
};

const renderEventContent = (eventInfo: EventContentArg) => {
  return (
    <div className="max-h-[60px] text-white flex fc-event-main bg-red-700 p-0.5 rounded-sm font-bold text-xs items-center justify-center w-full h-full">
      <div className="fc-event-title">{eventInfo.event.title}</div>
    </div>
  );
};

export default Sanitary;
