"use client";

import { useMemo, useRef, useState } from "react";

type DocumentItem = {
  id: string;
  name: string;
  type: string;
  size: string;
  updated: string;
  file: File;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const suggestions = [
  "Summarize this document",
  "What are the key requirements?",
  "What are the important points?",
  "What are the main conclusions?",
];

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileType = (file: File) => {
  const extension = file.name.split(".").pop()?.toUpperCase();

  return extension || "FILE";
};

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocument, setSelectedDocument] =
    useState<DocumentItem | null>(null);

  const [question, setQuestion] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to DocMind AI. Upload a document from your laptop, select it, and ask a question about it.",
    },
  ]);

  // Filter documents when searching
  const filteredDocuments = useMemo(() => {
    return documents.filter((document) =>
      document.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [documents, search]);

  // Open laptop file picker
  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // Handle document upload
  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const extension = file.name
      .split(".")
      .pop()
      ?.toLowerCase();

    // Supported formats
    const allowedTypes = ["pdf", "docx", "txt"];

    if (!extension || !allowedTypes.includes(extension)) {
      alert(
        "Unsupported file type. Please upload a PDF, DOCX, or TXT file."
      );

      event.target.value = "";
      return;
    }

    // 20 MB limit
    const maxSize = 20 * 1024 * 1024;

    if (file.size > maxSize) {
      alert("File size must be less than 20 MB.");

      event.target.value = "";
      return;
    }

    setUploading(true);

    const newDocument: DocumentItem = {
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      type: getFileType(file),
      size: formatFileSize(file.size),
      updated: "Just now",
      file,
    };

    // Add document to knowledge base
    setDocuments((previous) => [
      newDocument,
      ...previous,
    ]);

    // Automatically select uploaded document
    setSelectedDocument(newDocument);

    // Show upload confirmation
    setMessages([
      {
        id: `upload-${Date.now()}`,
        role: "assistant",
        content: `"${file.name}" has been uploaded successfully. You can now ask questions about this document.`,
      },
    ]);

    setUploading(false);

    // Allow uploading the same file again later
    event.target.value = "";
  };

  // Remove document
  const removeDocument = (id: string) => {
    const remainingDocuments = documents.filter(
      (document) => document.id !== id
    );

    setDocuments(remainingDocuments);

    if (selectedDocument?.id === id) {
      setSelectedDocument(
        remainingDocuments[0] || null
      );
    }
  };

  // Ask Gemini about the actual uploaded document
  const askQuestion = async (text?: string) => {
    const finalQuestion = (text ?? question).trim();

    if (!finalQuestion) {
      return;
    }

    // Make sure a document is selected
    if (!selectedDocument) {
      setMessages((previous) => [
        ...previous,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            "Please upload and select a document before asking a question.",
        },
      ]);

      return;
    }

    // Add user's question to chat
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: finalQuestion,
    };

    setMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    setQuestion("");
    setLoading(true);

    try {
      /*
       * IMPORTANT:
       *
       * We are using FormData here instead of JSON.
       *
       * This sends the ACTUAL FILE to the API.
       *
       * Previously we were only sending:
       *
       * document: selectedDocument.name
       *
       * which meant Gemini only knew the filename.
       */

      const formData = new FormData();

      formData.append(
        "question",
        finalQuestion
      );

      formData.append(
        "file",
        selectedDocument.file
      );

      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to generate an answer."
        );
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content:
          data.answer ||
          "I couldn't generate an answer.",
      };

      setMessages((previous) => [
        ...previous,
        assistantMessage,
      ]);
    } catch (error) {
      console.error(
        "Chat request error:",
        error
      );

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong while processing the document.";

      setMessages((previous) => [
        ...previous,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: errorMessage,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="
          .pdf,
          .docx,
          .txt,
          application/pdf,
          application/vnd.openxmlformats-officedocument.wordprocessingml.document,
          text/plain
        "
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ================= HEADER ================= */}

      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6">

          {/* Logo */}
          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 font-bold shadow-lg shadow-indigo-500/20">
              D
            </div>

            <div>
              <h1 className="font-semibold tracking-tight">
                DocMind AI
              </h1>

              <p className="hidden text-xs text-slate-500 sm:block">
                Intelligent Knowledge Workspace
              </p>
            </div>

          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2 sm:gap-3">

            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              AI Online
            </div>

            <button
              type="button"
              className="hidden rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5 sm:block"
            >
              Settings
            </button>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold">
              A
            </div>

          </div>

        </div>
      </header>

      {/* ================= MAIN LAYOUT ================= */}

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 lg:grid-cols-[310px_1fr]">

        {/* ================= SIDEBAR ================= */}

        <aside className="border-b border-white/10 p-4 sm:p-5 lg:min-h-[calc(100vh-64px)] lg:border-b-0 lg:border-r">

          {/* Upload button */}
          <button
            type="button"
            onClick={openFilePicker}
            disabled={uploading}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-medium shadow-lg shadow-indigo-500/10 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Uploading...
              </>
            ) : (
              <>
                <span className="text-xl leading-none">
                  +
                </span>

                Upload Document
              </>
            )}
          </button>

          {/* Supported formats */}
          <div className="mb-5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">

            <p className="text-xs font-medium text-indigo-300">
              Supported files
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              PDF, DOCX and TXT files up to 20 MB.
            </p>

          </div>

          {/* Search */}
          <div className="mb-5">

            <div className="relative">

              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600">
                ⌕
              </span>

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search documents..."
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-9 pr-4 text-sm outline-none transition placeholder:text-slate-600 focus:border-indigo-500/50 focus:bg-white/[0.07]"
              />

            </div>

          </div>

          {/* Knowledge Base title */}
          <div className="mb-3 flex items-center justify-between">

            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Knowledge Base
            </p>

            <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-500">
              {documents.length}
            </span>

          </div>

          {/* Documents */}
          {filteredDocuments.length > 0 ? (

            <div className="space-y-2">

              {filteredDocuments.map(
                (document) => (

                  <div
                    key={document.id}
                    className={`group relative rounded-xl border transition ${
                      selectedDocument?.id ===
                      document.id
                        ? "border-indigo-500/40 bg-indigo-500/10"
                        : "border-transparent hover:border-white/10 hover:bg-white/5"
                    }`}
                  >

                    {/* Select document */}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDocument(
                          document
                        )
                      }
                      className="w-full p-3 pr-10 text-left"
                    >

                      <div className="flex items-start gap-3">

                        {/* File type */}
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                            document.type ===
                            "PDF"
                              ? "bg-red-500/10 text-red-400"
                              : document.type ===
                                "DOCX"
                              ? "bg-blue-500/10 text-blue-400"
                              : "bg-yellow-500/10 text-yellow-400"
                          }`}
                        >
                          {document.type}
                        </div>

                        {/* File information */}
                        <div className="min-w-0">

                          <p className="truncate text-sm font-medium text-slate-200">
                            {document.name}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {document.size} ·{" "}
                            {document.updated}
                          </p>

                        </div>

                      </div>

                    </button>

                    {/* Delete document */}
                    <button
                      type="button"
                      onClick={() =>
                        removeDocument(
                          document.id
                        )
                      }
                      className="absolute right-2 top-3 hidden rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400 group-hover:block"
                      aria-label={`Delete ${document.name}`}
                      title="Remove document"
                    >
                      ×
                    </button>

                  </div>

                )
              )}

            </div>

          ) : (

            /* Empty state */
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">

              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-xl">
                📄
              </div>

              <p className="mt-3 text-sm font-medium text-slate-300">
                No documents
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-600">
                Upload a document to start building
                your knowledge base.
              </p>

            </div>

          )}

          {/* Usage */}
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4">

            <div className="flex items-center justify-between">

              <p className="text-sm font-medium">
                Knowledge usage
              </p>

              <span className="text-xs text-slate-500">
                {documents.length}/10
              </span>

            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">

              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{
                  width: `${Math.min(
                    documents.length * 10,
                    100
                  )}%`,
                }}
              />

            </div>

            <p className="mt-2 text-xs text-slate-600">
              Free workspace
            </p>

          </div>

        </aside>

        {/* ================= CHAT AREA ================= */}

        <section className="flex min-h-[calc(100vh-64px)] flex-col">

          {/* Active document header */}
          <div className="border-b border-white/10 px-4 py-5 sm:px-6">

            {selectedDocument ? (

              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

                <div className="min-w-0">

                  <p className="mb-1 text-xs uppercase tracking-wider text-indigo-400">
                    Active document
                  </p>

                  <div className="flex items-center gap-3">

                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                        selectedDocument.type ===
                        "PDF"
                          ? "bg-red-500/10 text-red-400"
                          : selectedDocument.type ===
                            "DOCX"
                          ? "bg-blue-500/10 text-blue-400"
                          : "bg-yellow-500/10 text-yellow-400"
                      }`}
                    >
                      {selectedDocument.type}
                    </div>

                    <div className="min-w-0">

                      <h2 className="truncate text-lg font-semibold sm:text-xl">
                        {selectedDocument.name}
                      </h2>

                      <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                        {selectedDocument.size} ·
                        Uploaded{" "}
                        {selectedDocument.updated}
                      </p>

                    </div>

                  </div>

                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-400">
                  Ready for questions
                </div>

              </div>

            ) : (

              <div>

                <p className="mb-1 text-xs uppercase tracking-wider text-indigo-400">
                  DocMind AI
                </p>

                <h2 className="text-xl font-semibold">
                  Upload a document to begin
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Your documents will become searchable
                  knowledge.
                </p>

              </div>

            )}

          </div>

          {/* Chat */}
          <div className="flex flex-1 flex-col">

            {/* Messages */}
            <div className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">

              {messages.map((message) => (

                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >

                  {/* AI avatar */}
                  {message.role ===
                    "assistant" && (

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500 font-bold shadow-lg shadow-indigo-500/10">
                      D
                    </div>

                  )}

                  {/* Message */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[80%] sm:px-5 sm:py-4 ${
                      message.role === "user"
                        ? "bg-indigo-500 text-white"
                        : "border border-white/10 bg-white/[0.04] text-slate-300"
                    }`}
                  >
                    {message.content}
                  </div>

                </div>

              ))}

              {/* Loading indicator */}
              {loading && (

                <div className="flex gap-3">

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500 font-bold">
                    D
                  </div>

                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">

                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.3s]" />

                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.15s]" />

                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500" />

                  </div>

                </div>

              )}

            </div>

            {/* Suggestions */}
            {selectedDocument && (

              <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">

                <div className="flex gap-2 overflow-x-auto pb-3">

                  {suggestions.map(
                    (suggestion) => (

                      <button
                        key={suggestion}
                        type="button"
                        onClick={() =>
                          askQuestion(
                            suggestion
                          )
                        }
                        disabled={loading}
                        className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-400 transition hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {suggestion}
                      </button>

                    )
                  )}

                </div>

              </div>

            )}

            {/* Input */}
            <div className="border-t border-white/10 p-4 sm:p-5">

              <div className="mx-auto max-w-4xl">

                <div
                  className={`rounded-2xl border bg-white/[0.04] p-2 shadow-2xl transition ${
                    selectedDocument
                      ? "border-white/10 focus-within:border-indigo-500/30"
                      : "border-white/5 opacity-70"
                  }`}
                >

                  <div className="flex items-end gap-2">

                    <textarea
                      value={question}
                      onChange={(event) =>
                        setQuestion(
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {

                        if (
                          event.key ===
                            "Enter" &&
                          !event.shiftKey
                        ) {

                          event.preventDefault();

                          if (!loading) {
                            askQuestion();
                          }

                        }

                      }}
                      disabled={
                        !selectedDocument ||
                        loading
                      }
                      placeholder={
                        selectedDocument
                          ? "Ask anything about your document..."
                          : "Upload a document first..."
                      }
                      rows={2}
                      className="min-h-[60px] flex-1 resize-none bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 disabled:cursor-not-allowed"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        askQuestion()
                      }
                      disabled={
                        loading ||
                        !question.trim() ||
                        !selectedDocument
                      }
                      className="mb-1 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-medium transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {loading
                        ? "..."
                        : "Ask"}
                    </button>

                  </div>

                </div>

                {/* Input help */}
                <div className="mt-3 flex flex-col items-center justify-between gap-2 text-xs text-slate-600 sm:flex-row">

                  <span>
                    Press Enter to ask · Shift +
                    Enter for a new line
                  </span>

                  <span>
                    DocMind AI may make mistakes.
                    Verify important information.
                  </span>

                </div>

              </div>

            </div>

          </div>

        </section>

      </div>

    </main>
  );
}