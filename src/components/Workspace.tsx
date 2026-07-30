"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { MaterialsPanel } from "@/components/MaterialsPanel";

export function Workspace() {
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <div className="flex flex-col gap-10">
      <ChatPanel onMaterialCreated={() => setRefreshSignal((n) => n + 1)} />
      <MaterialsPanel refreshSignal={refreshSignal} />
    </div>
  );
}
