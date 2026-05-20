/**
 * app/prequal/letter/[id]/page.tsx
 * Server-rendered pre-qualification letter viewer.
 * URL: /prequal/letter/:lead_id
 *
 * Retrieves the stored letter HTML from the conversations table
 * and renders it inline. Also offers a print/PDF button.
 */

import { db } from "@/lib/supabase";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export default async function PrequalLetterPage({ params }: Props) {
  const lead = await db.leads.getById(params.id);
  if (!lead || !lead.prequal_complete) notFound();

  // Find the latest prequal letter stored in conversations
  const convos = await db.conversations.forLead(params.id);
  const letterConvo = convos
    .filter(c => (c.metadata as Record<string, unknown>)?.type === "prequal_letter")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  if (!letterConvo) notFound();

  const letterHtml = letterConvo.body;

  return (
    <>
      {/* Print button — floats above the letter */}
      <div style={{
        position: "fixed", top: 16, right: 16, zIndex: 100,
        display: "flex", gap: 8,
      }}>
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
      </div>

      {/* Letter renders as full HTML via dangerouslySetInnerHTML — safe, server-generated only */}
      <div dangerouslySetInnerHTML={{ __html: letterHtml }} />
    </>
  );
}
