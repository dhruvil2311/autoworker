import React from "react";
import { Link } from "react-router-dom";
import { PlusCircle, SearchX } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  actionTo?: string;
  actionOnClick?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, actionText, actionTo, actionOnClick, icon }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 32px",
        textAlign: "center",
        background: "rgba(255,255,255,0.015)",
        border: "1px dashed rgba(255,255,255,0.14)",
        borderRadius: "12px",
        height: "100%",
        width: "100%"
      }}
    >
      <div style={{ color: "rgba(180, 178, 190, 0.3)", marginBottom: "16px" }}>
        {icon || <SearchX size={40} />}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1rem",
          fontWeight: 700,
          color: "var(--aw-offwhite)",
          marginBottom: "4px"
        }}
      >
        {title}
      </div>
      <p
        style={{
          maxWidth: "420px",
          color: "var(--aw-coolgray)",
          fontSize: "14px",
          marginBottom: "24px",
          lineHeight: 1.6
        }}
      >
        {description}
      </p>
      
      {(actionText && actionTo) && (
        <Link to={actionTo} className="aw-btn-primary">
          <PlusCircle size={16} />
          {actionText}
        </Link>
      )}
      
      {(actionText && actionOnClick) && (
        <button onClick={actionOnClick} className="aw-btn-primary">
          <PlusCircle size={16} />
          {actionText}
        </button>
      )}
    </div>
  );
}
