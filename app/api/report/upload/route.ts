import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type UploadSource = "camera" | "gallery";

type UploadMode = "filesystem" | "inline";

function getUploadMode(): UploadMode {
  const raw = (process.env.UPLOAD_MODE || "").trim().toLowerCase();
  if (raw === "filesystem" || raw === "inline") {
    return raw;
  }

  // Production platforms are often read-only, so use inline fallback by default.
  return process.env.NODE_ENV === "production" ? "inline" : "filesystem";
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function asDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const source = formData.get("source") as UploadSource | null;

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "file is required" }, { status: 400 });
    }

    if (source && source !== "camera" && source !== "gallery") {
      return NextResponse.json({ message: "invalid source" }, { status: 400 });
    }

    const extension = path.extname(file.name || "").toLowerCase() || ".jpg";
    const baseName = sanitizeFileName(path.basename(file.name || "image", extension));
    const finalName = `${baseName}-${randomUUID()}${extension}`;

    const mimeType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadMode = getUploadMode();
    let publicUrl: string;
    let serverPath: string | null = null;

    if (uploadMode === "filesystem") {
      try {
        const now = new Date();
        const year = String(now.getUTCFullYear());
        const month = String(now.getUTCMonth() + 1).padStart(2, "0");
        const baseDir = path.join(process.cwd(), "public", "uploads", "reports", year, month);
        await mkdir(baseDir, { recursive: true });

        const fullPath = path.join(baseDir, finalName);
        await writeFile(fullPath, buffer);

        publicUrl = `/uploads/reports/${year}/${month}/${finalName}`;
        serverPath = fullPath;
      } catch {
        // In production, fall back to inline URLs when local storage is unavailable.
        if (process.env.NODE_ENV !== "production") {
          throw new Error("Could not write upload file to local storage.");
        }
        publicUrl = asDataUrl(buffer, mimeType);
      }
    } else {
      publicUrl = asDataUrl(buffer, mimeType);
    }

    return NextResponse.json({
      publicUrl,
      serverPath,
      source: source ?? "gallery",
      filename: finalName,
      size: file.size,
      mimeType,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Image upload failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
