/**
 * extractText.ts
 * Turns an uploaded contract file's raw bytes into plain text so
 * DealGuardianService (which only ever deals with text — see ai-engine's
 * dealGuardian.service.ts) can analyze it. Supports the formats a creator
 * is realistically going to upload: PDF, DOCX, and plain text.
 */

import { ApiError } from "../../utils/apiError.js";

export async function extractContractText(file: Express.Multer.File): Promise<string> {
  const mime = file.mimetype;

  if (mime === "application/pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(file.buffer);
    return result.text;
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  if (mime === "text/plain") {
    return file.buffer.toString("utf-8");
  }

  throw ApiError.badRequest(
    `Unsupported file type "${mime}". Upload a PDF, DOCX, or plain text file.`
  );
}
