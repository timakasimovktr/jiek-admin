"use client";
import React, { useState, useRef, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import ruLocale from "@fullcalendar/core/locales/ru";
import {
  EventInput,
  EventContentArg,
  EventClickArg,
} from "@fullcalendar/core";
import { DateClickArg } from "@fullcalendar/interaction";

interface CalendarEvent extends EventInput {
  extendedProps: {
    calendar: string;
  };
}

const Sanitary: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const handleDateClick = async (clickInfo: DateClickArg) => {
    const dateStr = clickInfo.dateStr;
    console.log("Clicked date:", dateStr); // Отладка: дата, на которую кликнули

    // Валидация формата даты
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      setError("Неверный формат даты");
      return;
    }

    // Toggle logic
    const existingEventIndex = events.findIndex((event) => event.start === dateStr);

    if (existingEventIndex !== -1) {
      // Remove
      const updatedEvents = events.filter((event) => event.start !== dateStr);
      setEvents(updatedEvents);
      setError(null);

      try {
        const response = await fetch("/api/change-sanitary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr, action: "remove" }),
        });
        if (!response.ok) {
          throw new Error(`Failed to remove sanitary mark: ${response.statusText}`);
        }
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
      setError(null);

      try {
        const response = await fetch("/api/change-sanitary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr, action: "add" }),
        });
        if (!response.ok) {
          throw new Error(`Failed to add sanitary mark: ${response.statusText}`);
        }
      } catch (error) {
        console.error("Error adding sanitary mark:", error);
        setEvents(events); // Revert
      }
    }
  };

  const handleEventClick = async (clickInfo: EventClickArg) => {
    const dateStr = clickInfo.event.startStr;
    console.log("Clicked event date:", dateStr); // Отладка
    const updatedEvents = events.filter((event) => event.start !== dateStr);
    setEvents(updatedEvents);
    setError(null);

    try {
      const response = await fetch("/api/change-sanitary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, action: "remove" }),
      });
      if (!response.ok) {
        throw new Error(`Failed to remove sanitary mark: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error removing sanitary mark:", error);
      setEvents(events); // Revert
    }
  };

  useEffect(() => {
    fetch("/api/get-sanitary")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch sanitary days: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data: { date: string }[]) => {
        console.log("Received sanitary days:", data); // Отладка: что пришло с API
        setEvents(
          data.map((d) => {
            console.log("Processing date:", d.date); // Отладка каждой даты
            return {
              title: "✕",
              start: d.date,
              extendedProps: { calendar: "danger" },
            };
          })
        );
        setError(null);
      })
      .catch((error) => {
        console.error("Error loading sanitary marks:", error);
      });
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
        />
      </div>
    </div>
  );
};

const renderEventContent = (eventInfo: EventContentArg) => {
  return (
    <div
      className="padding-[20px] max-h-[60px] text-white flex fc-event-main bg-red-700 p-0.5 rounded-sm font-bold text-xs items-center justify-center w-full h-full"
    >
      <div className="fc-event-title">{eventInfo.event.title}</div>
    </div>
  );
};

export default Sanitary;