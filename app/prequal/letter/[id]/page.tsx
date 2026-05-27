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
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PrequalLetterPage({ params }: Props) {
  const { id } = await params;
  const lead = await db.leads.getById(id);
  if (!lead || !lead.prequal_complete) notFound();

  // Find the latest prequal letter stored in conversations
  const convos = await db.conversations.forLead(id);
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
        <PrintButton />
      </div>

      {/* Letter renders as full HTML via dangerouslySetInnerHTML — safe, server-generated only */}
      <div dangerouslySetInnerHTML={{ __html: letterHtml }} />
    </>
  );
}
