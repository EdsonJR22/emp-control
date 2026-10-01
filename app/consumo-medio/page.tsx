import type { Metadata } from "next";
import { AverageConsumption } from "../../components/average-consumption";

export const metadata: Metadata = {
  title: "Consumo médio",
};

export default function AverageConsumptionPage() {
  return <AverageConsumption />;
}
