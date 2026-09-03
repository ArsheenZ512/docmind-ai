import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";

const MODEL = "gemini-3.7-flash";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// Split large documents into manageable sections
function splitText(text: string, maxChars = 30000): string[] {
  const cleanText = text
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleanText) {
    return [];
  }

  const chunks: string[] = [];

  for (let i = 0; i < cleanText.length; i += maxChars) {
    chunks.push(cleanText.slice(i, i + maxChars));
  }

  return chunks;
}

// Extract text from PDF, DOCX, or TXT
async function extractDocumentText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const fileName = file.name.toLowerCase();

  // -----------------------------
  // TXT
  // -----------------------------
  if (fileName.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  // -----------------------------
  // DOCX
  // -----------------------------
  if (fileName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({
      buffer,
    });

    return result.value;
  }

  // -----------------------------
  // PDF
  // -----------------------------
  if (fileName.endsWith(".pdf")) {
    const parser = new PDFParse({
      data: buffer,
    });

    const result = await parser.getText();

    return result.text;
  }

  throw new Error(
    "Unsupported file type. Please upload a PDF, DOCX, or TXT file."
  );
}

// Ask Gemini
async function askGemini(
  ai: GoogleGenAI,
  prompt: string
): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  return response.text || "";
}

// =============================
// POST /api/chat
// =============================
export async function POST(request: Request) {
  try {
    // -----------------------------
    // 1. Check API key
    // -----------------------------
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is missing. Check your .env.local file.",
        },
        { status: 500 }
      );
    }

    // -----------------------------
    // 2. Read FormData
    // -----------------------------
    const formData = await request.formData();

    const file = formData.get("file");
    const questionValue = formData.get("question");

    // -----------------------------
    // 3. Validate file
    // -----------------------------
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "Please upload a document.",
        },
        { status: 400 }
      );
    }

    // -----------------------------
    // 4. Validate question
    // -----------------------------
    const question =
      typeof questionValue === "string"
        ? questionValue.trim()
        : "";

    if (!question) {
      return NextResponse.json(
        {
          error: "Question is required.",
        },
        { status: 400 }
      );
    }

    // -----------------------------
    // 5. Validate file size
    // -----------------------------
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: "File is too large. Maximum size is 20 MB.",
        },
        { status: 400 }
      );
    }

    // -----------------------------
    // 6. Validate file type
    // -----------------------------
    const allowedExtensions = [
      ".pdf",
      ".docx",
      ".txt",
    ];

    const fileName = file.name.toLowerCase();

    const extension = fileName.includes(".")
      ? fileName.slice(fileName.lastIndexOf("."))
      : "";

    if (!allowedExtensions.includes(extension)) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Please upload PDF, DOCX, or TXT.",
        },
        { status: 400 }
      );
    }

    console.log("=================================");
    console.log("Processing document:", file.name);
    console.log("File type:", extension);
    console.log("File size:", file.size);
    console.log("=================================");

    // -----------------------------
    // 7. Extract document text
    // -----------------------------
    const documentText = await extractDocumentText(file);

    console.log(
      "Extracted characters:",
      documentText.length
    );

    // -----------------------------
    // 8. Check extracted text
    // -----------------------------
    if (!documentText.trim()) {
      return NextResponse.json(
        {
          error:
            "I couldn't extract readable text from this document. If this is a scanned PDF, OCR support will be needed.",
        },
        { status: 400 }
      );
    }

    // -----------------------------
    // 9. Create Gemini client
    // -----------------------------
    const ai = new GoogleGenAI({
      apiKey: apiKey.trim(),
    });

    // -----------------------------
    // 10. Split document
    // -----------------------------
    const chunks = splitText(documentText);

    console.log("Document chunks:", chunks.length);

    if (chunks.length === 0) {
      return NextResponse.json(
        {
          error:
            "No readable content was found in the document.",
        },
        { status: 400 }
      );
    }

    // -----------------------------
    // 11. Build context
    // -----------------------------
    let context = "";

    // Small / medium document
    if (chunks.length <= 8) {
      context = chunks
        .map(
          (chunk, index) =>
            `DOCUMENT SECTION ${index + 1}:\n${chunk}`
        )
        .join("\n\n");
    }

    // Large document
    else {
      console.log(
        `Large document detected: ${chunks.length} chunks`
      );

      const chunkSummaries: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        console.log(
          `Summarizing chunk ${i + 1}/${chunks.length}`
        );

        const summaryPrompt = `
You are processing part ${i + 1} of ${chunks.length}
of a document.

Create a concise factual summary of this section.

Keep important information such as:

- Names
- Dates
- Requirements
- Numbers
- Decisions
- Definitions
- Important facts
- Conclusions

Do not invent information.

DOCUMENT SECTION:

${chunks[i]}
`;

        const summary = await askGemini(
          ai,
          summaryPrompt
        );

        chunkSummaries.push(summary);
      }

      context = chunkSummaries
        .map(
          (summary, index) =>
            `SECTION SUMMARY ${index + 1}:\n${summary}`
        )
        .join("\n\n");
    }

    // -----------------------------
    // 12. Final question prompt
    // -----------------------------
    const finalPrompt = `
You are DocMind AI, an intelligent document analysis assistant.

The user uploaded this document:

FILE NAME:
${file.name}

You have access to the document content below.

==============================
DOCUMENT CONTENT
==============================

${context}

==============================
END DOCUMENT
==============================

USER QUESTION:
${question}

==============================
INSTRUCTIONS
==============================

1. Answer the user's question based ONLY on the provided document content.

2. Do not invent facts, names, dates, numbers, requirements, or conclusions.

3. If the requested information cannot be found in the document, say:

"I couldn't find that information in the uploaded document."

4. If the user asks for a summary, provide a clear and organized summary.

5. If the user asks about requirements, use bullet points.

6. If the user asks about specific facts, dates, names, or numbers, preserve them accurately.

7. If appropriate, mention the relevant document section.

8. Do not say that the document is missing. The document content is provided above.

9. Keep the answer professional, clear, and easy to understand.

10. Do not answer using outside knowledge unless the user specifically asks for information unrelated to the document.
`;

    // -----------------------------
    // 13. Ask Gemini
    // -----------------------------
    let answer = "";

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(
          `Sending request to Gemini (attempt ${attempt})...`
        );

        answer = await askGemini(
          ai,
          finalPrompt
        );

        break;
      } catch (error) {
        console.error(
          `Gemini attempt ${attempt} failed:`,
          error
        );

        if (attempt === 2) {
          throw error;
        }

        // Wait before retry
        await new Promise((resolve) =>
          setTimeout(resolve, 1500)
        );
      }
    }

    // -----------------------------
    // 14. Check Gemini response
    // -----------------------------
    if (!answer) {
      return NextResponse.json(
        {
          error:
            "Gemini returned an empty response.",
        },
        { status: 500 }
      );
    }

    console.log("Gemini response received.");

    // -----------------------------
    // 15. Return response
    // -----------------------------
    return NextResponse.json({
      answer,
      fileName: file.name,
    });
  } catch (error) {
    console.error(
      "================================="
    );

    console.error(
      "DOCUMENT AI ERROR:",
      error
    );

    console.error(
      "================================="
    );

    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong while processing the document.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}