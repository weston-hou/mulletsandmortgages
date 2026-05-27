"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        background: "#f59e0b", color: "#000", fontWeight: 700,
        padding: "10px 20px", borderRadius: 8, border: "none",
        cursor: "pointer", fontSize: 14,
      }}
    >
      🖨️ Print / Save PDF
    </button>
  );
}
