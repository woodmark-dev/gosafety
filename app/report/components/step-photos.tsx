import Image from "next/image";
import type { IncidentPhoto } from "@/lib/report-types";

type StepPhotosProps = {
  photos: IncidentPhoto[];
  previewUrls: Record<string, string>;
  onOpenCamera: () => void;
  onOpenGallery: () => void;
  onMovePhoto: (photoId: string, direction: -1 | 1) => void;
  onRemovePhoto: (photoId: string) => void;
};

export default function StepPhotos({
  photos,
  previewUrls,
  onOpenCamera,
  onOpenGallery,
  onMovePhoto,
  onRemovePhoto,
}: StepPhotosProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-[#e4ebf2] bg-white p-4 shadow-[0_12px_36px_-28px_rgba(12,30,54,0.45)] md:p-5">
      <div className="inline-flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#e7f7ee] text-[#0a7e49]">
          <svg
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3.5" y="5" width="13" height="10" rx="2" />
            <path d="M7 5V3.8h6V5" />
            <circle cx="10" cy="10" r="2.2" />
          </svg>
        </span>
        <h2 className="text-[30px] font-semibold text-[#0f172a] md:text-[34px]">
          Step 1: Add Photos
        </h2>
      </div>

      <p className="text-[15px] text-slate-600 md:text-base">
        Capture from camera and/or select from gallery. Add at least one image.
      </p>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={onOpenCamera}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0a7e49] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-14px_rgba(10,126,73,0.75)]"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3.5" y="5" width="13" height="10" rx="2" />
            <path d="M7 5V3.8h6V5" />
            <circle cx="10" cy="10" r="2.2" />
          </svg>
          Capture from Camera
        </button>
        <button
          type="button"
          onClick={onOpenGallery}
          className="inline-flex items-center gap-2 rounded-lg border border-[#7cbf98] bg-white px-4 py-2 text-sm font-semibold text-[#0a7e49]"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3.5" y="4" width="13" height="12" rx="2" />
            <path d="m6.5 12 2.2-2.4 2.3 2.2 2-1.8 2 2" />
            <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
          </svg>
          Select from Gallery
        </button>
      </div>

      <div className="rounded-xl border border-[#cfe6d8] bg-[#f7fcf9] px-3 py-2.5 text-[13px] text-[#39634f]">
        <p>
          Camera capture is one photo per shot for broader device compatibility. You can tap Capture
          repeatedly to add multiple camera photos.
        </p>
      </div>

      {photos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No photos yet.
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">Uploaded Photos ({photos.length})</p>
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="rounded-xl border border-[#e4ebf2] p-3.5 shadow-[0_8px_18px_-16px_rgba(20,45,70,0.55)]"
            >
              <div className="flex gap-3">
                <Image
                  src={previewUrls[photo.id] || "/window.svg"}
                  alt={photo.filename}
                  className="h-20 w-28 rounded-lg object-cover"
                  width={80}
                  height={80}
                  unoptimized
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{photo.filename}</p>
                  <p className="text-xs text-slate-500">
                    {photo.source} · {(photo.size / 1024).toFixed(1)} KB · {photo.mimeType}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(photo.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700"
                      onClick={() => onMovePhoto(photo.id, -1)}
                      disabled={index === 0}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700"
                      onClick={() => onMovePhoto(photo.id, 1)}
                      disabled={index === photos.length - 1}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs text-rose-700"
                      onClick={() => onRemovePhoto(photo.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-xl bg-[#eafaf0] px-3 py-2.5 text-sm text-[#0b7a45]">
            {photos.length} photo(s) added from camera.
          </div>
        </div>
      )}
    </div>
  );
}
