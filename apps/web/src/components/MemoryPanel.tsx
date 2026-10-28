import React from "react";
import { CheckCircle2, HelpCircle, ShieldAlert, Info } from "lucide-react";

export function MemoryPanel({ memory }: { memory: any }) {
  if (!memory || (!memory.known && !memory.rules && !memory.variables && !memory.unknown)) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px",
          color: "var(--aw-coolgray)",
          height: "100%",
          width: "100%",
          fontFamily: "var(--font-body)"
        }}
      >
        <Info size={48} style={{ opacity: 0.2, marginBottom: "16px" }} />
        <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--aw-offwhite)", marginBottom: "8px", fontFamily: "var(--font-display)" }}>
          Memory Empty
        </div>
        <p style={{ fontSize: "14px", margin: 0 }}>Worker hasn't extracted any specific memory state yet.</p>
      </div>
    );
  }

  const renderList = (items: any[], type: 'known' | 'unknown' | 'rule' | 'variable') => {
    if (!items || items.length === 0) {
      return (
        <div style={{ color: "rgba(180, 178, 190, 0.5)", fontSize: "14px", fontStyle: "italic", fontFamily: "var(--font-mono)" }}>
          None identified
        </div>
      );
    }
    
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {items.map((item, idx) => {
          let icon = <CheckCircle2 size={16} style={{ color: "var(--aw-teal)" }} />;
          let bgClass = "rgba(15, 15, 21, 0.5)"; // graphite
          let borderClass = "rgba(255, 255, 255, 0.07)";
          let hoverBorderClass = "rgba(0, 194, 212, 0.5)";
          
          if (type === 'unknown') {
            icon = <HelpCircle size={16} style={{ color: "var(--aw-amber)" }} />;
            bgClass = "rgba(232, 148, 42, 0.04)";
            borderClass = "rgba(232, 148, 42, 0.2)";
            hoverBorderClass = "rgba(232, 148, 42, 0.5)";
          } else if (type === 'rule') {
            icon = <ShieldAlert size={16} style={{ color: "var(--aw-teal)" }} />;
            borderClass = "rgba(0, 194, 212, 0.2)";
            hoverBorderClass = "rgba(0, 194, 212, 0.6)";
          }

          const text = typeof item === 'string' ? item : (item.content || item.description || JSON.stringify(item));
          
          return (
            <div
              key={idx}
              className="group"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "16px",
                borderRadius: "12px",
                border: `1px solid ${borderClass}`,
                background: bgClass,
                transition: "border-color 0.2s ease",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = hoverBorderClass)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = borderClass)}
            >
              <div style={{ marginTop: "2px", flexShrink: 0 }}>{icon}</div>
              <div style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--aw-offwhite)", fontWeight: 500 }}>{text}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", width: "100%", fontFamily: "var(--font-body)" }}>
      <div style={{ marginBottom: "32px", borderBottom: "1px solid rgba(255, 255, 255, 0.07)", paddingBottom: "16px" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 700, color: "var(--aw-offwhite)", marginBottom: "8px", letterSpacing: "-0.015em" }}>
          Worker Knowledge Base
        </h2>
        <p style={{ fontSize: "14px", color: "var(--aw-coolgray)", margin: 0 }}>
          The structured facts and rules extracted from evidence and instructions.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "32px" }} className="md:grid-cols-2">
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <div>
            <h3 style={{ fontSize: "11px", fontWeight: 700, color: "var(--aw-coolgray)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.07)", paddingBottom: "8px" }}>
              Known Facts
            </h3>
            {renderList(memory.known || memory.facts || [], 'known')}
          </div>
          
          <div>
            <h3 style={{ fontSize: "11px", fontWeight: 700, color: "var(--aw-teal)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.07)", paddingBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="aw-breathe" style={{ width: "6px", height: "6px", background: "var(--aw-teal)", borderRadius: "50%", boxShadow: "0 0 8px rgba(0,194,212,0.8)" }}></span> Business Rules
            </h3>
            {renderList(memory.rules || [], 'rule')}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <div>
            <h3 style={{ fontSize: "11px", fontWeight: 700, color: "var(--aw-amber)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px", borderBottom: "1px solid rgba(232, 148, 42, 0.2)", paddingBottom: "8px" }}>
              Unknowns & Risks
            </h3>
            {renderList(memory.unknown || memory.risks || [], 'unknown')}
          </div>

          <div>
            <h3 style={{ fontSize: "11px", fontWeight: 700, color: "var(--aw-coolgray)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.07)", paddingBottom: "8px" }}>
              Variables Detected
            </h3>
            {renderList(memory.variables || [], 'variable')}
          </div>
        </div>
      </div>
    </div>
  );
}
