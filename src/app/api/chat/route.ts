import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    console.log(
      "GEMINI_API_KEY loaded:",
      Boolean(apiKey)
    );

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is not being loaded by Next.js. Check .env.local location/name and restart the server.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return NextResponse.json(
        {
          error: "Question is required.",
        },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey.trim(),
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: question,
    });

    return NextResponse.json({
      answer:
        response.text ||
        "Gemini returned an empty response.",
    });
  } catch (error) {
    console.error("GEMINI ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown Gemini error",
      },
      { status: 500 }
    );
  }
}