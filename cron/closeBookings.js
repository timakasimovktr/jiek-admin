import cron from "node-cron";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_URL = process.env.API_URL || "https://meet.test-dunyo.uz/api/close-expired-bookings";
const CRON_SECRET = process.env.CRON_SECRET || "your-secret-token";

cron.schedule(
  "1 0 * * *",
  async () => {
    try {
      const response = await axios.post(API_URL, {}, {
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });
      console.log(
        `Cron: Закрытие заявок выполнено. Закрыто ${response.data.totalClosedCount} заявок`,
        response.data.closedBookings
      );
    } catch (err) {
      console.error("Cron: Ошибка при вызове API close-expired-bookings:", err.message);
    }
  },
  {
    timezone: "Asia/Tashkent",
  }
);

console.log("Cron-задание для закрытия заявок запущено");