"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { MaterialsPanel } from "@/components/MaterialsPanel";
import { ReferenceFoldersCard } from "@/components/ReferenceFoldersCard";
import type { DriveFolderAccessResult } from "@/lib/drive-folders";

interface WorkspaceProps {
  folderHealth: DriveFolderAccessResult[] | null;
}

export function Workspace({ folderHealth }: WorkspaceProps) {
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <ChatPanel onMaterialCreated={() => setRefreshSignal((n) => n + 1)} />
      <div className="flex flex-col gap-8">
        <ReferenceFoldersCard initialHealth={folderHealth} />
        <MaterialsPanel refreshSignal={refreshSignal} />
      </div>
    </div>
  );
}
