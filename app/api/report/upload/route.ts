import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type UploadSource = "camera" | "gallery";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
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

    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const baseDir = path.join(process.cwd(), "public", "uploads", "reports", year, month);
    await mkdir(baseDir, { recursive: true });

    const extension = path.extname(file.name || "").toLowerCase() || ".jpg";
    const baseName = sanitizeFileName(path.basename(file.name || "image", extension));
    const finalName = `${baseName}-${randomUUID()}${extension}`;
    const fullPath = path.join(baseDir, finalName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buffer);

    const publicUrl = `/uploads/reports/${year}/${month}/${finalName}`;

    return NextResponse.json({
      publicUrl,
      serverPath: fullPath,
      source: source ?? "gallery",
      filename: finalName,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
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
