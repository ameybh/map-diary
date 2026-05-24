"use client";

import * as React from "react";
import type { DiaryEntry } from "@/lib/types";
import { project } from "@/lib/map";

export function MiniMap({ entry }: { entry: DiaryEntry }) {
  const point = project(entry.lat, entry.lng);

  return (
    <svg className="mini-map" viewBox="0 0 1000 520" aria-hidden="true">
      <rect width="1000" height="520" fill="#f4ecd6" />
      <path
        d="M116 126c30-46 94-66 151-47 39 14 80 10 111 36 27 22 19 59-11 76-25 14-53 18-66 48-16 37-58 47-95 33-34-13-48-42-74-62-31-23-38-51-16-84Z"
        fill="#ffffff"
        stroke="#000"
        strokeWidth="6"
      />
      <path
        d="M463 124c45-25 93-27 139-6 26 12 53 13 82 7 57-13 115 11 151 55 31 39 34 87 8 128-23 36-67 49-108 40-33-7-61 3-88 22-43 30-93 28-132-4-37-30-53-75-38-119 10-30-4-51-28-67-24-16-16-44 14-56Z"
        fill="#dceeb1"
        stroke="#000"
        strokeWidth="6"
      />
      <circle cx={point.x} cy={point.y} r="20" fill="#000" />
    </svg>
  );
}
