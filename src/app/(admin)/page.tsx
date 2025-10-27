import type { Metadata } from "next";
import { EcommerceMetrics } from "@/components/ecommerce/EcommerceMetrics";
import React from "react";
// import MonthlyTarget from "@/components/ecommerce/MonthlyTarget";
// import MonthlySalesChart from "@/components/ecommerce/MonthlySalesChart";
// import StatisticsChart from "@/components/ecommerce/StatisticsChart";
// import RecentOrders from "@/components/ecommerce/RecentOrders";
// import DemographicCard from "@/components/ecommerce/DemographicCard";
import ComponentCard from "@/components/common/ComponentCard";
// import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import AllCallsTable from "@/components/tables/AllCallsTable";

export const metadata: Metadata = {
  title:
    "Smart Dunyo Meet Admin",
  description: "Таблица с данными по всем заявкам",
};

export default function Ecommerce() {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 space-y-6 xl:col-span-12">
        <EcommerceMetrics />

      </div>

      <div className="col-span-12 xl:col-span-12">
        {/* <PageBreadcrumb pageTitle="Таблица с данными по всем заявкам" /> */}
        <div className="space-y-6">
          <ComponentCard>
            <AllCallsTable />
          </ComponentCard>
        </div>
      </div>

      {/* <div className="col-span-12">
        <StatisticsChart />
      </div>

      <div className="col-span-12 xl:col-span-5">
        <DemographicCard />
      </div>

      <div className="col-span-12 xl:col-span-7">
        <RecentOrders />
      </div> */}
    </div>
  );
}
