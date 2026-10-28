import React from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
}

export function MetricCard({ label, value, change, trend = "neutral" }: MetricCardProps) {
  const trendClass = trend === "up" ? "positive" : trend === "down" ? "negative" : "";

  return (
    <div className="card metric-card" style={{ display: "flex", flexDirection: "column" }}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {change && (
        <div className={`metric-change ${trendClass}`}>
          {trend === "up" ? "↑ " : trend === "down" ? "↓ " : ""}
          {change}
        </div>
      )}
    </div>
  );
}
