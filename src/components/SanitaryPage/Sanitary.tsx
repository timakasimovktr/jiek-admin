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
  const calendarRef = useRef<FullCalendar>(null);

  const handleDateClick = async (clickInfo: DateClickArg) => {
    const dateStr = clickInfo.dateStr;

    // Toggle logic
    const existingEventIndex = events.findIndex((event) => event.start === dateStr); // Изменено: start вместо startStr

    if (existingEventIndex !== -1) {
      // Remove
      const updatedEvents = events.filter((event) => event.start !== dateStr); // Изменено: start вместо startStr
      setEvents(updatedEvents);

      try {
        await fetch("/change-sanitary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr, action: "remove" }),
        });
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
        await fetch("/change-sanitary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr, action: "add" }),
        });
      } catch (error) {
        console.error("Error adding sanitary mark:", error);
        setEvents(events); // Revert
      }
    }
  };

  const handleEventClick = async (clickInfo: EventClickArg) => {
    const dateStr = clickInfo.event.startStr; // Здесь startStr ок, т.к. это EventApi
    const updatedEvents = events.filter((event) => event.start !== dateStr); // Изменено: start вместо startStr
    setEvents(updatedEvents);

    try {
      await fetch("/change-sanitary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, action: "remove" }),
      });
    } catch (error) {
      console.error("Error removing sanitary mark:", error);
      setEvents(events); // Revert
    }
  };

  // Load initial events
  useEffect(() => {
    fetch("/get-sanitary")
      .then((res) => res.json())
      .then((data: { date: string }[]) =>
        setEvents(
          data.map((d) => ({
            title: "✕",
            start: d.date,
            extendedProps: { calendar: "danger" },
          }))
        )
      )
      .catch((error) => console.error("Error loading sanitary marks:", error));
  }, []);

  return (
    <div className="w-[740px] mx-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
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
          height="300px" // Фиксированная высота для стабильности при скролле
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
      className={`padding-[20px] max-h-[60px] text-white flex fc-event-main bg-red-700 p-0.5 rounded-sm font-bold text-xs items-center justify-center w-full h-full`}
    >
      <div className="fc-event-title">{eventInfo.event.title}</div>
    </div>
  );
};

export default Sanitary;